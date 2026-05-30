"""
Neon (PostgreSQL) write helpers for the player_form pipeline.
Uses the DATABASE_URL env var with a service-level connection — pipeline-only.
"""

import json
import logging
import os
import unicodedata
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

_conn = None


def get_conn():
    global _conn
    if _conn is None or _conn.closed:
        database_url = os.environ["DATABASE_URL"]
        _conn = psycopg2.connect(database_url)
        _conn.autocommit = True
    return _conn


def normalize_name(name: str) -> str:
    """
    Strip diacritics, lowercase, collapse whitespace.
    Must match the normalization in src/lib/player-form-db.ts.
    """
    normalized = unicodedata.normalize("NFD", name)
    ascii_name = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    return " ".join(ascii_name.lower().split())


def upsert_player_form(
    fotmob_id: int,
    player_name: str,
    matches: list[dict],
    form_label: str | None,
    form_summary: str | None,
) -> None:
    conn = get_conn()
    now = datetime.now(timezone.utc).isoformat()

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO player_form (
                fotmob_id, player_name, player_name_normalized,
                fetched_at, match_count, matches, form_label, form_summary
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fotmob_id) DO UPDATE SET
                player_name            = EXCLUDED.player_name,
                player_name_normalized = EXCLUDED.player_name_normalized,
                fetched_at             = EXCLUDED.fetched_at,
                match_count            = EXCLUDED.match_count,
                matches                = EXCLUDED.matches,
                form_label             = EXCLUDED.form_label,
                form_summary           = EXCLUDED.form_summary
            """,
            (
                fotmob_id,
                player_name,
                normalize_name(player_name),
                now,
                len(matches),
                psycopg2.extras.Json(matches),
                form_label,
                form_summary,
            ),
        )

    logger.info(f"Upserted {player_name} ({fotmob_id}): {form_label} — {form_summary}")
