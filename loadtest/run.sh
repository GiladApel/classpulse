#!/usr/bin/env bash
# NFR-02 load test. Usage: loadtest/run.sh <baseUrl> [students=80]
# Needs k6, PB_SUPERUSER_EMAIL/PB_SUPERUSER_PASSWORD, and PB_ADMIN_URL when baseUrl goes through Cloudflare.
# With SSH_HOST set (e.g. do-server), also prints server-side check-in latency from the nginx log (excludes the network).
set -uo pipefail
cd "$(dirname "$0")/.."
BASE=${1:?baseUrl}
N=${2:-80}
lt() { npm run -s loadtest -w apps/api -- "$@"; }

lt prepare "$BASE" "$N" || exit 1
START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
lt listen 100 &
LISTENER=$!
sleep 10 # subscribers connect before the first check-in
k6 run --quiet loadtest/checkin.js
K6=$?
wait $LISTENER
RT=$?
if [ -n "${SSH_HOST:-}" ]; then
  ssh "$SSH_HOST" "cd /opt/classpulse && docker compose logs --no-log-prefix --since $START web" |
    awk '$2 == "POST" && $3 == "/api/checkins" { print $5 }' | sort -n |
    awk '{ v[NR] = $1 * 1000 } END { if (NR) printf "server-side POST /checkins: n=%d p50=%.0f ms p95=%.0f ms max=%.0f ms\n", NR, v[int(NR * 0.5 + 0.5)], v[int(NR * 0.95 + 0.5)], v[NR] }'
fi
lt cleanup
rm -f loadtest/.fixture.json
echo "k6: $([ $K6 = 0 ] && echo pass || echo FAIL), realtime: $([ $RT = 0 ] && echo pass || echo FAIL)"
[ $K6 = 0 ] && [ $RT = 0 ]
