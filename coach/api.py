"""HTTP API for the coach webapp.

A thin FastAPI layer over :class:`~coach.coach.Coach` — the same brain the CLI
uses. All intelligence stays in ``coach.llm``; endpoints only translate between
HTTP and the Coach's methods.

Run locally:

    uvicorn coach.api:app --reload

Auth: if the ``COACH_TOKEN`` environment variable is set, every ``/api``
request must carry ``Authorization: Bearer <token>``. Leave it unset for
local-only use.
"""

from __future__ import annotations

import hmac
import os
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import llm, review
from .coach import Coach, Plan
from .roadmap import available_roadmaps, load_roadmap
from .store import Store

_OUTCOMES = [
    "solved_independently",
    "solved_with_hints",
    "viewed_solution",
    "gave_up",
    "reviewed_easily",
    "struggled",
]

# Built frontend location; override with COACH_WEB_DIST when the package is
# installed away from the repo (e.g. in a Docker image).
_WEB_DIST = Path(
    os.environ.get("COACH_WEB_DIST", Path(__file__).parent.parent / "web" / "dist")
)


# --- auth ------------------------------------------------------------------ #


def _check_token(request: Request) -> None:
    expected = os.environ.get("COACH_TOKEN", "")
    if not expected:
        return  # no token configured — local/open mode
    header = request.headers.get("authorization", "")
    supplied = header.removeprefix("Bearer ").strip()
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing token.")


# --- request/response models ------------------------------------------------ #


class InitRequest(BaseModel):
    roadmap_id: str


class PlanRequest(BaseModel):
    minutes: int = Field(gt=0, le=24 * 60)


class FeedbackRequest(BaseModel):
    text: str = Field(min_length=1)


class AttemptRequest(BaseModel):
    title: str
    outcome: str
    minutes: int | None = Field(default=None, gt=0)
    used_hint: bool = False
    viewed_solution: bool = False
    notes: str = ""


# --- app --------------------------------------------------------------------#


