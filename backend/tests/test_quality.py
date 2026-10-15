"""出片质量：时长画像、时间线校正、评分对齐与筛选兜底（不调模型）"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.pipeline.quality import (
    align_scores, excerpt_between, profile_for, refine_timeline, select_clips,
    to_seconds, to_srt_time,
)


def _cue(s, e, text="x"):
    return {"start_time": to_srt_time(s), "end_time": to_srt_time(e), "text": text}


def test_profile_short_video_does_not_use_podcast_minimums():
    p = profile_for(5 * 60)
    assert p.tier == "short"
    assert p.min_clip_sec <= 30
    assert p.max_clip_sec <= 180
    assert p.topics_hint[1] <= 8
    hint = p.prompt_hint()
    assert "本次任务参数" in hint and "5 分" in hint
    assert "90 秒" in hint  # 明确覆盖旧规则


def test_profile_long_keeps_podcast_scale():
    p = profile_for(72 * 60)
    assert p.tier == "long"
    assert p.min_clip_sec >= 60
    assert p.topics_hint[0] >= 6


def test_refine_snaps_to_cue_and_drops_too_short():
    # 0–80s，每条 cue 2 秒。短视频档 min=20s。
    cues = [_cue(i, i + 2, f"c{i}") for i in range(0, 80, 2)]
    items = [
        {"outline": "可延长", "start_time": "00:00:20,200", "end_time": "00:00:28,000", "content": ["b"]},
        {"outline": "重叠甲", "start_time": "00:00:40,000", "end_time": "00:01:10,000", "content": ["c"]},
        {"outline": "重叠乙", "start_time": "00:00:50,000", "end_time": "00:01:08,000", "content": ["d"]},
        # 片尾 3 秒、与前一段空档 > 5s、后面没 cue 可延 → 丢弃
        {"outline": "太短", "start_time": "00:01:17,000", "end_time": "00:01:19,400", "content": ["a"]},
    ]
    out, report = refine_timeline(items, cues, profile_for(300))
    titles = [_t(x) for x in out]
    assert "太短" not in titles
    assert any(d.get("outline") == "太短" for d in report["dropped"])
    extend = next(x for x in out if x["outline"] == "可延长")
    assert extend["duration_sec"] >= 20
    assert "snap" in extend["refine"]["ops"]
    assert report["output"] <= 3
    assert any(m.get("absorbed") == "重叠乙" for m in report["merged"])
    for x in out:
        assert x["duration_sec"] >= 20
        assert abs(to_seconds(x["start_time"]) % 2) < 1e-6


def _t(x):
    o = x.get("outline")
    return o if isinstance(o, str) else str(o)


def test_align_scores_falls_back_when_count_mismatch():
    clips = [
        {"outline": "甲", "id": "1"},
        {"outline": "乙", "id": "2"},
        {"outline": "丙", "id": "3"},
    ]
    llm = [{"outline": "乙", "final_score": 0.9, "recommend_reason": "好"}]
    scored, stats = align_scores(clips, llm)
    assert stats["matched"] == 1 and stats["fallback"] == 2
    by = {c["outline"]: c for c in scored}
    assert by["乙"]["final_score"] == 0.9
    assert by["甲"]["score_source"] == "fallback"
    assert by["甲"]["final_score"] == 0.5


def test_align_scores_normalizes_0_10_scale():
    clips = [{"outline": "甲"}]
    scored, _ = align_scores(clips, [{"outline": "甲", "final_score": 8, "recommend_reason": "x"}])
    assert scored[0]["final_score"] == 0.8


def test_select_clips_keeps_top_k_when_all_below_threshold():
    scored = [
        {"id": "1", "final_score": 0.4, "outline": "a"},
        {"id": "2", "final_score": 0.3, "outline": "b"},
        {"id": "3", "final_score": 0.2, "outline": "c"},
    ]
    p = profile_for(300)  # min_keep=3
    chosen, info = select_clips(scored, 0.7, p)
    assert len(chosen) == 3
    assert info["fallback_selected"] == 3
    assert all(c["selected_by"] == "fallback" for c in chosen)


def test_excerpt_between_truncates():
    cues = [_cue(0, 2, "一二三四五六七八九十" * 20), _cue(2, 4, "后段")]
    text = excerpt_between(cues, 0, 3, max_chars=20)
    assert len(text) == 20


def test_end_never_stops_mid_sentence_without_punctuation():
    from backend.pipeline.quality import _Cue, _to_sentence_end
    # fala corrida sem pontuação; maior pausa (1.0s) depois do cue 2
    cues = [_Cue(0, 2, "a"), _Cue(2.1, 4, "b"), _Cue(4.1, 6, "c"), _Cue(7.0, 9, "d"), _Cue(9.1, 40, "e")]
    assert _to_sentence_end(0, cues, max_fwd=8.0) == 2


def test_start_backs_up_to_sentence_beginning():
    from backend.pipeline.quality import _Cue, _to_sentence_start
    cues = [_Cue(0, 2, "Fim."), _Cue(2.1, 4, "começo da ideia"), _Cue(4.1, 6, "continua"), _Cue(6.1, 8, "mais")]
    assert _to_sentence_start(3, cues) == 1


def test_end_respects_next_clip_limit():
    from backend.pipeline.quality import _Cue, _to_sentence_end
    cues = [_Cue(0, 2, "a"), _Cue(2.1, 4, "b"), _Cue(4.1, 6, "c."), _Cue(6.1, 8, "d")]
    assert cues[_to_sentence_end(0, cues, limit=4.0)].end <= 4.0


def test_five_minute_video_requires_at_least_three_clips():
    assert profile_for(5 * 60).min_keep == 3


def test_twenty_minute_video_requires_at_least_eight_clips():
    assert profile_for(20 * 60).min_keep == 8


def test_old_ten_point_threshold_does_not_discard_good_clips():
    scored = [{"id": str(i), "final_score": 0.9, "outline": f"t{i}"} for i in range(1, 6)]
    chosen, info = select_clips(scored, 7.0, profile_for(300))
    assert len(chosen) == 5 and info["fallback_selected"] == 0


def test_sponsor_segment_is_dropped():
    scored = [
        {"id": "1", "final_score": 0.95, "outline": "Patrocinio", "excerpt": "use o codigo AUTO no link na descricao e ganhe desconto com o cupom"},
        {"id": "2", "final_score": 0.6, "outline": "historia", "excerpt": "e entao ele contou como perdeu tudo e recomecou do zero"},
    ]
    chosen, _ = select_clips(scored, 0.7, profile_for(120))
    assert [c["id"] for c in chosen] == ["2"]


def test_top_up_reaches_minimum_when_ai_returns_one_clip():
    from backend.pipeline.quality import top_up_clips
    cues = [_cue(i, i + 3, f"frase numero {i} sobre o assunto.") for i in range(0, 300, 3)]
    one = [{"id": "1", "start_time": to_srt_time(0), "end_time": to_srt_time(60), "outline": "a", "final_score": 0.9}]
    out, added = top_up_clips(one, cues, profile_for(300))
    assert len(out) >= 3 and added >= 2
    spans = sorted((to_seconds(c["start_time"]), to_seconds(c["end_time"])) for c in out)
    assert all(spans[k][1] <= spans[k + 1][0] for k in range(len(spans) - 1))
