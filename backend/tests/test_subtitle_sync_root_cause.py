"""
Stage 4.1 — correção da causa raiz da sobreposição em clip_metadata.subtitle_sync.words.

Causa raiz encontrada (ver relatório): backend/utils/subtitle_processor.py.
parse_srt_to_word_level() construía cada segmento (e a estimativa linear de suas palavras)
direto do startTime/endTime do PRÓPRIO cue do SRT, sem olhar pro cue seguinte. SRTs
auto-gerados (o caso real testado é de legendas estilo "rolling" — texto sequencial, nunca
duplicado, mas cada cue com um endTime generoso que invade o início do próximo cue em 1-2s)
produziam segmentos cujas janelas de tempo se sobrepunham de verdade — e como
subtitle_sync_service.py extrai o áudio a sincronizar a partir de [seg.startTime,
seg.endTime] (+ margem), a sobreposição se propagava pros timestamps reais alinhados por
Whisper, e daí pro clip_metadata.subtitle_sync.words final. Não era um problema de
ordenação: os cues em si descreviam janelas erradas.

Este arquivo testa os dois pontos onde a correção foi aplicada:
1. subtitle_processor.SubtitleProcessor — clamp na origem (extração dos segmentos do SRT).
2. subtitle_sync_service — offset de janela aplicado exatamente uma vez (não a causa raiz
   em si, mas o elo confirmado como correto durante a investigação).
"""
from pathlib import Path

import pytest

from backend.utils.subtitle_processor import SubtitleProcessor
from backend.services import subtitle_sync_service as sync_svc


def _write_srt(tmp_path: Path, cues) -> Path:
    """cues: list of (start_srt_ts, end_srt_ts, text)"""
    lines = []
    for i, (start, end, text) in enumerate(cues, start=1):
        lines.append(str(i))
        lines.append(f"{start} --> {end}")
        lines.append(text)
        lines.append("")
    path = tmp_path / "input.srt"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


class TestSegmentExtractionRootCauseFix:
    """Teste 1 (válido, deve permanecer igual) + Teste 2 (regressão causada por janela,
    validada na etapa correta: extração dos segmentos, não um sort no final) + Teste 4
    (múltiplos segmentos, nenhum reinicia o relógio) + Teste 5 (palavras continuam
    correspondendo ao texto certo)."""

    def test_non_overlapping_srt_is_unchanged(self, tmp_path):
        # Teste 1 — entrada já válida (cues sequenciais, sem sobreposição).
        srt = _write_srt(tmp_path, [
            ("00:00:00,000", "00:00:00,500", "um"),
            ("00:00:00,600", "00:00:01,000", "dois"),
            ("00:00:01,100", "00:00:01,500", "tres"),
        ])
        segs = SubtitleProcessor().parse_srt_to_word_level(srt)
        assert [round(s["startTime"], 3) for s in segs] == [0.0, 0.6, 1.1]
        assert [round(s["endTime"], 3) for s in segs] == [0.5, 1.0, 1.5]

    def test_rolling_srt_overlap_is_clamped_at_extraction_not_sorted_later(self, tmp_path):
        # Teste 2 — mesmo padrão do SRT real que causou o bug: cue endTime invade o próximo
        # cue startTime (não é uma inversão de ORDEM, é uma janela errada). A correção precisa
        # detectar isso já na extração do segmento, produzindo endTime == próximo startTime.
        srt = _write_srt(tmp_path, [
            ("00:00:00,000", "00:00:04,000", "essa daqui e floresta negra"),
            ("00:00:01,920", "00:00:07,000", "mas nao tem tanta diferenca"),
            ("00:00:04,680", "00:00:09,840", "ta bem pertinho de voces"),
        ])
        segs = SubtitleProcessor().parse_srt_to_word_level(srt)
        assert [round(s["startTime"], 2) for s in segs] == [0.0, 1.92, 4.68]
        # Cada segmento foi clampado pro início do PRÓXIMO — nunca mais o valor bruto do SRT.
        assert round(segs[0]["endTime"], 2) == 1.92
        assert round(segs[1]["endTime"], 2) == 4.68
        assert round(segs[2]["endTime"], 2) == 9.84  # último segmento não tem próximo: fica como está
        for i in range(len(segs) - 1):
            assert segs[i]["endTime"] <= segs[i + 1]["startTime"]

    def test_multiple_consecutive_segments_never_restart_the_clock(self, tmp_path):
        # Teste 4 — vários segmentos seguidos, todos com sobreposição no SRT bruto.
        srt = _write_srt(tmp_path, [
            (f"00:00:{i*3:02d},000", f"00:00:{i*3+4:02d},000", f"palavra{i}")
            for i in range(10)
        ])
        segs = SubtitleProcessor().parse_srt_to_word_level(srt)
        for i in range(len(segs) - 1):
            assert segs[i]["endTime"] <= segs[i + 1]["startTime"], (
                f"segmento {i} termina em {segs[i]['endTime']} depois do "
                f"segmento {i+1} começar em {segs[i+1]['startTime']}"
            )

    def test_word_text_is_preserved_after_clamping(self, tmp_path):
        # Teste 5 — só o TEMPO muda; o texto/ordem das palavras continua o mesmo.
        srt = _write_srt(tmp_path, [
            ("00:00:00,000", "00:00:04,000", "essa daqui e floresta negra"),
            ("00:00:01,920", "00:00:07,000", "mas nao tem tanta diferenca"),
        ])
        segs = SubtitleProcessor().parse_srt_to_word_level(srt)
        assert [w["text"] for w in segs[0]["words"]] == ["essa", "daqui", "e", "floresta", "negra"]
        assert [w["text"] for w in segs[1]["words"]] == ["mas", "nao", "tem", "tanta", "diferenca"]

    def test_words_within_clamped_segment_stay_internally_ordered(self, tmp_path):
        srt = _write_srt(tmp_path, [
            ("00:00:00,000", "00:00:04,000", "essa daqui e floresta negra"),
            ("00:00:01,920", "00:00:07,000", "mas nao tem tanta diferenca"),
        ])
        segs = SubtitleProcessor().parse_srt_to_word_level(srt)
        words = segs[0]["words"]
        for a, b in zip(words, words[1:]):
            assert a["startTime"] <= a["endTime"] <= b["startTime"]


