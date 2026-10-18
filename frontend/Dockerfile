# שלב הבנייה (Build)
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# שלב ההרצה באמצעות שרת אינטרנט קליל (למשל Nginx)
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# פתיחת הפורט ללקוח (לפי ההנחיות: 3000 - ניתן להתאים את Nginx או להשתמש בשרת פיתוח לפי הצורך)
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]