"""
Testes das partes puras de editor_render_service.py (sem banco/ffmpeg) — Stage 4, seção 44.

Prioridades cobertas aqui: #5 (agrupamento de legendas) e #6 (validação de edit_config).
Coordenadas/RenderSpec/filtros ffmpeg (#1-2, #7) dependem de banco + arquivos de vídeo reais
e foram verificados manualmente com um render real (ver relatório) em vez de aqui.
"""
from backend.services import editor_render_service as svc


def _w(text: str, start: float, end: float) -> dict:
    return {"text": text, "startTime": start, "endTime": end}


class TestGroupWordsIntoSegments:
    def test_empty(self):
        assert svc.group_words_into_segments([], "auto") == []

    def test_fixed_mode_caps_at_n_words(self):
        words = [_w(f"w{i}", i * 0.3, i * 0.3 + 0.25) for i in range(7)]
        segs = svc.group_words_into_segments(words, 3)
        assert [len(s["words"]) for s in segs] == [3, 3, 1]

    def test_natural_pause_closes_block_early_even_in_fixed_mode(self):
        # Pausa de 0.6s+ entre w1 e w2 deve fechar o bloco mesmo sem atingir o teto de 10.
        words = [_w("a", 0.0, 0.3), _w("b", 0.32, 0.6), _w("c", 1.3, 1.6), _w("d", 1.62, 1.9)]
        segs = svc.group_words_into_segments(words, 10)
        assert len(segs) == 2
        assert [w["text"] for w in segs[0]["words"]] == ["a", "b"]
        assert [w["text"] for w in segs[1]["words"]] == ["c", "d"]

    def test_auto_mode_closes_on_sentence_end_punctuation(self):
        words = [_w("Isso", 0.0, 0.3), _w("acabou.", 0.32, 0.6), _w("Novo", 0.62, 0.9), _w("trecho", 0.92, 1.2)]
        segs = svc.group_words_into_segments(words, "auto")
        assert len(segs) == 2
        assert segs[0]["words"][-1]["text"] == "acabou."

    def test_segment_boundaries_match_first_last_word(self):
        words = [_w("a", 1.0, 1.5), _w("b", 1.6, 2.0)]
        segs = svc.group_words_into_segments(words, 5)
        assert segs[0]["startTime"] == 1.0
        assert segs[0]["endTime"] == 2.0


class TestValidateEditConfig:
    def _valid(self) -> dict:
        return {
            "version": 1,
            "canvas": {"format": "9:16", "background": {"type": "color", "color": "#000"}},
            "layers": [
                {"id": "main", "isMain": True, "visible": True, "zIndex": 0, "startTime": 0, "endTime": None,
                 "transform": {"x": 0, "y": 0, "width": 1, "height": 1, "rotation": 0}},
            ],
            "subtitle": {"wordsPerCaption": "auto", "style": {}, "position": {}},
        }

    def test_valid_config_has_no_errors(self):
        assert svc.validate_edit_config(self._valid()) == []

    def test_rejects_unknown_canvas_format(self):
        cfg = self._valid()
        cfg["canvas"]["format"] = "4:3"
        errors = svc.validate_edit_config(cfg)
        assert any("formato de canvas" in e for e in errors)

    def test_rejects_missing_main_layer(self):
        cfg = self._valid()
        cfg["layers"][0]["isMain"] = False
        errors = svc.validate_edit_config(cfg)
        assert any("layer principal" in e for e in errors)

    def test_rejects_secondary_layer_without_asset_id(self):
        cfg = self._valid()
        cfg["layers"].append({
            "id": "layer-2", "isMain": False, "visible": True, "zIndex": 1,
            "startTime": 0, "endTime": 5,
            "transform": {"x": 0.1, "y": 0.1, "width": 0.5, "height": 0.5, "rotation": 0},
        })
        errors = svc.validate_edit_config(cfg)
        assert any("assetId" in e for e in errors)

    def test_rejects_end_time_before_start_time(self):
        cfg = self._valid()
        cfg["layers"].append({
            "id": "layer-2", "isMain": False, "visible": True, "zIndex": 1,
            "startTime": 5, "endTime": 2, "assetId": "abc",
            "transform": {"x": 0.1, "y": 0.1, "width": 0.5, "height": 0.5, "rotation": 0},
        })
        errors = svc.validate_edit_config(cfg)
        assert any("endTime deve ser" in e for e in errors)


