"""
Entry point for the player_form pipeline.
Loops through PLAYER_IDS, fetches recent match data from FotMob,
computes form label + summary, upserts to Supabase.

Usage:
  cd pipeline
  python main.py

Errors on individual players are logged and skipped — the run continues.
"""

import asyncio
import logging
import os
import sys

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

from fetcher import fetch_player_matches
from form import compute_form
from player_ids import PLAYER_IDS
from supabase_client import upsert_player_form


async def run() -> None:
    required = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        logger.error(f"Missing env vars: {', '.join(missing)}")
        sys.exit(1)

    total = len(PLAYER_IDS)
    succeeded = 0
    skipped = 0

    for fotmob_id, player_name in PLAYER_IDS.items():
        logger.info(f"Fetching {player_name} ({fotmob_id}) …")
        try:
            matches = await fetch_player_matches(fotmob_id, max_matches=20)

            if not matches:
                logger.warning(f"  Skipping {player_name} — no match data returned")
                skipped += 1
                continue

            form_label, form_summary = compute_form(matches)
            upsert_player_form(fotmob_id, player_name, matches, form_label, form_summary)
            succeeded += 1

        except Exception as e:
            logger.error(f"  Failed {player_name}: {e}", exc_info=True)
            skipped += 1

    logger.info(f"Done. {succeeded}/{total} succeeded, {skipped} skipped.")
    if skipped == total:
        # All players failed — likely the endpoint is blocked
        logger.error("All players failed. FotMob may be unreachable from this IP.")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run())
