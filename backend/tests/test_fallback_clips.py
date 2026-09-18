from backend.pipeline.fallback_clips import build_fallback_clips


def test_build_fallback_clips_covers_subtitle_timeline():
    entries = []
    for index in range(18):
        start = index * 10
        end = start + 9
        entries.append({
            "start_time": f"00:{start // 60:02d}:{start % 60:02d},000",
            "end_time": f"00:{end // 60:02d}:{end % 60:02d},000",
            "text": f"Conteúdo relevante do trecho {index + 1}.",
        })

    clips = build_fallback_clips(entries)

    assert len(clips) >= 3
    assert clips[0]["start_time"] == entries[0]["start_time"]
    assert clips[-1]["end_time"] == entries[-1]["end_time"]
    assert all(clip["fallback_generated"] for clip in clips)
    assert all(clip["generated_title"] for clip in clips)