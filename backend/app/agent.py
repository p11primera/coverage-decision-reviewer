"""The coverage-reviewer agent: model wiring, tools, and instructions."""

from __future__ import annotations

import asyncio
import json
import os
import random
from dataclasses import dataclass
from pathlib import Path

from ag_ui.core import StateDeltaEvent, StateSnapshotEvent

from pydantic_ai import Agent, RunContext, ToolFailed, ToolReturn
from pydantic_ai.messages import CustomEvent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.tools import DeferredToolRequests
from pydantic_ai.ui import StateDeps

from .state import ReviewState, RuleFinding

FIXTURES_DIR = Path(__file__).parent / 'fixtures'

LLM_BASE_URL = os.environ.get('LLM_BASE_URL', 'http://spark.chat:8000/v1')
LLM_MODEL = os.environ.get('LLM_MODEL', 'nvidia/Qwen3.8-Flash-Next-FP4-Local')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', 'local-vllm')
FLAKY_ALWAYS_FAIL = os.environ.get('FLAKY_ALWAYS_FAIL', '0') == '1'


def _load_fixture(name: str) -> list[dict]:
    return json.loads((FIXTURES_DIR / name).read_text())


POLICIES = _load_fixture('policies.json')
COVERAGE_RULES = _load_fixture('coverage_rules.json')


@dataclass(kw_only=True)
class ReviewProgressEvent(CustomEvent, name='review_progress'):
    """Streaming progress emitted from inside the long claim-checks tool."""

    checked: int = 0
    total: int = 0
    check: str = ''


def build_model() -> OpenAIChatModel:
    return OpenAIChatModel(
        LLM_MODEL,
        provider=OpenAIProvider(base_url=LLM_BASE_URL, api_key=OPENAI_API_KEY),
    )


INSTRUCTIONS = """\
You are a clinical coverage reviewer for a health plan. The user message contains a
prior-authorization request as JSON with fields: patient_summary, cpt, notes.

Review every request in EXACTLY this tool order, calling each tool exactly once unless
stated otherwise. Never skip a tool and never call them out of order:

1. lookup_coverage_rule(cpt) with the request's CPT code.
2. run_claim_checks(checks) — pass a list of 4 short check names derived from the request
   (for example ["medical necessity", "documentation completeness", "policy criteria",
   "coding validity"]).
3. score_claim_risk(cpt). This tool is unreliable and may report a timeout failure. Call it
   at most twice in total; if it fails again, state that risk scoring was unavailable and
   continue — never loop on it.
4. propose_decision(decision, rationale, cited_policy_ids) — ALWAYS your final action.
   decision is "approve" or "deny", rationale is 2-4 sentences, cited_policy_ids lists the
   policy IDs you cited.

Before calling propose_decision, write a short review narrative (2-4 sentences) as your
text response. The narrative MUST cite the seeded policy corpus inline with bracketed
policy IDs, e.g. [POL-102], and base approve/deny on the rule findings and check results
returned by the tools. Answer factually from tool output only.\
"""


def create_agent() -> Agent[StateDeps[ReviewState], str | DeferredToolRequests]:
    agent: Agent[StateDeps[ReviewState], str | DeferredToolRequests] = Agent(
        build_model(),
        name='coverage_reviewer',
        deps_type=StateDeps[ReviewState],
        output_type=[str, DeferredToolRequests],
        instructions=INSTRUCTIONS,
        model_settings={'temperature': 0},
    )

    @agent.tool
    async def lookup_coverage_rule(ctx: RunContext[StateDeps[ReviewState]], cpt: str) -> ToolReturn:
        """Look up seeded coverage rules for a CPT/HCPCS code. Must be called first."""
        rules = [r for r in COVERAGE_RULES if r['cpt'] == cpt]
        state = ctx.deps.state
        state.checked_count += len(rules)
        seen = {r['rule_id'] for r in rules}
        state.findings = [f for f in state.findings if f.rule_id not in seen]
        for rule in rules:
            state.findings.append(RuleFinding(**rule))
            state.record('lookup_coverage_rule', rule_id=rule['rule_id'], cpt=cpt)
        delta = StateDeltaEvent(
            delta=[
                {'op': 'replace', 'path': '/checked_count', 'value': state.checked_count},
                {'op': 'replace', 'path': '/findings', 'value': [f.model_dump() for f in state.findings]},
            ]
        )
        return ToolReturn(
            return_value=json.dumps({'cpt': cpt, 'rules': rules}),
            metadata=delta,
        )

    @agent.tool
    async def run_claim_checks(ctx: RunContext[StateDeps[ReviewState]], checks: list[str]) -> ToolReturn:
        """Run the long claim-check sweep. Must be called second. Emits live progress."""
        state = ctx.deps.state
        total = max(1, len(checks))
        state.total_checks = total
        results = []
        for i, check in enumerate(checks, start=1):
            await ctx.emit(ReviewProgressEvent(checked=i, total=total, check=check))
            await asyncio.sleep(0.2)
            results.append({'check': check, 'status': 'pass'})
        state.checked_count += total
        state.record('run_claim_checks', checks=checks)
        snapshot = StateSnapshotEvent(snapshot=state.model_dump(mode='json'))
        return ToolReturn(
            return_value=json.dumps({'checks': results, 'all_passed': True}),
            metadata=snapshot,
        )

    @agent.tool
    async def score_claim_risk(ctx: RunContext[StateDeps[ReviewState]], cpt: str) -> str:
        """Score claim fraud/medical-necessity risk. Must be called third; may time out."""
        state = ctx.deps.state
        try:
            if FLAKY_ALWAYS_FAIL or random.random() < 0.5:
                raise asyncio.TimeoutError('risk-scoring upstream timed out')
        except asyncio.TimeoutError:
            state.risk_score = 'unavailable'
            state.record('score_claim_risk_failed', cpt=cpt)
            raise ToolFailed('Risk scoring service timed out. Report that risk scoring is unavailable and continue.') from None
        state.risk_score = 'low'
        state.record('score_claim_risk', cpt=cpt, risk='low')
        return json.dumps({'cpt': cpt, 'risk_score': 'low', 'factors': []})

    @agent.tool_plain(requires_approval=True)
    def propose_decision(decision: str, rationale: str, cited_policy_ids: list[str]) -> str:
        """Propose the final coverage decision. Always the last call; requires reviewer approval."""
        return (
            f'Decision "{decision}" proposed with rationale: {rationale} '
            f'Cited policies: {", ".join(cited_policy_ids) or "none"}. Awaiting reviewer approval.'
        )

    return agent


agent = create_agent()
