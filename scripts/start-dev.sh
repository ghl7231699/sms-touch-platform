#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

WITH_SEED=false
WITH_WORKER=false
SKIP_DB=false
SKIP_MIGRATE=false
INSTALL=false
STOP_ONLY=false
API_PORT="${API_PORT:-3100}"
WEB_PORT="${WEB_PORT:-5173}"

usage() {
  cat <<'USAGE'
短信触达平台本地开发启动脚本

用法:
  ./scripts/start-dev.sh [options]

选项:
  --seed          启动前写入/刷新演示数据
  --worker        启动 API 内置任务 worker，同时启动 Web
  --install       启动前执行 npm install
  --stop          只关闭当前 API/Web 开发服务，不重新启动
  --skip-db       跳过 Docker PostgreSQL 启动和健康检查
  --skip-migrate  跳过 Prisma migration
  -h, --help      查看帮助

示例:
  ./scripts/start-dev.sh
  ./scripts/start-dev.sh --seed
  ./scripts/start-dev.sh --worker
  ./scripts/start-dev.sh --stop
USAGE
}

log() {
  printf '\033[1;34m[start-dev]\033[0m %s\n' "$1"
}

fail() {
  printf '\033[1;31m[start-dev]\033[0m %s\n' "$1" >&2
  exit 1
}

stop_port() {
  local port="$1"
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  fi

  if [[ -z "$pids" ]]; then
    log "端口 $port 未被占用。"
    return
  fi

  log "关闭占用端口 $port 的进程: ${pids//$'\n'/ }"
  kill $pids 2>/dev/null || true

  for _ in {1..20}; do
    sleep 0.2
    local alive=""
    for pid in $pids; do
      if kill -0 "$pid" 2>/dev/null; then
        alive="$alive $pid"
      fi
    done
    if [[ -z "$alive" ]]; then
      return
    fi
  done

  log "进程未正常退出，强制关闭:${alive}"
  kill -9 $alive 2>/dev/null || true
}

stop_dev_services() {
  stop_port "$API_PORT"
  stop_port "$WEB_PORT"
}

for arg in "$@"; do
  case "$arg" in
    --seed)
      WITH_SEED=true
      ;;
    --worker)
      WITH_WORKER=true
      ;;
    --install)
      INSTALL=true
      ;;
    --stop)
      STOP_ONLY=true
      ;;
    --skip-db)
      SKIP_DB=true
      ;;
    --skip-migrate)
      SKIP_MIGRATE=true
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

command -v node >/dev/null 2>&1 || fail "未找到 node，请先安装 Node.js 20 或以上。"
command -v npm >/dev/null 2>&1 || fail "未找到 npm，请先安装 Node.js。"

stop_dev_services

if [[ "$STOP_ONLY" == "true" ]]; then
  log "开发服务已关闭。"
  exit 0
fi

if [[ ! -f ".env" ]]; then
  if [[ -f ".env.example" ]]; then
    log "未发现 .env，已从 .env.example 复制一份。"
    cp .env.example .env
  else
    fail "未发现 .env，也没有 .env.example 可复制。"
  fi
fi

if [[ "$INSTALL" == "true" || ! -d "node_modules" ]]; then
  log "安装 npm 依赖。"
  npm install
fi

if [[ "$SKIP_DB" == "false" ]]; then
  command -v docker >/dev/null 2>&1 || fail "未找到 docker，请先启动 Docker Desktop。"
  log "启动 PostgreSQL 容器。"
  docker compose -p sms-touch-platform up -d postgres

  log "等待 PostgreSQL 就绪。"
  ready=false
  for _ in {1..40}; do
    if docker exec sms-touch-postgres pg_isready -U sms_touch -d sms_touch >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 1
  done
  [[ "$ready" == "true" ]] || fail "PostgreSQL 未在预期时间内就绪，请检查 Docker 容器状态。"
fi

if [[ "$SKIP_MIGRATE" == "false" ]]; then
  log "执行 Prisma migration。"
  npm run db:migrate
fi

if [[ "$WITH_SEED" == "true" ]]; then
  log "写入/刷新演示数据。"
  npm run db:seed
fi

log "启动开发服务。"
log "Web: http://127.0.0.1:${WEB_PORT}"
log "API: http://127.0.0.1:${API_PORT}"

if [[ "$WITH_WORKER" == "true" ]]; then
  log "任务 worker 已启用。"
  SMS_TASK_WORKER_ENABLED=true npm run dev
else
  npm run dev
fi
