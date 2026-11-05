# שלב הבנייה (Build)
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# שלב ההרצה
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
# יוצר את ה-proxy לשרת לפי BACKEND_URL בזמן עלייה (ולא בזמן build)
COPY 40-backend-proxy.sh /docker-entrypoint.d/40-backend-proxy.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/40-backend-proxy.sh \
    && chmod +x /docker-entrypoint.d/40-backend-proxy.sh
# ברירת מחדל ל-docker compose. ב-Cloud Run מגדירים BACKEND_URL=none
ENV BACKEND_URL=http://backend:8000
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]