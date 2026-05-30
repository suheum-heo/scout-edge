"""
Supabase write helpers for the player_form pipeline.
Uses the service role key — only run server-side / in the pipeline.
"""

import logging
import os
from datetime import datetime, timezone

from supabase import create_client, Client

logger = logging.getLogger(__name__)

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_KEY"]
        _client = create_client(url, key)
    return _client


def normalize_name(name: str) -> str:
    """
    Strip diacritics, lowercase, collapse whitespace.
    Must match the normalization in src/lib/player-form-db.ts.
    """
    import unicodedata
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
    client = get_client()
    now = datetime.now(timezone.utc).isoformat()

    row = {
        "fotmob_id": fotmob_id,
        "player_name": player_name,
        "player_name_normalized": normalize_name(player_name),
        "fetched_at": now,
        "match_count": len(matches),
        "matches": matches,
        "form_label": form_label,
        "form_summary": form_summary,
    }

    result = client.table("player_form").upsert(row, on_conflict="fotmob_id").execute()
    if hasattr(result, "error") and result.error:
        raise RuntimeError(f"Supabase upsert failed for {player_name}: {result.error}")
    logger.info(f"Upserted {player_name} ({fotmob_id}): {form_label} — {form_summary}")
