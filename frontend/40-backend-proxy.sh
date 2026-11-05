#!/bin/sh
# רץ אוטומטית בעליית nginx (מתוך /docker-entrypoint.d).
# BACKEND_URL=http://backend:8000  -> nginx מעביר את /api ו-/health לשרת (docker compose)
# BACKEND_URL=none                  -> בלי proxy; ה-Load Balancer מנתב (Cloud Run)
set -eu

CONF_DIR=/etc/nginx/backend-proxy
CONF_FILE="$CONF_DIR/proxy.conf"
mkdir -p "$CONF_DIR"
rm -f "$CONF_FILE"

if [ -z "${BACKEND_URL:-}" ] || [ "$BACKEND_URL" = "none" ]; then
    echo "backend-proxy: disabled (requests to /api are routed by the load balancer)"
    exit 0
fi

BACKEND_URL="${BACKEND_URL%/}"
cat > "$CONF_FILE" <<EOF
location /api/ {
    proxy_pass $BACKEND_URL;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
}

location = /health {
    proxy_pass $BACKEND_URL;
}
EOF
echo "backend-proxy: /api and /health -> $BACKEND_URL"
