import os
from motor.motor_asyncio import AsyncIOMotorClient

# כאשר השרת רץ מחוץ ל-Docker, MongoZ נמצא ב-localhost. פרופיל Docker ממשיך לקבל override דרך MONGO_URI.
# ב-Cloud Run (K_SERVICE מוגדר אוטומטית) אין localhost למסד: הכתובת חייבת להגיע מ-Secret Manager.
if not os.getenv("MONGO_URI") and os.getenv("K_SERVICE"):
    raise RuntimeError("MONGO_URI must be set on Cloud Run (reference it from Secret Manager).")
MONGO_URI = os.getenv("MONGO_URI") or "mongodb://localhost:27017/focusflow_db"
client = AsyncIOMotorClient(MONGO_URI)
db = client.focusflow_db