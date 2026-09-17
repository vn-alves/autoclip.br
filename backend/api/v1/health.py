"""
健康检查API路由
"""

from fastapi import APIRouter
from datetime import datetime
from typing import Dict, Any

router = APIRouter()


@router.get("/")
async def health_check() -> Dict[str, Any]:
    """健康检查端点."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }


@router.get("/video-categories")
async def get_video_categories() -> Dict[str, Any]:
    """获取视频分类配置."""
    return {
        "categories": [
            {
                "value": "knowledge",
                "name": "Conhecimento e Ciência",
                "description": "Ciência, tecnologia, história, cultura, etc.",
                "icon": "book",
                "color": "#1890ff"
            },
            {
                "value": "entertainment", 
                "name": "Entretenimento",
                "description": "Jogos, música, filmes, variedades, etc.",
                "icon": "play-circle",
                "color": "#52c41a"
            },
            {
                "value": "experience",
                "name": "Estilo de Vida",
                "description": "Dicas práticas, culinária, viagens, artes, etc.",
                "icon": "heart",
                "color": "#fa8c16"
            },
            {
                "value": "opinion",
                "name": "Opinião e Comentários",
                "description": "Comentários sobre atualidades, compartilhamento de opiniões, etc.",
                "icon": "message",
                "color": "#722ed1"
            },
            {
                "value": "business",
                "name": "Negócios e Finanças",
                "description": "Análises de negócios, notícias financeiras, etc.",
                "icon": "dollar",
                "color": "#13c2c2"
            },
            {
                "value": "speech",
                "name": "Discursos e Entrevistas",
                "description": "Discursos, entrevistas, diálogos, etc.",
                "icon": "sound",
                "color": "#eb2f96"
            }
        ],
        "default_category": "knowledge"
    } 