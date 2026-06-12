#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${PROJECT_NAME:-sms-touch-platform}"
APP_URL="${APP_URL:-http://8.160.191.50:3100}"
PORT="${PORT:-3100}"
PULL=false
SEED=false
SKIP_DB_SYNC=false

usage() {
  cat <<'USAGE'
短信触达平台服务器重部署脚本

用法:
  ./scripts/redeploy.sh [options]

选项:
  --pull          部署前执行 git pull --ff-only
  --seed          部署后刷新基础/演示数据
  --skip-db-sync  跳过 Prisma schema 同步
  -h, --help      查看帮助

环境变量:
  APP_URL         对外访问地址，默认 http://8.160.191.50:3100
  PORT            应用端口，默认 3100
  PROJECT_NAME    Docker Compose 项目名，默认 sms-touch-platform

示例:
  ./scripts/redeploy.sh --pull
  APP_URL=http://your-domain.com ./scripts/redeploy.sh --pull
USAGE
}

log() {
  printf '\033[1;34m[redeploy]\033[0m %s\n' "$1"
}

fail() {
  printf '\033[1;31m[redeploy]\033[0m %s\n' "$1" >&2
  exit 1
}

set_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s#^${key}=.*#${key}=${value}#" .env
  else
    printf '\n%s=%s\n' "$key" "$value" >> .env
  fi
}

for arg in "$@"; do
  case "$arg" in
    --pull)
      PULL=true
      ;;
    --seed)
      SEED=true
      ;;
    --skip-db-sync)
      SKIP_DB_SYNC=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "未知参数: $arg"
      ;;
  esac
done

cd "$ROOT_DIR"

command -v docker >/dev/null 2>&1 || fail "未找到 docker。"
docker compose version >/dev/null 2>&1 || fail "未找到 docker compose。"

if [[ "$PULL" == "true" ]]; then
  if [[ ! -d ".git" ]]; then
    fail "当前目录不是 Git 仓库，无法执行 --pull。请先用 git clone 部署项目。"
  fi
  log "拉取最新代码。"
  git pull --ff-only
fi

if [[ ! -f ".env" ]]; then
  [[ -f ".env.example" ]] || fail "未发现 .env，也没有 .env.example。"
  log "创建 .env。"
  cp .env.example .env
fi

log "修正容器运行环境变量。"
set_env NODE_ENV production
set_env HOST 0.0.0.0
set_env PORT "$PORT"
set_env DATABASE_URL "postgresql://sms_touch:sms_touch_dev@postgres:5432/sms_touch?schema=public"
set_env SHORT_LINK_BASE_URL "$APP_URL"

log "构建并启动 Docker 服务。"
docker compose -p "$PROJECT_NAME" up -d --build app

if [[ "$SKIP_DB_SYNC" == "false" ]]; then
  log "同步 Prisma schema。"
  docker compose -p "$PROJECT_NAME" exec -T app npx prisma db push
fi

if [[ "$SEED" == "true" ]]; then
  log "刷新 seed 数据。"
  docker compose -p "$PROJECT_NAME" exec -T app npm run db:seed
fi

log "重启应用容器。"
docker compose -p "$PROJECT_NAME" restart app

log "等待服务就绪。"
ready=false
for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done

[[ "$ready" == "true" ]] || fail "服务未在预期时间内就绪，请执行 docker compose -p ${PROJECT_NAME} logs app 查看日志。"

log "部署完成。"
docker compose -p "$PROJECT_NAME" ps
printf '\n访问地址: %s\n' "$APP_URL"
