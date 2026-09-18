"""Deterministic clip generation used when AI analysis is unavailable.

The regular pipeline remains the preferred path. This fallback converts the
subtitle timeline into useful, non-overlapping cuts so an imported video never
finishes successfully with zero clips merely because an LLM call failed.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Sequence

from .quality import DurationProfile, profile_from_srt, to_seconds


def _title_from_entries(entries: Sequence[Dict[str, Any]], index: int) -> str:
    text = " ".join(str(entry.get("text") or "").strip() for entry in entries).strip()
    text = re.sub(r"\s+", " ", text)
    if not text:
        return f"Trecho {index}"
    sentence = re.split(r"(?<=[.!?])\s+", text, maxsplit=1)[0].strip()
    if len(sentence) > 72:
        sentence = sentence[:69].rstrip() + "..."
    return sentence or f"Trecho {index}"


def build_fallback_clips(
    srt_entries: Sequence[Dict[str, Any]],
    profile: DurationProfile | None = None,
) -> List[Dict[str, Any]]:
    """Split subtitles into balanced ranges aligned to subtitle boundaries."""
    valid_entries: List[Dict[str, Any]] = []
    for entry in srt_entries:
        try:
            start = to_seconds(entry["start_time"])
            end = to_seconds(entry["end_time"])
        except (KeyError, TypeError, ValueError):
            continue
        if end > start:
            valid_entries.append(dict(entry))

    if not valid_entries:
        return []

    profile = profile or profile_from_srt(valid_entries)
    total = to_seconds(valid_entries[-1]["end_time"])
    target = sum(profile.target_clip_sec) / 2
    desired = max(profile.topics_hint[0], round(total / max(target, 1)))
    count = max(1, min(profile.max_clips, profile.topics_hint[1], desired))
    ideal_span = total / count

    groups: List[List[Dict[str, Any]]] = []
    current: List[Dict[str, Any]] = []
    next_boundary = ideal_span
    for entry in valid_entries:
        current.append(entry)
        end = to_seconds(entry["end_time"])
        if len(groups) < count - 1 and end >= next_boundary:
            groups.append(current)
            current = []
            next_boundary = ideal_span * (len(groups) + 1)
    if current:
        groups.append(current)

    # Avoid a tiny final cut by merging it into the previous range.
    if len(groups) > 1:
        last_duration = to_seconds(groups[-1][-1]["end_time"]) - to_seconds(groups[-1][0]["start_time"])
        if last_duration < profile.min_clip_sec:
            groups[-2].extend(groups.pop())

    clips: List[Dict[str, Any]] = []
    for index, entries in enumerate(groups, 1):
        title = _title_from_entries(entries, index)
        clips.append({
            "id": str(index),
            "outline": title,
            "content": " ".join(str(entry.get("text") or "").strip() for entry in entries).strip(),
            "start_time": entries[0]["start_time"],
            "end_time": entries[-1]["end_time"],
            "generated_title": title,
            "final_score": 0.7,
            "recommend_reason": "Corte criado automaticamente a partir das legendas.",
            "chunk_index": 0,
            "fallback_generated": True,
        })
    return clips