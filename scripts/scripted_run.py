#!/usr/bin/env python3
"""Scripted AG-UI run: POST a RunAgentInput for a sample prior-auth request, stream raw SSE.

Usage:
    uv run python scripts/scripted_run.py
    uv run python scripts/scripted_run.py --resume approve "clinically appropriate"

The raw SSE is printed to stdout and teed to out/sse_capture.txt (or out/sse_resume.txt
with --resume). --resume resolves the propose_decision interrupt recorded in the capture.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
import uuid
from pathlib import Path

DEFAULT_URL = 'http://localhost:8100/agent'
OUT_DIR = Path(__file__).parent.parent / 'out'

SAMPLE_REQUEST = {
    'patient_summary': (
        '52-year-old male with 8 weeks of progressive low back pain radiating to the left leg, '
        'worsening foot drop, and saddle numbness. History of treated renal cell carcinoma.'
    ),
    'cpt': '72148',
    'notes': (
        'Neurologic exam shows 3/5 left ankle dorsiflexion and reduced anal sphincter tone. '
        'NSAIDs and physical therapy have not relieved symptoms. MRI lumbar spine without '
        'contrast requested to rule out cauda equina compression and metastatic disease.'
    ),
}


def build_body(thread_id: str, resume: list[dict] | None) -> bytes:
    body: dict = {
        'threadId': thread_id,
        'runId': str(uuid.uuid4()),
        'state': {'request': SAMPLE_REQUEST},
        'messages': (
            []
            if resume
            else [{'id': str(uuid.uuid4()), 'role': 'user', 'content': json.dumps(SAMPLE_REQUEST)}]
        ),
        'tools': [],
        'context': [],
        'forwardedProps': {'user': 'dev-reviewer'},
    }
    if resume:
        body['resume'] = resume
    return json.dumps(body).encode()


def stream_sse(url: str, body: bytes, capture: Path) -> list[str]:
    capture.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        url,
        data=body,
        headers={'Content-Type': 'application/json', 'Accept': 'text/event-stream'},
        method='POST',
    )
    lines: list[str] = []
    with urllib.request.urlopen(request) as response, capture.open('w') as sink:
        for raw in response:
            line = raw.decode('utf-8').rstrip('\r\n')
            print(line, flush=True)
            sink.write(line + '\n')
            lines.append(line)
    return lines


def event_types(lines: list[str]) -> list[str]:
    types = []
    for line in lines:
        if line.startswith('data:'):
            try:
                types.append(json.loads(line[5:].strip())['type'])
            except (json.JSONDecodeError, KeyError):
                pass
    return types


def find_propose_decision_tool_call_id(capture: Path) -> str:
    tool_call_id: str | None = None
    for line in capture.read_text().splitlines():
        if not line.startswith('data:'):
            continue
        try:
            event = json.loads(line[5:].strip())
        except json.JSONDecodeError:
            continue
        if event.get('type') == 'TOOL_CALL_START' and event.get('toolCallName') == 'propose_decision':
            tool_call_id = event['toolCallId']
    if tool_call_id is None:
        sys.exit(f'error: no propose_decision TOOL_CALL_START found in {capture}; run without --resume first')
    return tool_call_id


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default=DEFAULT_URL)
    parser.add_argument('--thread', default='thread-pa-demo-001')
    parser.add_argument('--resume', nargs=2, metavar=('DECISION', 'RATIONALE'),
                        help='resume the interrupted propose_decision call, e.g. --resume approve "clinically appropriate"')
    parser.add_argument('--capture', type=Path, default=None, help='raw SSE capture path (default out/sse_capture.txt)')
    parser.add_argument('--source', type=Path, default=OUT_DIR / 'sse_capture.txt',
                        help='capture file to read the interrupted tool_call_id from for --resume')
    args = parser.parse_args()

    resume = None
    if args.resume:
        decision, rationale = args.resume
        approved = decision.strip().lower() == 'approve'
        tool_call_id = find_propose_decision_tool_call_id(args.source)
        resume = [
            {
                'interruptId': f'int-{tool_call_id}',
                'status': 'resolved',
                'payload': {'approved': approved, 'reason': rationale},
            }
        ]
        print(f'# resuming interrupt int-{tool_call_id} approved={approved}', file=sys.stderr)

    capture = args.capture or (OUT_DIR / ('sse_resume.txt' if resume else 'sse_capture.txt'))
    lines = stream_sse(args.url, build_body(args.thread, resume), capture)
    types = event_types(lines)
    print(f'# {len(types)} events: {" ".join(dict.fromkeys(types))}', file=sys.stderr)
    print(f'# raw SSE saved to {capture}', file=sys.stderr)


if __name__ == '__main__':
    main()
