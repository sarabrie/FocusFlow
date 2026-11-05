from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from routers.authRouters import router as auth_router
from routers.contentRouters import router as content_router
from routers.sessionRouters import router as session_router

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
app.include_router(session_router)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        message = detail.get("message") or detail.get("detail") or "Request failed"
    elif isinstance(detail, list):
        message = detail[0].get("msg") if detail and isinstance(detail[0], dict) else "Request failed"
    else:
        message = str(detail)
    return JSONResponse(status_code=exc.status_code, content={"message": message})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    message = exc.errors()[0].get("msg") if exc.errors() else "Invalid request data"
    return JSONResponse(status_code=422, content={"message": message})


@app.get("/health")
def health_check():
    return {"status": "ok"}