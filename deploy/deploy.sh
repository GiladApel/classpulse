#!/usr/bin/env bash
# Build locally, ship to the server, (re)start the stack. Run from Git Bash: deploy/deploy.sh
# First run also creates /opt/classpulse/.env (fresh PB superuser; Gemini/Sheets settings copied from the local .env)
# and copies secrets/google-sa.json. Secrets are piped over SSH, never printed.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${HOST:-do-server}
ROOT=/opt/classpulse

npm run build -w apps/api
VITE_PB_URL=/pb VITE_API_URL=/api npm run build -w apps/web

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/src/apps/api" "$STAGE/src/apps/web"
cp deploy/docker-compose.yml deploy/pocketbase.Dockerfile deploy/nginx.conf "$STAGE/"
cp -r pocketbase/pb_migrations "$STAGE/pb_migrations"
cp -r apps/web/dist "$STAGE/web"
cp package.json package-lock.json "$STAGE/src/"
cp apps/api/package.json apps/api/Dockerfile "$STAGE/src/apps/api/"
cp -r apps/api/dist "$STAGE/src/apps/api/dist"
cp apps/web/package.json "$STAGE/src/apps/web/"

ssh "$HOST" "mkdir -p $ROOT/secrets $ROOT/pb_data && chmod 700 $ROOT/secrets"

if ! ssh "$HOST" "test -f $ROOT/.env"; then
  echo "First deploy: creating $ROOT/.env"
  {
    echo "PB_SUPERUSER_EMAIL=admin@classpulse.local"
    echo "PB_SUPERUSER_PASSWORD=$(openssl rand -hex 24)"
    grep -E '^(LLM_PROVIDER|GEMINI_API_KEY|GEMINI_MODEL|GOOGLE_SHEETS_ID|QR_WINDOW_SEC)=' .env || true
  } | ssh "$HOST" "umask 077 && cat > $ROOT/.env"
fi
if [ -f secrets/google-sa.json ] && ! ssh "$HOST" "test -s $ROOT/secrets/google-sa.json"; then
  ssh "$HOST" "umask 077 && cat > $ROOT/secrets/google-sa.json" < secrets/google-sa.json
fi
ssh "$HOST" "test -e $ROOT/secrets/google-sa.json || (umask 077 && echo '{}' > $ROOT/secrets/google-sa.json)"
ssh "$HOST" "chown 1000:1000 $ROOT/secrets/google-sa.json"  # the api container runs as node (uid 1000)

BEFORE=$(ssh "$HOST" "cat $ROOT/pb_migrations/*.js 2>/dev/null | sha1sum")
ssh "$HOST" "rm -rf $ROOT/web $ROOT/src"
tar -C "$STAGE" -cz . | ssh "$HOST" "tar -xz -C $ROOT --no-same-owner"
AFTER=$(ssh "$HOST" "cat $ROOT/pb_migrations/*.js | sha1sum")

ssh "$HOST" "cd $ROOT && docker compose up -d --build --wait pocketbase"
if [ "$BEFORE" != "$AFTER" ]; then
  echo "Migrations changed: restarting PocketBase"
  ssh "$HOST" "cd $ROOT && docker compose restart pocketbase && docker compose up -d --wait pocketbase"
fi
ssh "$HOST" 'cd '"$ROOT"' && set -a && . ./.env && set +a && docker compose exec -T pocketbase /pb/pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD" --dir=/pb/pb_data >/dev/null'
ssh "$HOST" "cd $ROOT && docker compose up -d --build --remove-orphans --force-recreate api web"

for _ in $(seq 30); do
  ssh "$HOST" "curl -sf http://127.0.0.1:8092/pb/api/health >/dev/null && curl -sf -o /dev/null http://127.0.0.1:8092/api/health" && { echo "Up: http://127.0.0.1:8092 on $HOST"; exit 0; }
  sleep 2
done
echo "Not healthy. See: ssh $HOST 'cd $ROOT && docker compose logs --tail 50'"
exit 1
