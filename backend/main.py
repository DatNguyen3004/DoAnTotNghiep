from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from routers import auth, projects, users, datasets, tasks, annotations, ai, export
from services.ai_service import get_model


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload AI model khi server khởi động
    print("Loading YOLOv8 model...")
    model = get_model()
    if model:
        print("YOLOv8 model loaded successfully")
    else:
        from services.ai_service import get_model_error
        print(f"YOLOv8 model load failed: {get_model_error()}")
    yield


app = FastAPI(title="NuLabel API", version="1.0.0", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers
app.include_router(auth.router,        prefix="/api/auth",        tags=["auth"])
app.include_router(projects.router,    prefix="/api/projects",    tags=["projects"])
app.include_router(users.router,       prefix="/api/users",       tags=["users"])
app.include_router(datasets.router,    prefix="/api",             tags=["datasets"])
app.include_router(tasks.router,       prefix="/api/tasks",       tags=["tasks"])
app.include_router(annotations.router, prefix="/api",             tags=["annotations"])
app.include_router(ai.router,          prefix="/api/ai",          tags=["ai"])
app.include_router(export.router,      prefix="/api/projects",    tags=["export"])

# Redirect root → login page
@app.get("/")
def root():
    return RedirectResponse(url="/login.html")

# Serve frontend static files
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/", StaticFiles(directory="static", html=True), name="static-html")
