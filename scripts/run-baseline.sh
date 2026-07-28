#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run_date="${RUN_DATE:-$(date -u +%F)}"

if [[ ! "$run_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "RUN_DATE must use the YYYY-MM-DD format" >&2
  exit 1
fi

node "$repository_root/packages/agent-eval/dist/cli.js" \
  --artifacts "$repository_root/artifacts/$run_date" \
  --concurrency "${CONCURRENCY:-1}" \
  --docker-image "${DOCKER_IMAGE:-node:26.5.0-slim}" \
  --experiment baseline \
  --experiments "$repository_root/experiments" \
  --output "$repository_root/results/$run_date/output.json" \
  --scenarios "$repository_root/scenarios"
