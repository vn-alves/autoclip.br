import logging
from pathlib import Path
from typing import List, Dict, Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ...utils.subtitle_processor import SubtitleProcessor
from ...utils.video_editor import VideoEditor
from ...core.path_utils import get_data_directory, get_projects_directory
from ...core.database import get_db
from ...services.project_service import ProjectService
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
router = APIRouter()

# 请求和响应模型
class SubtitleEditRequest(BaseModel):
    project_id: str
    clip_id: str
    deleted_segments: List[str]

class SubtitleEditResponse(BaseModel):
    success: bool
    message: str
    edited_video_path: Optional[str] = None
    deleted_duration: Optional[float] = None
    final_duration: Optional[float] = None

class SubtitleDataResponse(BaseModel):
    segments: List[Dict]
    total_duration: float
    word_count: int
    segment_count: int
    # Sincronização precisa (ver services/subtitle_sync_service.py). Quando "synced",
    # os timestamps em `segments`/`words` já são os reais (Whisper), não a estimativa
    # linear. `words` é a mesma lista de palavras "achatada" (sem agrupar por
    # segmento) — o Editor usa ela para reagrupar localmente por quantidade de
    # palavras, sem precisar chamar IA de novo.
    sync_status: str = "not_synced"
    synced_at: Optional[str] = None
    words: Optional[List[Dict]] = None

class SubtitleSyncStartResponse(BaseModel):
    job_id: str
    status: str

class SubtitleSyncStatusResponse(BaseModel):
    status: str
    progress: int = 0
    error: Optional[str] = None
    synced_at: Optional[str] = None
    word_count: Optional[int] = None
    segments_done: Optional[int] = None
    segments_total: Optional[int] = None

class EditPreviewRequest(BaseModel):
    project_id: str
    clip_id: str
    deleted_segments: List[str]

# 依赖注入函数
def get_subtitle_processor() -> SubtitleProcessor:
    return SubtitleProcessor()

def get_video_editor() -> VideoEditor:
    # 字幕编辑器使用全局路径作为后备（不影响主流水线）
    from ...core.shared_config import CLIPS_DIR, COLLECTIONS_DIR
    return VideoEditor(clips_dir=str(CLIPS_DIR), collections_dir=str(COLLECTIONS_DIR))

def get_project_service(db: Session = Depends(get_db)) -> ProjectService:
    """Dependency to get project service."""
    return ProjectService(db)


def _get_clip_subtitles_from_srt(project_id: str, clip, subtitle_processor: SubtitleProcessor) -> List[Dict]:
    """Lê o SRT original do projeto e devolve só os segmentos/palavras deste clip,
    com timestamps relativos ao início do clip (estimativa linear — ver
    subtitle_processor._split_text_to_words). Compartilhado pelo endpoint de
    leitura e pelo início da sincronização com IA (que usa o texto daqui como
    base a ser preservada)."""
    projects_dir = get_projects_directory()
    project_dir = projects_dir / project_id
    srt_file = project_dir / "raw" / "input.srt"

    if not srt_file.exists():
        raise HTTPException(status_code=404, detail="字幕文件不存在")

    subtitle_data = subtitle_processor.parse_srt_to_word_level(srt_file)

    # IMPORTANTE: clip.start_time/end_time no banco são inteiros truncados
    # (DataSyncService._convert_time_to_seconds faz int(total_seconds)), mas o
    # arquivo físico do clip foi cortado pelo ffmpeg no timestamp PRECISO (com
    # milissegundos) vindo do timeline gerado pela IA. Usar o valor truncado aqui
    # desalinha toda legenda em até ~1s em relação ao vídeo real. clip_metadata
    # guarda o dict original do pipeline (start_time/end_time como string
    # "HH:MM:SS,mmm") — quando presente, usamos ele para o offset preciso, e só
    # caímos para o inteiro do banco como fallback (clipes criados fora do
    # pipeline de IA, sem esse metadata).
    raw_meta = clip.clip_metadata or {}

    def _precise_seconds(meta_key: str, fallback) -> float:
        raw = raw_meta.get(meta_key)
        if isinstance(raw, str) and raw.strip():
            try:
                return subtitle_processor._srt_time_to_seconds(
                    subtitle_processor._seconds_to_srt_time_object(raw)
                )
            except Exception:
                pass
        return float(fallback or 0)

    clip_start = _precise_seconds('start_time', clip.start_time)
    clip_end = _precise_seconds('end_time', clip.end_time)

    clip_subtitles = [
        seg for seg in subtitle_data
        if seg['startTime'] >= clip_start and seg['endTime'] <= clip_end
    ]

    for seg in clip_subtitles:
        seg['startTime'] -= clip_start
        seg['endTime'] -= clip_start
        for word in seg['words']:
            word['startTime'] -= clip_start
            word['endTime'] -= clip_start

    return clip_subtitles