class TestEnforceMonotonicSegments:
    """Guarda contra a corrupção real encontrada testando o render: blocos de legenda vizinhos
    com timestamps sobrepostos (sync antiga, de antes de uma correção no alinhamento por
    segmento) produziam texto desenhado um sobre o outro no vídeo final."""

    def _seg(self, start, end, text="x"):
        return {"startTime": start, "endTime": end, "words": [_w(text, start, end)]}

    def test_no_overlap_passes_through_unchanged(self):
        segs = [self._seg(0, 1), self._seg(1.2, 2), self._seg(2.5, 3)]
        out = svc.enforce_monotonic_segments(segs)
        assert [(s["startTime"], s["endTime"]) for s in out] == [(0, 1), (1.2, 2), (2.5, 3)]

    def test_large_overlap_gets_clamped_not_dropped_when_still_readable(self):
        segs = [self._seg(0, 5), self._seg(1, 6)]
        out = svc.enforce_monotonic_segments(segs)
        assert len(out) == 2
        assert out[0] == {"startTime": 0, "endTime": 5, "words": out[0]["words"]}
        assert out[1]["startTime"] == 5  # empurrado pro fim do bloco anterior, nunca sobreposto
        assert out[1]["endTime"] == 6

    def test_fully_engulfed_segment_is_dropped(self):
        segs = [self._seg(0, 10), self._seg(2, 3)]  # o segundo não sobra tempo nenhum depois do clamp
        out = svc.enforce_monotonic_segments(segs)
        assert len(out) == 1
        assert out[0]["startTime"] == 0 and out[0]["endTime"] == 10

    def test_result_is_always_strictly_increasing(self):
        segs = [self._seg(5, 8), self._seg(1, 4), self._seg(3, 9), self._seg(9.02, 9.1)]
        out = svc.enforce_monotonic_segments(segs)
        for a, b in zip(out, out[1:]):
            assert a["endTime"] <= b["startTime"]


class TestAssColorAndEven:
    def test_ass_color_conversion(self):
        # #2D6BFF -> BGR invertido, prefixo alpha 00.
        assert svc._ass_color("#2D6BFF") == "&H00FF6B2D"

    def test_even_size_rounds_up_odd_dimensions(self):
        assert svc._even_size(101) == 102
        assert svc._even_size(100) == 100
        assert svc._even_size(1) == 2

    def test_px_pos_allows_negative_for_cover_boxes_wider_than_canvas(self):
        # Bug real: usar _even_size (mínimo 2) pra x/y grudava qualquer posição negativa em 2,
        # jogando o recorte de um box "cover" maior que o canvas pro canto errado.
        assert svc._px_pos(-1166.6) == -1167
        assert svc._px_pos(0) == 0
        assert svc._px_pos(4.6) == 5


class TestFfmpegScaleFilterPerFitMode:
    """A proteção contra deformação em fitMode='cover' precisa vir do PRÓPRIO filtro ffmpeg
    (force_original_aspect_ratio=increase + crop, equivalente a object-fit:cover), não do
    formato da caixa — o usuário pode redimensionar a caixa livremente em qualquer direção
    (ver EditorCanvas.handleResize) e o conteúdo não pode deformar mesmo assim."""

    def _spec(self, fit_mode):
        layer = svc.RenderLayerSpec(
            input_path=__import__("pathlib").Path("x.mp4"), x=0, y=0, width=1080, height=1920,
            z_index=0, start_time=0.0, end_time=10.0, has_audio=True, fit_mode=fit_mode,
        )
        return svc.RenderSpec(canvas_width=1080, canvas_height=1920, fps=30, duration=10.0,
                               background_color="#000000", layers=[layer])

    def test_cover_uses_increase_and_crop(self):
        cmd = svc._build_ffmpeg_command(self._spec("cover"), __import__("pathlib").Path("out.mp4"))
        filter_complex = cmd[cmd.index("-filter_complex") + 1]
        assert "force_original_aspect_ratio=increase" in filter_complex
        assert "crop=1080:1920" in filter_complex

    def test_contain_uses_plain_scale_no_crop(self):
        cmd = svc._build_ffmpeg_command(self._spec("contain"), __import__("pathlib").Path("out.mp4"))
        filter_complex = cmd[cmd.index("-filter_complex") + 1]
        assert "scale=1080:1920" in filter_complex
        assert "force_original_aspect_ratio" not in filter_complex
        assert "crop=" not in filter_complex

    def test_build_render_spec_reads_fitmode_from_layer_dict(self, monkeypatch, tmp_path):
        # build_render_spec precisa ler edit_config.layers[i].fitMode == 'cover' e refletir em
        # RenderLayerSpec.fit_mode — sem exigir banco/vídeo real, usa monkeypatch nas duas
        # únicas dependências externas (resolução do vídeo principal e o ffprobe).
        monkeypatch.setattr(svc, "resolve_main_clip_video_path", lambda db, pid, cid: __import__("pathlib").Path("main.mp4"))
        monkeypatch.setattr(svc, "_probe", lambda path: {"duration": 12.0})
        monkeypatch.setattr(svc, "_build_subtitle_ass", lambda **kw: None)
        edit_config = {
            "version": 1,
            "canvas": {"format": "9:16", "background": {"color": "#000000"}},
            "layers": [{
                "id": "main", "isMain": True, "visible": True, "zIndex": 0,
                "startTime": 0, "endTime": None, "fitMode": "cover",
                "transform": {"x": -1.08, "y": 0, "width": 3.16, "height": 1, "rotation": 0},
            }],
            "subtitle": {},
        }
        spec = svc.build_render_spec(db=None, project_id="p", clip_id="c", edit_config=edit_config, tmp_dir=tmp_path)
        assert spec.layers[0].fit_mode == "cover"
