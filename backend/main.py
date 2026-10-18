from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.authRouters import router as auth_router
from routers.contentRouters import router as content_router

# כאן מחברים הגדרות כלליות ונתיבים לאפליקציית FastAPI.
app = FastAPI(title="FocusFlow Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# חיבור הנתבים לאפליקציה הראשית
app.include_router(auth_router)
app.include_router(content_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}