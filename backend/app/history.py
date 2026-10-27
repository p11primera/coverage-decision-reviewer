"""SQLite-backed server-side message history + append-only audit trail."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

from pydantic_ai.messages import ModelMessage, ModelMessagesTypeAdapter

DEFAULT_DB_PATH = os.environ.get('DATABASE_PATH', 'data/reviewer.db')

_SCHEMA = """
CREATE TABLE IF NOT EXISTS history (
    thread_id   TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    message_json TEXT NOT NULL,
    PRIMARY KEY (thread_id, seq)
);
CREATE TABLE IF NOT EXISTS audit (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id    TEXT NOT NULL,
    at           TEXT NOT NULL,
    actor        TEXT NOT NULL,
    action       TEXT NOT NULL,
    decision     TEXT,
    rationale    TEXT,
    tool_call_id TEXT,
    detail       TEXT
);
"""


class HistoryStore:
    """Persist pydantic-ai ModelMessages per AG-UI threadId (server owns history)."""

    def __init__(self, path: str | os.PathLike[str] = DEFAULT_DB_PATH) -> None:
        self.path = Path(path)

    async def init(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        async with aiosqlite.connect(self.path) as db:
            await db.executescript(_SCHEMA)
            await db.commit()

    async def load(self, thread_id: str) -> list[ModelMessage]:
        async with aiosqlite.connect(self.path) as db:
            async with db.execute(
                'SELECT message_json FROM history WHERE thread_id = ? ORDER BY seq', (thread_id,)
            ) as cursor:
                rows = await cursor.fetchall()
        messages: list[ModelMessage] = []
        for row in rows:
            messages.extend(ModelMessagesTypeAdapter.validate_json(row[0]))
        return messages

    async def append(self, thread_id: str, messages_json: bytes) -> None:
        """Persist new messages from a `ModelMessagesTypeAdapter.dump_json(...)` JSON array blob."""
        if not messages_json or messages_json.strip() in (b'', b'[]'):
            return
        messages = ModelMessagesTypeAdapter.validate_json(messages_json)
        if not messages:
            return
        async with aiosqlite.connect(self.path) as db:
            async with db.execute('SELECT COALESCE(MAX(seq), -1) FROM history WHERE thread_id = ?', (thread_id,)) as c:
                seq = (await c.fetchone())[0] + 1
            await db.executemany(
                'INSERT INTO history (thread_id, seq, message_json) VALUES (?, ?, ?)',
                [
                    (thread_id, seq + i, ModelMessagesTypeAdapter.dump_json([message]).decode())
                    for i, message in enumerate(messages)
                ],
            )
            await db.commit()

    async def append_audit(
        self,
        thread_id: str,
        *,
        actor: str,
        action: str,
        decision: str | None = None,
        rationale: str | None = None,
        tool_call_id: str | None = None,
        detail: dict | None = None,
    ) -> None:
        async with aiosqlite.connect(self.path) as db:
            await db.execute(
                'INSERT INTO audit (thread_id, at, actor, action, decision, rationale, tool_call_id, detail)'
                ' VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                (
                    thread_id,
                    datetime.now(timezone.utc).isoformat(),
                    actor,
                    action,
                    decision,
                    rationale,
                    tool_call_id,
                    json.dumps(detail) if detail is not None else None,
                ),
            )
            await db.commit()
