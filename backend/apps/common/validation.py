from rest_framework import exceptions


def parse_strict_bool(raw_value, *, field="is_active"):
    """Strict query-string boolean: only 'true'/'1' or 'false'/'0'
    (case-insensitive) are accepted - anything else is a 400, not a
    silent fallback to False/True.
    """
    normalized = raw_value.strip().lower()
    if normalized in ("true", "1"):
        return True
    if normalized in ("false", "0"):
        return False
    raise exceptions.ValidationError({field: "Must be 'true' or 'false'."})


def parse_int_filter(raw_value, *, field):
    """Strict integer query-string filter (e.g. ?category=3): anything
    that does not parse as a base-10 integer is a 400, matching
    parse_strict_bool's "reject clearly, never silently fall back to an
    empty/broken filter" rule above.
    """
    try:
        return int(raw_value)
    except (TypeError, ValueError):
        raise exceptions.ValidationError({field: "Must be an integer id."})
