#!/usr/bin/env bash
# Smoke test for the running stack: health, a real round trip, and a contract check
# (Schemathesis) for the templates and every service. Used by `make smoke` and CI.
set -euo pipefail
cd "$(dirname "$0")/.."

SCHEMATHESIS_IMAGE=${SCHEMATHESIS_IMAGE:-schemathesis/schemathesis:stable}
MAILPIT=${MAILPIT:-http://localhost:8025}
fail=0

# contract_check <spec> <base url> [extra schemathesis args...]
contract_check() {
  local spec=$1 base=$2
  shift 2
  docker run --rm --network host -v "$PWD/contracts:/contracts:ro" "$SCHEMATHESIS_IMAGE" \
    run "/contracts/openapi/$spec" --url "$base" --checks all --max-examples 50 \
    --exclude-checks positive_data_acceptance "$@" || fail=1
}

# Read the whole body first: `curl | grep -q` fails under pipefail when grep exits early and
# curl gets SIGPIPE on a large body (Spring's Prometheus output).
check_metrics() {
  local metrics
  metrics=$(curl -fsS "$1/metrics")
  if grep -q '^http_' <<<"$metrics"; then echo "   metrics ok"; else echo "   no http metrics at $1"; fail=1; fi
}

json_field() { python3 -c "import json,sys; print(json.load(sys.stdin)[\"$1\"])"; }

for port in 8102; do
  base="http://localhost:$port"
  echo "== template $base"
  curl -fsS "$base/health/live" >/dev/null
  curl -fsS "$base/health/ready" >/dev/null
  id=$(curl -fsS -X POST -H 'Content-Type: application/json' -d '{"name":"smoke"}' "$base/v1/items" | json_field id)
  curl -fsS "$base/v1/items/$id" >/dev/null
  check_metrics "$base"
  contract_check _template.yaml "$base"
done

base=http://localhost:8081
echo "== auth-profile $base"
curl -fsS "$base/health/ready" >/dev/null
curl -fsS "$base/.well-known/jwks.json" >/dev/null
curl -fsS -X POST "$base/v1/auth/guest" | json_field access_token >/dev/null
# A real email sign-in: the code comes back through Mailpit.
email="smoke-$(date +%s)-$RANDOM@example.com"
curl -fsS -X POST -H 'Content-Type: application/json' -d "{\"email\":\"$email\"}" "$base/v1/auth/email/start"
sleep 1
code=$(curl -fsS "$MAILPIT/api/v1/messages?limit=200" | python3 -c "
import json, re, sys
for m in json.load(sys.stdin)['messages']:
    if m['To'][0]['Address'] == '$email':
        print(re.search(r'\d{6}', m['Subject']).group()); break")
token=$(curl -fsS -X POST -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"code\":\"$code\"}" \
  "$base/v1/auth/email/verify" | json_field access_token)
echo "   email sign-in ok"
# A profile to read back, so the contract check exercises GET /v1/profile beyond its 404.
curl -fsS -X PUT -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
  -d "{\"username\":\"smoke$(date +%s)\",\"country\":\"MA\",\"settings\":{},\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
  "$base/v1/profile" >/dev/null
check_metrics "$base"
contract_check auth-profile.yaml "$base" --header "Authorization: Bearer $token"

start='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
base=http://localhost:8084
echo "== analysis $base"
curl -fsS "$base/health/ready" >/dev/null
best=$(curl -fsS -H 'Content-Type: application/json' -d "{\"fen\":\"$start\",\"depth\":8,\"multipv\":1}" \
  "$base/v1/analysis/positions" | json_field bestmove)
[[ $best =~ ^[a-h][1-8][a-h][1-8]$ ]] || { echo "   bestmove '$best' from the start position"; fail=1; }
check_metrics "$base"
# A JSON search may take up to SEARCH_LIMIT_MS (20 s): wait as long as the gateway would.
contract_check analysis.yaml "$base" --request-timeout 30

# The real path from the desktop app: everything through the gateway.
gw=http://localhost:8080
echo "== gateway $gw"
curl -fsS "$gw/health/ready" >/dev/null
email="via-gateway-$(date +%s)-$RANDOM@example.com"
curl -fsS -X POST -H 'Content-Type: application/json' -d "{\"email\":\"$email\"}" "$gw/v1/auth/email/start"
sleep 1
code=$(curl -fsS "$MAILPIT/api/v1/messages?limit=200" | python3 -c "
import json, re, sys
for m in json.load(sys.stdin)['messages']:
    if m['To'][0]['Address'] == '$email':
        print(re.search(r'\d{6}', m['Subject']).group()); break")
token=$(curl -fsS -X POST -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"code\":\"$code\"}" \
  "$gw/v1/auth/email/verify" | json_field access_token)
status=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" "$gw/v1/profile")
[[ $status == 404 ]] || { echo "   GET /v1/profile through the gateway: $status, want 404 (no profile yet)"; fail=1; }
# What the Settings credential cards read.
label=$(curl -fsS -H "Authorization: Bearer $token" "$gw/v1/auth/identities" |
  python3 -c "import json, sys; print(json.load(sys.stdin)[0]['label'])")
[[ $label == "$email" ]] || { echo "   identities through the gateway: got '$label', want $email"; fail=1; }
status=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer not.a.token" "$gw/v1/profile")
[[ $status == 401 ]] || { echo "   a bad token got $status at the gateway, want 401"; fail=1; }
status=$(curl -s -o /dev/null -w '%{http_code}' "$gw/.well-known/jwks.json")
[[ $status == 404 ]] || { echo "   the JWKS is public through the gateway ($status)"; fail=1; }
# Analysis through the gateway: a guest token is enough; none is not.
guest=$(curl -fsS -X POST "$gw/v1/auth/guest" | json_field access_token)
body="{\"fen\":\"$start\",\"moves\":[\"e2e4\"],\"depth\":6,\"multipv\":2}"
side=$(curl -fsS -H "Authorization: Bearer $guest" -H 'Content-Type: application/json' -d "$body" \
  "$gw/v1/analysis/positions" | json_field side_to_move)
[[ $side == b ]] || { echo "   analysis through the gateway: side_to_move '$side', want b"; fail=1; }
events=$(curl -fsSN -H "Authorization: Bearer $guest" -H 'Accept: text/event-stream' -H 'Content-Type: application/json' \
  -d "{\"fen\":\"$start\",\"depth\":7,\"multipv\":1}" "$gw/v1/analysis/positions" | grep -c '^event: result' || true)
[[ $events == 1 ]] || { echo "   analysis stream through the gateway: $events result events, want 1"; fail=1; }
status=$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d "$body" "$gw/v1/analysis/positions")
[[ $status == 401 ]] || { echo "   analysis without a token got $status at the gateway, want 401"; fail=1; }
check_metrics "$gw"
echo "   email sign-in, identities, profile, analysis and token checks through the gateway ok"

exit $fail
