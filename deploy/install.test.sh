#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d /tmp/tg-vault-install-test.XXXXXX)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"
cp "$ROOT/deploy/install.sh" "$TMP/install.sh"
cp "$ROOT/docker-compose.yml" "$TMP/docker-compose.yml"

cat > "$TMP/bin/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${DOCKER_CALLS:?}"
SH
chmod +x "$TMP/bin/docker"
export PATH="$TMP/bin:$PATH"
export DOCKER_CALLS="$TMP/docker.calls"

set +e
(
  cd "$TMP"
  ./install.sh
) >/dev/null 2>&1
first_code=$?
set -e
[[ "$first_code" -eq 2 ]]
grep -Eq '^IMAGE_VERSION=[A-Za-z0-9_.-]+$' "$TMP/.env"
grep -q '^OAUTH_CALLBACK_BASE_URL=https://api.example.com$' "$TMP/.env"
grep -q '^OAUTH_FRONTEND_ORIGIN=https://cloud.example.com$' "$TMP/.env"

(
  cd "$TMP"
  ./install.sh
) >/dev/null
grep -q '^compose config --quiet$' "$DOCKER_CALLS"
grep -q '^compose up -d --build$' "$DOCKER_CALLS"
grep -q '^compose ps$' "$DOCKER_CALLS"

echo 'install bootstrap test ok'