def create_app(state_path: Path | None = None) -> FastAPI:
    app = FastAPI(title="AI Daily LeetCode Coach", dependencies=[Depends(_check_token)])

    def coach() -> Coach:
        # A fresh Coach per request: state is re-read from disk, so the CLI
        # and the webapp can be used interchangeably against the same file.
        return Coach(store=Store(state_path))

    # ---- setup / roadmap ------------------------------------------------ #

    @app.get("/api/state")
    def get_state() -> dict[str, Any]:
        c = coach()
        state = c.store.load()
        roadmap = None
        if state.roadmap_id:
            rm = load_roadmap(state.roadmap_id)
            roadmap = {
                "id": rm.id,
                "name": rm.name,
                "description": rm.description,
                "topics": rm.topics(),
                "problem_count": len(rm.problems),
            }
        return {
            "initialized": state.roadmap_id is not None,
            "roadmap": roadmap,
            "available_roadmaps": available_roadmaps(),
            "today": c.today.isoformat(),
        }

    @app.post("/api/init")
    def post_init(body: InitRequest) -> dict[str, Any]:
        try:
            rm = coach().initialize(body.roadmap_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        return {"id": rm.id, "name": rm.name, "problem_count": len(rm.problems)}

    # ---- daily loop ------------------------------------------------------ #

    @app.get("/api/plan")
    def get_plan() -> dict[str, Any]:
        raw = Store(state_path).load_plan_cache()
        return {"plan": raw}

    @app.post("/api/plan")
    def post_plan(body: PlanRequest) -> dict[str, Any]:
        c = coach()
        _require_initialized(c)
        try:
            plan = c.plan_today(body.minutes)
        except llm.LLMError as exc:
            raise HTTPException(status_code=502, detail=str(exc))
        payload = plan.to_dict()
        c.store.save_plan_cache(payload)
        return {"plan": payload}

    @app.post("/api/feedback")
    def post_feedback(body: FeedbackRequest) -> dict[str, Any]:
        c = coach()
        _require_initialized(c)
        raw = c.store.load_plan_cache()
        plan = Plan.from_dict(raw) if raw else None
        try:
            return c.record_feedback(body.text, plan=plan)
        except llm.LLMError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @app.post("/api/attempts")
    def post_attempt(body: AttemptRequest) -> dict[str, Any]:
        if body.outcome not in _OUTCOMES:
            raise HTTPException(
                status_code=422,
                detail=f"outcome must be one of: {', '.join(_OUTCOMES)}",
            )
        c = coach()
        _require_initialized(c)
        try:
            return c.record_attempt(
                title=body.title,
                outcome=body.outcome,
                minutes=body.minutes,
                used_hint=body.used_hint,
                viewed_solution=body.viewed_solution,
                notes=body.notes,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc))

    # ---- dashboard / problems ------------------------------------------- #

    @app.get("/api/progress")
    def get_progress() -> dict[str, Any]:
        c = coach()
        _require_initialized(c)
        return c.progress()

    @app.get("/api/activity")
    def get_activity() -> dict[str, Any]:
        c = coach()
        _require_initialized(c)
        return c.activity()

    @app.get("/api/problems")
    def get_problems() -> dict[str, Any]:
        c = coach()
        _require_initialized(c)
        state = c.store.load()
        rm = load_roadmap(state.roadmap_id)
        problems = []
        for p in rm.problems:
            rec = state.records.get(p.title)
            problems.append(
                {
                    "title": p.title,
                    "topic": p.topic,
                    "difficulty": p.difficulty,
                    "order": p.order,
                    "status": "solved" if rec and rec.solved else ("in_progress" if rec else "new"),
                    "attempts": len(rec.attempts) if rec else 0,
                    "next_review": rec.next_review if rec else None,
                    "due": bool(rec and review.is_due(rec, c.today)),
                }
            )
        return {"problems": problems}

    @app.get("/api/problems/{title}")
    def get_problem(title: str) -> dict[str, Any]:
        c = coach()
        _require_initialized(c)
        state = c.store.load()
        rm = load_roadmap(state.roadmap_id)
        p = rm.by_title(title)
        if p is None:
            raise HTTPException(status_code=404, detail=f"Unknown problem: {title!r}")
        rec = state.records.get(p.title)
        return {
            "title": p.title,
            "topic": p.topic,
            "difficulty": p.difficulty,
            "order": p.order,
            "status": "solved" if rec and rec.solved else ("in_progress" if rec else "new"),
            "next_review": rec.next_review if rec else None,
            "due": bool(rec and review.is_due(rec, c.today)),
            "review_streak": rec.review_streak if rec else 0,
            "attempts": [
                {
                    "date": a.date,
                    "minutes": a.minutes,
                    "outcome": a.outcome,
                    "used_hint": a.used_hint,
                    "viewed_solution": a.viewed_solution,
                    "notes": a.notes,
                }
                for a in (rec.attempts if rec else [])
            ],
        }

    # ---- static frontend ------------------------------------------------- #

    if _WEB_DIST.exists():
        app.mount(
            "/assets", StaticFiles(directory=_WEB_DIST / "assets"), name="assets"
        )

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str) -> FileResponse:
            candidate = (_WEB_DIST / path).resolve()
            if (
                path
                and candidate.is_relative_to(_WEB_DIST.resolve())
                and candidate.is_file()
            ):
                return FileResponse(candidate)
            return FileResponse(_WEB_DIST / "index.html")

    return app


def _require_initialized(c: Coach) -> None:
    if not c.is_initialized():
        raise HTTPException(
            status_code=409, detail="No roadmap selected yet. POST /api/init first."
        )


def _state_path_from_env() -> Path | None:
    override = os.environ.get("LEETCODE_COACH_STATE")
    return Path(override) if override else None


app = create_app(_state_path_from_env())
