#!/usr/bin/env bash
# Smoke test for the running stack: health, a create/read round trip, and a contract check
# (Schemathesis) for every template. Used by `make smoke` and CI.
set -euo pipefail
cd "$(dirname "$0")/.."

SCHEMATHESIS_IMAGE=${SCHEMATHESIS_IMAGE:-schemathesis/schemathesis:stable}
fail=0
for port in 8101 8102 8103; do
  base="http://localhost:$port"
  echo "== $base"
  curl -fsS "$base/health/live" >/dev/null
  curl -fsS "$base/health/ready" >/dev/null
  id=$(curl -fsS -X POST -H 'Content-Type: application/json' -d '{"name":"smoke"}' "$base/v1/items" \
       | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
  curl -fsS "$base/v1/items/$id" >/dev/null
  # Read the whole body first: `curl | grep -q` fails under pipefail when grep exits early
  # and curl gets SIGPIPE on a large body (Spring's Prometheus output).
  metrics=$(curl -fsS "$base/metrics")
  if grep -q '^http_' <<<"$metrics"; then
    echo "   health, round trip and metrics ok"
  else
    echo "   no http metrics on $port"; fail=1
  fi
  docker run --rm --network host -v "$PWD/contracts:/contracts:ro" "$SCHEMATHESIS_IMAGE" \
    run /contracts/openapi/_template.yaml --url "$base" --checks all --max-examples 50 \
    --exclude-checks positive_data_acceptance || fail=1
done
exit $fail