class TestWindowOffsetAppliedOnce:
    """Teste 3 — conversão absoluto -> relativo ao clip -> relativo à janela -> final do
    clip, e que o offset da janela nunca é aplicado duas vezes nem perdido."""

    def test_compute_segment_window_uses_clip_relative_times(self):
        # seg.startTime/endTime já chegam relativos ao clip (ver docstring do módulo) —
        # a janela de áudio soma a margem, nunca reaplica nenhum offset absoluto do vídeo.
        window_start, window_duration = sync_svc.compute_segment_window(
            {"startTime": 20.0, "endTime": 24.0}
        )
        assert window_start == pytest.approx(20.0 - sync_svc.WINDOW_PADDING_SECONDS)
        assert window_duration == pytest.approx(4.0 + 2 * sync_svc.WINDOW_PADDING_SECONDS)

    def test_window_start_clamped_at_zero_for_segments_near_clip_start(self):
        window_start, _ = sync_svc.compute_segment_window({"startTime": 0.3, "endTime": 2.0})
        assert window_start == 0.0  # nunca negativo, mesmo com startTime < WINDOW_PADDING_SECONDS

    def test_apply_window_offset_shifts_exactly_once(self):
        # Palavras do Whisper vêm relativas ao ARQUIVO extraído (0 = início da janela); depois
        # de apply_window_offset devem ficar relativas ao clip — exatamente o valor do offset,
        # nem duas vezes maior nem perdido.
        window_start = 8.8
        whisper_words = [{"text": "voces", "startTime": 0.5, "endTime": 0.9}]
        shifted = sync_svc.apply_window_offset(whisper_words, window_start)
        assert shifted[0]["startTime"] == pytest.approx(9.3)
        assert shifted[0]["endTime"] == pytest.approx(9.7)
        # Aplicar de novo por engano dobraria o offset — confirma que a função em si é pura
        # (não muta a lista de entrada, então um bug de "chamar duas vezes" fica visível).
        assert whisper_words[0]["startTime"] == 0.5

    def test_full_round_trip_matches_expected_clip_relative_time(self):
        # timestamp absoluto do vídeo original -> já vem relativo ao clip em seg -> janela ->
        # tempo final relativo ao clip: soma e subtrai devem se cancelar exatamente.
        seg = {"startTime": 45.0, "endTime": 48.0}
        window_start, _ = sync_svc.compute_segment_window(seg)
        whisper_relative_to_window = 2.0  # o Whisper "achou" a palavra em t=2s do arquivo extraído
        final = sync_svc.apply_window_offset(
            [{"startTime": whisper_relative_to_window, "endTime": whisper_relative_to_window + 0.4}],
            window_start,
        )[0]
        # window_start = 45.0 - 1.2 = 43.8; final = 43.8 + 2.0 = 45.8 (dentro do segmento [45,48], como esperado)
        assert final["startTime"] == pytest.approx(window_start + whisper_relative_to_window)
        assert seg["startTime"] - 5 < final["startTime"] < seg["endTime"] + 5
