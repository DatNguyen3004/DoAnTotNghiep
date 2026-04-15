from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, projects, users, datasets, tasks, annotations, ai

app = FastAPI(title="NuLabel API", version="1.0.0")

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

# Redirect root → login page
@app.get("/")
def root():
    return RedirectResponse(url="/login.html")

# Serve frontend static files
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/", StaticFiles(directory="static", html=True), name="static-html")