def _inject_synced_timestamps(clip_subtitles: List[Dict], synced_words: List[Dict]) -> List[Dict]:
    """Substitui os timestamps (estimativa linear) dos segmentos originais pelos
    timestamps reais alinhados pela sincronização com IA — preserva o texto e a
    divisão em segmentos original, só troca startTime/endTime de cada palavra
    (e recalcula o startTime/endTime do segmento a partir das palavras)."""
    flat_index = 0
    for seg in clip_subtitles:
        for word in seg['words']:
            if flat_index < len(synced_words):
                sw = synced_words[flat_index]
                word['startTime'] = sw['startTime']
                word['endTime'] = sw['endTime']
            flat_index += 1
        if seg['words']:
            seg['startTime'] = seg['words'][0]['startTime']
            seg['endTime'] = seg['words'][-1]['endTime']
    return clip_subtitles


@router.get("/{project_id}/clips/{clip_id}/subtitles")
async def get_clip_subtitles(
    project_id: str,
    clip_id: str,
    subtitle_processor: SubtitleProcessor = Depends(get_subtitle_processor),
    project_service: ProjectService = Depends(get_project_service)
):
    """获取片段的字粒度字幕数据"""
    try:
        # 获取项目信息
        project = project_service.get(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        # 获取片段信息
        from ...models.clip import Clip
        clip = project_service.db.query(Clip).filter(Clip.id == clip_id, Clip.project_id == project_id).first()
        if not clip:
            raise HTTPException(status_code=404, detail="片段不存在")

        clip_subtitles = _get_clip_subtitles_from_srt(project_id, clip, subtitle_processor)

        # Se já existe sincronização precisa salva (clip_metadata.subtitle_sync), usa ela
        # em vez da estimativa linear — sem chamar IA de novo. Só aplica se a contagem de
        # palavras bater com o SRT atual (senão o SRT mudou desde a sincronização e os
        # timestamps salvos não correspondem mais; melhor sinalizar not_synced do que
        # aplicar dado desatualizado e desalinhar tudo de novo).
        sync_status = "not_synced"
        synced_at = None
        flat_words: Optional[List[Dict]] = None

        sync_meta = (clip.clip_metadata or {}).get('subtitle_sync')
        if isinstance(sync_meta, dict) and sync_meta.get('status') == 'synced':
            synced_words = sync_meta.get('words') or []
            total_words = sum(len(seg['words']) for seg in clip_subtitles)
            if synced_words and len(synced_words) == total_words:
                clip_subtitles = _inject_synced_timestamps(clip_subtitles, synced_words)
                sync_status = "synced"
                synced_at = sync_meta.get('synced_at')
                flat_words = synced_words
            else:
                logger.warning(
                    f"Sincronização salva do clip {clip_id} não bate com o SRT atual "
                    f"({len(synced_words)} vs {total_words} palavras) — ignorando, tratando como not_synced."
                )

        # 获取统计信息
        stats = subtitle_processor.get_subtitle_statistics(clip_subtitles)

        return SubtitleDataResponse(
            segments=clip_subtitles,
            total_duration=stats['totalDuration'],
            word_count=stats['wordCount'],
            segment_count=stats['segmentCount'],
            sync_status=sync_status,
            synced_at=synced_at,
            words=flat_words,
        )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"获取字幕数据失败: {e}")
        logger.error(f"错误详情: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"获取字幕数据失败: {str(e)}")


@router.post("/{project_id}/clips/{clip_id}/subtitles/sync")
async def start_clip_subtitle_sync(
    project_id: str,
    clip_id: str,
    subtitle_processor: SubtitleProcessor = Depends(get_subtitle_processor),
    project_service: ProjectService = Depends(get_project_service)
):
    """Dispara a sincronização precisa (Whisper + alinhamento) para este clip.
    Roda em background (thread); o cliente consulta o progresso pelo job_id
    retornado. Não bloqueia nem roda automaticamente — só quando o usuário pede."""
    try:
        project = project_service.get(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        from ...models.clip import Clip
        clip = project_service.db.query(Clip).filter(Clip.id == clip_id, Clip.project_id == project_id).first()
        if not clip:
            raise HTTPException(status_code=404, detail="片段不存在")

        clip_subtitles = _get_clip_subtitles_from_srt(project_id, clip, subtitle_processor)
        original_segments = [
            {
                "startTime": seg["startTime"],
                "endTime": seg["endTime"],
                "words": [{"id": w["id"], "text": w["text"]} for w in seg["words"]],
            }
            for seg in clip_subtitles
        ]
        if not any(seg["words"] for seg in original_segments):
            raise HTTPException(status_code=400, detail="Este corte não possui legendas para sincronizar.")

        from ...services import subtitle_sync_service
        job_id = subtitle_sync_service.start_sync(project_id, clip_id, original_segments)
        job = subtitle_sync_service.get_job(job_id) or {}
        return SubtitleSyncStartResponse(job_id=job_id, status=job.get("status", "analyzing_audio"))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"启动字幕同步失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Não foi possível iniciar a sincronização: {str(e)}")


@router.get("/{project_id}/clips/{clip_id}/subtitles/sync/{job_id}")
async def get_clip_subtitle_sync_status(project_id: str, clip_id: str, job_id: str):
    """Progresso/resultado de um job de sincronização iniciado por /subtitles/sync."""
    from ...services import subtitle_sync_service
    job = subtitle_sync_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Sincronização não encontrada.")
    return SubtitleSyncStatusResponse(
        status=job.get("status", "error"),
        progress=job.get("progress", 0),
        error=job.get("error"),
        synced_at=job.get("synced_at"),
        word_count=job.get("word_count"),
        segments_done=job.get("segments_done"),
        segments_total=job.get("segments_total"),
    )

@router.post("/{project_id}/clips/{clip_id}/edit")
async def edit_clip_by_subtitles(
    project_id: str,
    clip_id: str,
    request: SubtitleEditRequest,
    subtitle_processor: SubtitleProcessor = Depends(get_subtitle_processor),
    video_editor: VideoEditor = Depends(get_video_editor),
    project_service: ProjectService = Depends(get_project_service)
):
    """基于字幕删除编辑视频片段"""
    try:
        # 获取项目信息
        project = project_service.get(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 获取片段信息
        from ...models.clip import Clip
        clip = project_service.db.query(Clip).filter(Clip.id == clip_id, Clip.project_id == project_id).first()
        if not clip:
            raise HTTPException(status_code=404, detail="片段不存在")
        
        # 获取原始视频和字幕文件路径
        projects_dir = get_projects_directory()
        project_dir = projects_dir / project_id
        
        # 查找原始视频文件
        video_files = list(project_dir.glob("raw/*.mp4"))
        if not video_files:
            raise HTTPException(status_code=404, detail="原始视频文件不存在")
        original_video = video_files[0]
        
        # 查找字幕文件
        srt_file = project_dir / "raw" / "input.srt"
        if not srt_file.exists():
            raise HTTPException(status_code=404, detail="字幕文件不存在")
        
        # 解析字幕数据
        subtitle_data = subtitle_processor.parse_srt_to_word_level(srt_file)
        
        # 过滤出属于当前片段的时间范围
        # 如果start_time和end_time是整数（秒），直接使用
        if isinstance(clip.start_time, int):
            clip_start = clip.start_time
        else:
            clip_start = subtitle_processor._srt_time_to_seconds(
                subtitle_processor._seconds_to_srt_time_object(clip.start_time)
            )
        
        if isinstance(clip.end_time, int):
            clip_end = clip.end_time
        else:
            clip_end = subtitle_processor._srt_time_to_seconds(
                subtitle_processor._seconds_to_srt_time_object(clip.end_time)
            )
        
        clip_subtitles = [
            seg for seg in subtitle_data 
            if seg['startTime'] >= clip_start and seg['endTime'] <= clip_end
        ]
        
        # 验证编辑操作
        validation = video_editor.validate_edit_operations(
            clip_subtitles, request.deleted_segments
        )
        
        if not validation['valid']:
            raise HTTPException(status_code=400, detail=validation['error'])
        
        # 创建输出目录
        output_dir = project_dir / "edited_clips"
        output_dir.mkdir(exist_ok=True)
        
        # 生成编辑后的视频文件名
        edited_video_name = f"{clip_id}_edited.mp4"
        edited_video_path = output_dir / edited_video_name
        
        # 执行视频编辑
        edit_result = video_editor.edit_video_by_subtitle_deletion(
            original_video,
            clip_subtitles,
            request.deleted_segments,
            edited_video_path
        )
        
        if not edit_result['success']:
            raise HTTPException(status_code=500, detail=f"视频编辑失败: {edit_result['error']}")
        
        # 导出编辑后的字幕文件
        edited_srt_path = output_dir / f"{clip_id}_edited.srt"
        subtitle_processor.export_edited_srt(
            clip_subtitles,
            request.deleted_segments,
            edited_srt_path
        )
        
        return SubtitleEditResponse(
            success=True,
            message="视频编辑成功",
            edited_video_path=str(edited_video_path),
            deleted_duration=edit_result['totalDeletedDuration'],
            final_duration=edit_result['finalDuration']
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"编辑视频片段失败: {e}")
        raise HTTPException(status_code=500, detail=f"编辑视频片段失败: {str(e)}")

@router.get("/{project_id}/clips/{clip_id}/edited-video")
async def get_edited_video(
    project_id: str,
    clip_id: str,
    project_service: ProjectService = Depends(get_project_service)
):
    """获取编辑后的视频文件"""
    try:
        # 检查项目是否存在
        project = await project_service.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 查找编辑后的视频文件
        projects_dir = get_projects_directory()
        edited_video_path = projects_dir / project_id / "edited_clips" / f"{clip_id}_edited.mp4"
        
        if not edited_video_path.exists():
            raise HTTPException(status_code=404, detail="编辑后的视频文件不存在")
        
        # 返回视频文件
        return FileResponse(
            path=str(edited_video_path),
            media_type="video/mp4",
            filename=f"{clip_id}_edited.mp4"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取编辑后的视频失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取编辑后的视频失败: {str(e)}")

@router.post("/{project_id}/clips/{clip_id}/preview")
async def create_edit_preview(
    project_id: str,
    clip_id: str,
    request: EditPreviewRequest,
    subtitle_processor: SubtitleProcessor = Depends(get_subtitle_processor),
    video_editor: VideoEditor = Depends(get_video_editor),
    project_service: ProjectService = Depends(get_project_service)
):
    """创建编辑预览片段"""
    try:
        # 获取项目信息
        project = project_service.get(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 获取片段信息
        from ...models.clip import Clip
        clip = project_service.db.query(Clip).filter(Clip.id == clip_id, Clip.project_id == project_id).first()
        if not clip:
            raise HTTPException(status_code=404, detail="片段不存在")
        
        # 获取原始视频和字幕文件路径
        projects_dir = get_projects_directory()
        project_dir = projects_dir / project_id
        
        video_files = list(project_dir.glob("raw/*.mp4"))
        if not video_files:
            raise HTTPException(status_code=404, detail="原始视频文件不存在")
        original_video = video_files[0]
        
        srt_file = project_dir / "raw" / "input.srt"
        if not srt_file.exists():
            raise HTTPException(status_code=404, detail="字幕文件不存在")
        
        # 解析字幕数据
        subtitle_data = subtitle_processor.parse_srt_to_word_level(srt_file)
        
        # 过滤出属于当前片段的时间范围
        # 如果start_time和end_time是整数（秒），直接使用
        if isinstance(clip.start_time, int):
            clip_start = clip.start_time
        else:
            clip_start = subtitle_processor._srt_time_to_seconds(
                subtitle_processor._seconds_to_srt_time_object(clip.start_time)
            )
        
        if isinstance(clip.end_time, int):
            clip_end = clip.end_time
        else:
            clip_end = subtitle_processor._srt_time_to_seconds(
                subtitle_processor._seconds_to_srt_time_object(clip.end_time)
            )
        
        clip_subtitles = [
            seg for seg in subtitle_data 
            if seg['startTime'] >= clip_start and seg['endTime'] <= clip_end
        ]
        
        # 创建预览目录
        preview_dir = project_dir / "edit_previews" / clip_id
        preview_dir.mkdir(parents=True, exist_ok=True)
        
        # 创建预览片段
        preview_files = video_editor.create_preview_clips(
            original_video,
            clip_subtitles,
            request.deleted_segments,
            preview_dir
        )
        
        return {
            "success": True,
            "preview_files": [str(f) for f in preview_files],
            "count": len(preview_files)
        }
        
    except Exception as e:
        logger.error(f"创建编辑预览失败: {e}")
        raise HTTPException(status_code=500, detail=f"创建编辑预览失败: {str(e)}")

@router.get("/{project_id}/clips/{clip_id}/preview/{segment_id}")
async def get_preview_segment(
    project_id: str,
    clip_id: str,
    segment_id: str,
    project_service: ProjectService = Depends(get_project_service)
):
    """获取预览片段文件"""
    try:
        # 检查项目是否存在
        project = project_service.get(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        
        # 查找预览文件
        projects_dir = get_projects_directory()
        preview_file = projects_dir / project_id / "edit_previews" / clip_id / f"preview_{segment_id}.mp4"
        
        if not preview_file.exists():
            raise HTTPException(status_code=404, detail="预览文件不存在")
        
        # 返回预览文件
        return FileResponse(
            path=str(preview_file),
            media_type="video/mp4",
            filename=f"preview_{segment_id}.mp4"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取预览文件失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取预览文件失败: {str(e)}")
