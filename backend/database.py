import os
from motor.motor_asyncio import AsyncIOMotorClient

# ב-Docker הכתובת מגיעה מ-MONGO_URI; ברירת המחדל מיועדת לרשת Compose.
MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017")
client = AsyncIOMotorClient(MONGO_URI)
db = client.focusflow_db