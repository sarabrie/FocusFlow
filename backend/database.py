import os
from motor.motor_asyncio import AsyncIOMotorClient

# כאשר השרת רץ מחוץ ל-Docker, MongoZ נמצא ב-localhost. פרופיל Docker ממשיך לקבל override דרך MONGO_URI.
MONGO_URI = os.getenv("MONGO_URI") or "mongodb://localhost:27017/focusflow_db"
client = AsyncIOMotorClient(MONGO_URI)
db = client.focusflow_db