"""
Fetches recent match data per player from FotMob using the fotmob-api package.
Wraps fotmob.com/api/playerData — the same endpoint the Vercel app can't reach.
Running this from a non-cloud IP (local machine or GitHub Actions) should work.
"""

import asyncio
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


async def fetch_player_matches(fotmob_id: int, max_matches: int = 20) -> list[dict]:
    """
    Fetch recent matches for a player. Returns a list of canonical match dicts.
    Returns [] on any error — callers should treat empty as "skip this player".
    """
    try:
        from fotmob import FotMob  # import inside function so import errors are non-fatal
    except ImportError as e:
        logger.error(f"fotmob-api package not installed: {e}")
        return []

    try:
        fm = FotMob()
        raw = await fm.get_player(player_id=fotmob_id)
    except Exception as e:
        logger.error(f"[{fotmob_id}] FotMob request failed: {e}")
        return []

    if not raw or not isinstance(raw, dict):
        logger.warning(f"[{fotmob_id}] Empty or non-dict response")
        return []

    logger.debug(f"[{fotmob_id}] Top-level keys: {list(raw.keys())}")
    return _parse_matches(raw, max_matches)


def _parse_matches(raw: dict, max_matches: int) -> list[dict]:
    # Try each known field name for recent match arrays.
    # Log which one worked so we can prune dead branches after a real run.
    field_names = ["recentMatches", "recentResults", "matchHistory", "matches"]
    match_list = None
    for field in field_names:
        candidate = raw.get(field)
        if isinstance(candidate, list) and len(candidate) > 0:
            logger.debug(f"Using field '{field}' ({len(candidate)} items)")
            match_list = candidate
            break

    if match_list is None:
        logger.warning(f"No match array found. Available keys: {list(raw.keys())}")
        return []

    results = []
    for item in match_list[:max_matches]:
        parsed = _parse_match_item(item)
        if parsed:
            results.append(parsed)

    logger.info(f"Parsed {len(results)}/{min(len(match_list), max_matches)} match items")
    return results


def _parse_match_item(item: dict) -> dict | None:
    if not isinstance(item, dict):
        return None
    try:
        # Rating — FotMob returns {"num": 7.2} or a bare float
        rating_raw = item.get("rating") or item.get("fotmobRating")
        if isinstance(rating_raw, dict):
            rating = float(rating_raw.get("num") or 0)
        else:
            rating = float(rating_raw or 0)

        # Date
        date_raw = (
            item.get("date")
            or item.get("matchDate")
            or (item.get("status") or {}).get("startTimeStr")
            or ""
        )
        date = _normalize_date(str(date_raw))

        # Opponent — try flat field first, then structured home/away
        opponent = (
            item.get("opponent")
            or item.get("opponentName")
            or _extract_opponent(item)
        )

        # Stats — may be flat on item or nested under playerProps
        props = item.get("playerProps") if isinstance(item.get("playerProps"), dict) else item
        goals = int(props.get("goals") or 0)
        assists = int(props.get("assists") or 0)
        minutes = int(props.get("minutesPlayed") or props.get("minutes") or 0)
        position = str(props.get("positionId") or props.get("position") or "")

        return {
            "date": date,
            "opponent": str(opponent or "Unknown"),
            "rating": round(rating, 1) if rating > 0 else None,
            "goals": goals,
            "assists": assists,
            "minutes": minutes,
            "position": position,
        }
    except Exception as e:
        logger.debug(f"Skipping unparseable match item ({e}): {item}")
        return None


def _normalize_date(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return ""
    if len(raw) == 10 and raw[4] == "-":
        return raw  # already YYYY-MM-DD
    if len(raw) == 8 and raw.isdigit():
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return raw


def _extract_opponent(item: dict) -> str:
    home = item.get("home")
    away = item.get("away")
    if isinstance(home, dict) and isinstance(away, dict):
        return f"{home.get('name', '?')} vs {away.get('name', '?')}"
    return "Unknown"
