# FocusFlow

אפליקציית ווב שמודדת ריכוז בזמן קריאה או צפייה בסרטון, דרך מצלמת הרשת. הניתוח רץ כולו בדפדפן, והווידאו מהמצלמה לא נשלח לשרת.

**האתר החי:** https://focusflow-app.ddns.net

## מה האפליקציה עושה

- **ספרייה אישית:** מוסיפים קישורים (כולל סרטוני YouTube) או טקסט לקריאה.
- **מדידת ריכוז בזמן אמת:** [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) מזהה את הפנים. הציון מחושב כל שנייה מכיוון הראש, המבט, העיניים הפתוחות, המצמוצים, הפיהוקים, הדיבור ושקט הראש.
- **התערבויות בסרטון:** כשהריכוז יורד, הסרטון משמיע צליל ומנמיך את הקול. אם הריכוז ממשיך לרדת, או שהמשתמש עוזב את הלשונית, הסרטון נעצר.
- **היסטוריה:** כל סשן נשמר, עם ריכוז ממוצע, משך הסשן וגרפים.
- **חשבון:** הרשמה, התחברות, החלפת סיסמה ומחיקת חשבון.

## טכנולוגיות

| שכבה | טכנולוגיה |
| --- | --- |
| לקוח | React 18, Vite, MediaPipe Tasks Vision, מוגש ב-nginx |
| שרת | FastAPI, Motor (MongoDB אסינכרוני), JWT, bcrypt |
| מסד נתונים | MongoDB (בענן: MongoDB Atlas) |
| ענן | Google Cloud Run, Load Balancer, Secret Manager, Artifact Registry, Cloud Build |

## ארכיטקטורה בענן

```
Browser → https://focusflow-app.ddns.net
              │
        Load Balancer (HTTPS 443, Google-managed certificate)
              │
              ├── /api/* , /health → Cloud Run: focusflow-backend  (FastAPI, port 8000)
              └── everything else  → Cloud Run: focusflow-frontend (nginx, port 3000)
                                              │
                       focusflow-backend → MongoDB Atlas (europe-west1)
```

- **כתובת אחת לכל המערכת:** הלקוח פונה לשרת בנתיב יחסי (`/api`), ולכן אין בעיות CORS.
- **סודות:** `MONGO_URI` ו-`JWT_SECRET_KEY` נשמרים ב-Secret Manager, ו-Cloud Run מזריק אותם כמשתני סביבה. אין סודות בקוד או בתמונות.
- **מצב משותף:** אין מצב בזיכרון של השרת. גם ספירת ניסיונות ההתחברות הכושלים נשמרת במסד, ולכן כמה מופעים עובדים יחד נכון.
- **גישה:** שירותי Cloud Run מקבלים תעבורה רק מה-Load Balancer.

## הרצה מקומית

צריך Python 3.10 ומעלה, Node 18 ומעלה ו-Docker (בשביל MongoDB).

**1. מסד נתונים**

```bash
docker run -d --name focusflow-mongo -p 27017:27017 mongo:7
```

**2. שרת** (בתיקיית `backend`)

```bash
pip install -r requirements.txt
JWT_SECRET_KEY=local-dev-secret uvicorn main:app --reload --port 8000
```

בלי `MONGO_URI` השרת מתחבר ל-`mongodb://localhost:27017`. בלי `JWT_SECRET_KEY` הוא יוצר מפתח אקראי, וכל ההתחברויות מתבטלות בכל הפעלה מחדש.

**3. לקוח** (בתיקיית `frontend`)

```bash
npm install
npm run dev
```

האתר עולה ב-http://localhost:3000, ו-Vite מעביר את `/api` לשרת שבפורט 8000. המצלמה עובדת ב-`localhost` גם בלי HTTPS.

## משתני סביבה (שרת)

| משתנה | תפקיד | ברירת מחדל |
| --- | --- | --- |
| `MONGO_URI` | כתובת החיבור ל-MongoDB | `mongodb://localhost:27017/focusflow_db` |
| `JWT_SECRET_KEY` | מפתח החתימה של טוקני ההתחברות | מפתח אקראי לכל הפעלה |

## בדיקות

```bash
cd frontend
npm test
```

## פריסה לענן

התמונות נבנות מהקוד ב-Cloud Build ונשמרות ב-Artifact Registry:

```bash
gcloud builds submit backend  --region=europe-west1 --tag=europe-west1-docker.pkg.dev/PROJECT_ID/focusflow/backend:TAG
gcloud builds submit frontend --region=europe-west1 --tag=europe-west1-docker.pkg.dev/PROJECT_ID/focusflow/frontend:TAG
```

אחרי הבנייה מעדכנים את שירותי Cloud Run לתמונה החדשה. בשירות הלקוח מגדירים `BACKEND_URL=none`, כי בענן ה-Load Balancer מנתב את `/api` ולא nginx.
