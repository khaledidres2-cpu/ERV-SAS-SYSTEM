"""db.py — asyncpg pool + tenant-scoped connection helpers."""

import os
from contextlib import asynccontextmanager

import asyncpg

DATABASE_URL = os.environ["DATABASE_URL"]

_pool: asyncpg.Pool | None = None


async def init_pool():
    global _pool
    _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10, command_timeout=30)


async def close_pool():
    if _pool:
        await _pool.close()


def pool() -> asyncpg.Pool:
    assert _pool is not None, "DB pool not initialised"
    return _pool


@asynccontextmanager
async def tenant_tx(company_id: str):
    """One transaction with Row-Level Security bound to a company.
    Used by request handlers AND by webhooks (which have no JWT)."""
    async with pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SELECT set_config('app.current_company_id', $1, true)", str(company_id)
            )
            yield conn


# FastAPI dependency variant (yields the connection for a request)
async def tenant_conn_dep(company_id: str):
    async with tenant_tx(company_id) as conn:
        yield conn


@asynccontextmanager
async def raw_tx():
    """Connection without tenant context (auth lookups, webhook routing)."""
    async with pool().acquire() as conn:
        yield conn
