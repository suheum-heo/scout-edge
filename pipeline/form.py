"""
Computes form_label and form_summary from a list of parsed match dicts.
No external dependencies — pure functions.
"""

IMPROVE_RATING_THRESHOLD = 0.3   # avg rating delta last-5 vs prior
IMPROVE_GA_THRESHOLD = 0.15      # G+A per game delta when ratings unavailable
MIN_RATED_MATCHES = 3            # need at least this many rated matches to use rating path


def compute_form(matches: list[dict]) -> tuple[str | None, str | None]:
    """
    Returns (form_label, form_summary).
      form_label:   'Improving' | 'Declining' | 'Consistent' | None
      form_summary: e.g. "7.2 avg rating (last 5), 3G 1A in 15 games"
    Returns (None, None) when there isn't enough data.
    """
    if not matches:
        return None, None

    recent = matches[:5]
    prior = matches[5:]

    recent_rated = [m for m in recent if m.get("rating") and m["rating"] > 0]
    prior_rated = [m for m in prior if m.get("rating") and m["rating"] > 0]

    if len(recent_rated) >= MIN_RATED_MATCHES:
        recent_avg = _mean_rating(recent_rated)
        prior_avg = _mean_rating(prior_rated) if prior_rated else None
        label = _label_from_rating_delta(recent_avg, prior_avg)
        summary = _build_summary(matches, recent_avg=recent_avg)
    else:
        label = _label_from_ga_delta(recent, prior)
        summary = _build_summary(matches, recent_avg=None)

    return label, summary


def _mean_rating(matches: list[dict]) -> float:
    ratings = [m["rating"] for m in matches if m.get("rating") and m["rating"] > 0]
    return sum(ratings) / len(ratings) if ratings else 0.0


def _label_from_rating_delta(recent_avg: float, prior_avg: float | None) -> str:
    if prior_avg is None:
        return "Consistent"
    delta = recent_avg - prior_avg
    if delta >= IMPROVE_RATING_THRESHOLD:
        return "Improving"
    if delta <= -IMPROVE_RATING_THRESHOLD:
        return "Declining"
    return "Consistent"


def _label_from_ga_delta(recent: list[dict], prior: list[dict]) -> str:
    def ga_per_game(ms: list[dict]) -> float:
        played = [m for m in ms if m.get("minutes", 0) > 0]
        if not played:
            return 0.0
        return sum(m.get("goals", 0) + m.get("assists", 0) for m in played) / len(played)

    if not prior:
        return "Consistent"
    delta = ga_per_game(recent) - ga_per_game(prior)
    if delta >= IMPROVE_GA_THRESHOLD:
        return "Improving"
    if delta <= -IMPROVE_GA_THRESHOLD:
        return "Declining"
    return "Consistent"


def _build_summary(matches: list[dict], recent_avg: float | None) -> str:
    n = len(matches)
    goals = sum(m.get("goals", 0) for m in matches)
    assists = sum(m.get("assists", 0) for m in matches)
    parts = []
    if recent_avg is not None and recent_avg > 0:
        parts.append(f"{recent_avg:.1f} avg rating (last 5)")
    parts.append(f"{goals}G {assists}A in {n} games")
    return ", ".join(parts)
