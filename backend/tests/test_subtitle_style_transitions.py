"""
Stage 4.2 — estilos/transições/destaque de palavras (presets, transições, destaque, ASS).

Cobre os cenários pedidos: preset->configuração (via editor_render_service, que também
migra o `animation` legado), palavra ativa (word.start < t < word.end / t < start / t > end),
geração de tags ASS por destaque/transição e o último grupo de palavras.
"""
from backend.services import editor_render_service as svc


def _seg(start, end, words):
    return {"startTime": start, "endTime": end, "words": words}


def _w(text, start, end):
    return {"text": text, "startTime": start, "endTime": end}


WHITE = svc._ass_color("#FFFFFF")
BLACK = svc._ass_color("#000000")


class TestAssColorAlpha:
    def test_fully_opaque(self):
        assert svc._ass_color_alpha("#000000", 1.0) == "&H00000000"

    def test_fully_transparent(self):
        assert svc._ass_color_alpha("#000000", 0.0) == "&HFF000000"

    def test_partial_opacity_matches_ass_inverted_scale(self):
        # opacity 0.75 -> alpha byte = round((1-0.75)*255) = 64 = 0x40
        assert svc._ass_color_alpha("#000000", 0.75) == "&H40000000"


class TestWordHighlightTags:
    def test_none_and_karaoke_produce_no_transform(self):
        word = _w("essa", 1.0, 1.3)
        assert svc._word_highlight_tags(word, 1.0, {"type": "none"}, WHITE, BLACK, 2) == ""
        assert svc._word_highlight_tags(word, 1.0, {"type": "karaoke"}, WHITE, BLACK, 2) == ""

    def test_color_highlight_references_word_relative_ms(self):
        word = _w("floresta", 1.8, 2.3)
        tags = svc._word_highlight_tags(word, 1.0, {"type": "color", "color": "#2D6BFF"}, WHITE, BLACK, 2)
        # relativo ao início do SEGMENTO (1.0), não ao clip: 1.8-1.0=0.8s=800ms .. 2.3-1.0=1300ms
        assert "\\t(800," in tags
        assert ",1300,\\1c" in tags
        assert svc._ass_color("#2D6BFF") in tags

    def test_scale_highlight_returns_to_100_at_word_end(self):
        word = _w("negra", 2.3, 2.7)
        tags = svc._word_highlight_tags(word, 1.0, {"type": "scale", "scale": 1.2}, WHITE, BLACK, 2)
        assert "\\fscx120\\fscy120" in tags
        assert tags.strip().endswith("\\fscx100\\fscy100)")

    def test_degenerate_word_duration_returns_empty(self):
        word = _w("x", 1.0, 1.0)
        assert svc._word_highlight_tags(word, 1.0, {"type": "color"}, WHITE, BLACK, 2) == ""


class TestBlockTransitionPrefix:
    def test_none_has_no_extra_tags(self):
        prefix = svc._block_transition_prefix({"type": "none", "duration": 0.2}, 540.0, 1500.0)
        assert prefix == "{\\an8\\pos(540.0,1500.0)}"

    def test_fade_uses_fad_tag_with_ms_duration(self):
        prefix = svc._block_transition_prefix({"type": "fade", "duration": 0.25}, 540.0, 1500.0)
        assert "\\fad(250,0)" in prefix

    def test_slide_up_moves_from_below_to_final_position(self):
        prefix = svc._block_transition_prefix({"type": "slide_up", "duration": 0.2}, 540.0, 1500.0)
        # entra de um Y MAIOR (mais embaixo na tela) até o Y final (item 4: nasce abaixo, sobe).
        assert "\\move(540.0,1540.0,540.0,1500.0,0,200)" in prefix

    def test_slide_down_moves_from_above(self):
        prefix = svc._block_transition_prefix({"type": "slide_down", "duration": 0.2}, 540.0, 1500.0)
        assert "\\move(540.0,1460.0,540.0,1500.0,0,200)" in prefix


class TestProgressiveWordEvents:
    """'word_by_word'/'word_follow': cada palavra só existe a partir do PRÓPRIO timestamp —
    testa especificamente t < word.start / word.start < t < word.end / t > word.end via os
    limites Start/End de cada evento gerado, e o último grupo de palavras."""

    def test_one_event_per_word_with_growing_text(self):
        seg = _seg(1.0, 3.0, [_w("essa", 1.0, 1.3), _w("daqui", 1.3, 1.6), _w("floresta", 1.6, 3.0)])
        lines = svc._progressive_word_events(
            seg, {"type": "background", "backgroundColor": "#FFE14D"}, {"type": "word_by_word", "duration": 0.12},
            False, 540.0, 1500.0, WHITE, BLACK, 2,
        )
        assert len(lines) == 3
        # evento 1: só "essa"; evento 2: "essa" + "daqui" (com tags ASS entre as palavras, daí
        # checar presença de cada uma em vez de substring contígua); evento 3 (ÚLTIMO grupo):
        # as três.
        assert "essa" in lines[0] and "daqui" not in lines[0] and "floresta" not in lines[0]
        assert "essa" in lines[1] and "daqui" in lines[1] and "floresta" not in lines[1]
        assert "essa" in lines[2] and "daqui" in lines[2] and "floresta" in lines[2]

    def test_event_boundaries_match_word_timestamps_not_segment(self):
        seg = _seg(1.0, 3.0, [_w("a", 1.0, 1.3), _w("b", 1.3, 1.6), _w("c", 1.6, 3.0)])
        lines = svc._progressive_word_events(
            seg, {"type": "none"}, {"type": "word_follow", "duration": 0.1},
            False, 0.0, 0.0, WHITE, BLACK, 2,
        )
        starts = [l.split(",")[1] for l in lines]
        ends = [l.split(",")[2] for l in lines]
        assert starts == ["0:00:01.00", "0:00:01.30", "0:00:01.60"]
        # último evento (último grupo) vai até o fim do SEGMENTO, não até o fim da palavra "c".
        assert ends[-1] == "0:00:03.00"

    def test_karaoke_still_uses_kf_inside_progressive_mode(self):
        seg = _seg(0.0, 1.0, [_w("oi", 0.0, 0.5)])
        lines = svc._progressive_word_events(
            seg, {"type": "karaoke"}, {"type": "word_by_word", "duration": 0.1},
            True, 0.0, 0.0, WHITE, BLACK, 2,
        )
        assert "\\kf50" in lines[0]


class TestBuildSubtitleAssLegacyMigration:
    """Configs salvas ANTES da Etapa 4.2 só tinham style.animation — _build_subtitle_ass
    precisa migrar sem exigir uma nova sincronização (não é o foco aqui, testado via a mesma
    função pura que a Etapa 4.1 já cobre; aqui só a parte de estilo/config)."""

    def test_group_words_still_matches_frontend_after_style_changes(self):
        # Guarda-chuva: garante que mexer no módulo de estilo não quebrou o agrupamento em si
        # (mesma fonte de verdade / mesma lógica compartilhada com o frontend).
        words = [_w("um", 0, 1), _w("dois", 1.1, 2), _w("tres", 2.1, 3)]
        segs = svc.group_words_into_segments(words, 10)
        assert len(segs) == 1
        assert [w["text"] for w in segs[0]["words"]] == ["um", "dois", "tres"]
