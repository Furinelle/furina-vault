#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 Docker。请先按 https://docs.docker.com/engine/install/ 安装 Docker Engine 与 Compose 插件。" >&2
  exit 1
fi

if [[ ! -f docker-compose.yml ]]; then
  echo "请从包含 docker-compose.yml 的项目目录运行 deploy/install.sh。" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  umask 077
  default_image_version=$(git describe --tags --always --dirty 2>/dev/null || printf 'worktree')
  default_image_version=${default_image_version//[^A-Za-z0-9_.-]/-}
  cat > .env <<EOF
DB_PASSWORD=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
STORAGE_CREDENTIALS_SECRET=$(openssl rand -hex 32)
IMAGE_VERSION=$default_image_version
VITE_API_URL=https://api.example.com
CORS_ORIGIN=https://cloud.example.com
OAUTH_CALLBACK_BASE_URL=https://api.example.com
OAUTH_FRONTEND_ORIGIN=https://cloud.example.com
DOMAIN=cloud.example.com
COOKIE_SECURE=true
EOF
  echo "已创建 .env。请先编辑其中的 Web/API 域名，再重新运行本脚本。"
  exit 2
fi

docker compose config --quiet
docker compose up -d --build
docker compose ps

echo
echo "Compose 服务已启动。请在宿主机 Nginx/面板中配置 HTTPS："
echo "  Web  -> http://127.0.0.1:47832"
echo "  API  -> http://127.0.0.1:51947"
echo "验证：curl -fsS http://127.0.0.1:51947/readyz"
