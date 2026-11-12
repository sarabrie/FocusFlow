import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pymongo.errors import PyMongoError

from database import db
from routers.authRouters import router as auth_router
from routers.contentRouters import router as content_router
from routers.sessionRouters import router as session_router

logger = logging.getLogger("focusflow")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        # Unique email in the database itself, not only a check in code (two simultaneous sign-ups).
        await db.users.create_index("email", unique=True)
        # Revoked tokens disappear once they would have expired anyway.
        await db.revoked_tokens.create_index("expires_at", expireAfterSeconds=0)
        # Failed-login counters disappear when their window ends.
        await db.login_failures.create_index("expires_at", expireAfterSeconds=0)
    except PyMongoError as error:
        logger.warning("Could not create indexes: %s", error)
    yield


# כאן מחברים הגדרות כלליות ונתיבים לאפליקציית FastAPI.
app = FastAPI(title="FocusFlow Backend", lifespan=lifespan)

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
    # Pydantic prefixes messages raised from validators with "Value error, ".
    message = message.removeprefix("Value error, ")
    return JSONResponse(status_code=422, content={"message": message})


@app.get("/health")
def health_check():
    return {"status": "ok"}