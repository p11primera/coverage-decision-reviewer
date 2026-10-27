"""Shared review state pushed to the frontend via AG-UI state events."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class ReviewRequest(BaseModel):
    patient_summary: str = ''
    cpt: str = ''
    notes: str = ''


class RuleFinding(BaseModel):
    rule_id: str
    cpt: str
    criteria: str = ''
    outcome_guidance: str = ''


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class ReviewState(BaseModel):
    request: ReviewRequest | None = None
    checked_count: int = 0
    total_checks: int = 0
    findings: list[RuleFinding] = Field(default_factory=list)
    risk_score: str | None = None
    recommendation: str | None = None
    citations: list[str] = Field(default_factory=list)
    audit_events: list[dict[str, Any]] = Field(default_factory=list)

    def record(self, action: str, **fields: Any) -> None:
        """Append an audit-able entry to the in-run state."""
        self.audit_events.append({'action': action, 'at': _utcnow(), **fields})
