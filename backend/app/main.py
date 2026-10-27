"""FastAPI app: single POST /agent (+ /) AG-UI route, cancel endpoint, healthz."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from pydantic_ai import CancellationToken, ModelSettings, UsageLimits
from pydantic_ai.messages import ModelMessagesTypeAdapter
from pydantic_ai.tools import DeferredToolRequests
from pydantic_ai.ui import StateDeps
from pydantic_ai.ui.ag_ui import AGUIAdapter

from .agent import agent
from .history import HistoryStore, DEFAULT_DB_PATH
from .state import ReviewState

logger = logging.getLogger('coverage_reviewer')

store = HistoryStore(os.environ.get('DATABASE_PATH', DEFAULT_DB_PATH))

# threadId -> live CancellationToken
_cancel_tokens: dict[str, CancellationToken] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    await store.init()
    yield


app = FastAPI(title='Coverage Decision Reviewer', version='0.1.0', lifespan=lifespan)


async def _agent_endpoint(request: Request) -> Any:
    run_input = AGUIAdapter.build_run_input(await request.body())
    thread_id = run_input.thread_id

    history = await store.load(thread_id)
    before = len(history)
    token = CancellationToken()
    _cancel_tokens[thread_id] = token

    deps: StateDeps[ReviewState] = StateDeps(state=ReviewState())

    async def on_complete(result) -> None:
        _cancel_tokens.pop(thread_id, None)
        if isinstance(result.output, DeferredToolRequests):
            for call in result.output.approvals:
                if call.tool_name == 'propose_decision':
                    try:
                        args = call.args_as_dict()
                    except Exception:
                        continue
                    deps.state.recommendation = args.get('decision')
                    deps.state.citations = list(args.get('cited_policy_ids') or [])
                    deps.state.record('decision_proposed', tool_call_id=call.tool_call_id, **args)
        await store.append(thread_id, result.new_messages_json())

    async def on_cancelled(cancelled) -> None:
        _cancel_tokens.pop(thread_id, None)
        messages_json = ModelMessagesTypeAdapter.dump_json(cancelled.all_messages()[before:])
        await store.append(thread_id, messages_json)
        await store.append_audit(thread_id, actor='system', action='run_cancelled')

    # Append-only audit rows for reviewer decisions arriving via resume[].
    for entry in run_input.resume or []:
        payload = entry.payload or {}
        approved = bool(isinstance(payload, dict) and payload.get('approved'))
        await store.append_audit(
            thread_id,
            actor='reviewer',
            action='decision_resolved',
            decision='approve' if approved else 'deny',
            rationale=(payload or {}).get('reason') if isinstance(payload, dict) else None,
            tool_call_id=entry.interrupt_id.removeprefix('int-'),
            detail={'status': entry.status, 'payload': payload},
        )

    return await AGUIAdapter.dispatch_request(
        request,
        agent=agent,
        deps=deps,
        message_history=history,
        cancellation_token=token,
        model_settings=ModelSettings(temperature=0),
        usage_limits=UsageLimits(request_limit=12),
        on_complete=on_complete,
        on_cancel=on_cancelled,
    )


app.add_api_route('/agent', _agent_endpoint, methods=['POST'])
app.add_api_route('/', _agent_endpoint, methods=['POST'])


@app.post('/cancel/{thread_id}')
async def cancel(thread_id: str) -> JSONResponse:
    token = _cancel_tokens.get(thread_id)
    if token is None:
        return JSONResponse({'status': 'not_found', 'thread_id': thread_id}, status_code=404)
    token.cancel()
    return JSONResponse({'status': 'cancelled', 'thread_id': thread_id})


@app.get('/healthz')
async def healthz() -> dict[str, str]:
    return {'status': 'ok'}
