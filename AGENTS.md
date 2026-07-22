# Repository Guidelines

## Project Structure & Module Organization

This repository contains a FastAPI application in `backend/`. API entrypoint and router registration live in `backend/main.py`; route handlers are grouped under `backend/routers/`. Database setup and SQLAlchemy connection code are in `backend/database.py`, `backend/config.py`, and `backend/scripts/`. Domain models are in `backend/models/`, request/response schemas in `backend/schemas/`, and business logic in `backend/services/`.

Static frontend files are served by FastAPI from `backend/static/`. Admin pages and styles are under `backend/static/Admin/`, user pages under `backend/static/User/`, shared JavaScript under `backend/static/js/`, and images/uploads under `backend/static/image/` and `backend/static/uploads/`.

## Build, Test, and Development Commands

Run backend commands from `backend/` unless noted.

```powershell
python -m venv ..\.venv
..\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

`pip install` installs FastAPI, SQLAlchemy, YOLO/Ultralytics, OpenCV, and related services. `uvicorn` starts the API and serves static pages, with `/` redirecting to `/login.html`. Initialize or migrate database state with scripts such as `python scripts/init_db.py` or the specific migration script needed for your change.

## Coding Style & Naming Conventions

Use Python 4-space indentation, `snake_case` for functions/modules, and `PascalCase` for SQLAlchemy model classes and Pydantic schemas. Keep routers thin: validate inputs in schemas, place persistence in models/database helpers, and put reusable logic in `services/`. For frontend files, keep page-specific CSS beside its Admin/User page area and shared behavior in `backend/static/js/`.

## Testing Guidelines

No project test suite is currently checked in. For new backend behavior, add focused `pytest` tests under `backend/tests/` using names like `test_auth_login.py` or `test_projects_api.py`. Prefer FastAPI `TestClient` for route tests and mock external services such as SMTP, OAuth, and AI model loading. Until tests exist, manually verify affected API routes and pages through `uvicorn`.

## Commit & Pull Request Guidelines

Recent commit subjects are short Vietnamese summaries, for example filter and evaluation updates like `Bo loc 2` or `Danh gia 10`. Keep commits concise, feature-focused, and in the same language as the surrounding work when possible. Pull requests should include a brief change summary, manual test notes, linked issues or tasks, and screenshots for UI changes. Call out database scripts, `.env` changes, or migration steps explicitly.

## Security & Configuration Tips

Never commit real `.env` values, SMTP passwords, OAuth secrets, uploaded user files, or model weights. Use `backend/.env.example` as the template and keep local credentials private. Review CORS and secret settings before deploying beyond local development.
