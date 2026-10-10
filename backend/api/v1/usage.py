"""Consumo das chaves de API (tokens), agrupado por projeto, com nome e número de cortes."""
from typing import Any, Dict

from fastapi import APIRouter

from ...core.usage_tracker import clear_usage, read_usage

router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("/llm")
def get_llm_usage() -> Dict[str, Any]:
    records = read_usage()
    projects: Dict[str, Dict[str, Any]] = {}
    ids = {r.get("project_id") for r in records if r.get("project_id")}
    if ids:
        try:
            from ...core.database import SessionLocal
            from ...models.project import Project
            from ...models.clip import Clip
            db = SessionLocal()
            try:
                for p in db.query(Project).filter(Project.id.in_(ids)).all():
                    projects[p.id] = {
                        "name": p.name,
                        "clips": db.query(Clip).filter(Clip.project_id == p.id).count(),
                    }
            finally:
                db.close()
        except Exception:  # noqa: BLE001
            pass
    return {"records": records, "projects": projects}


@router.delete("/llm")
def reset_llm_usage() -> Dict[str, Any]:
    clear_usage()
    return {"ok": True}
