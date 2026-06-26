"""audit.py — append-only audit trail helper."""

import json

import asyncpg


async def write_audit(conn: asyncpg.Connection, *, company_id: str, user_id: str | None,
                      action: str, entity: str, entity_id: str | None,
                      meta: dict | None = None):
    """Record an action inside the caller's transaction so it commits
    atomically with the change it describes."""
    await conn.execute(
        """
        INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, meta)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        """,
        company_id, user_id, action, entity, entity_id,
        json.dumps(meta or {}, default=str),
    )
