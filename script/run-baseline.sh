#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run_date="${RUN_DATE:-$(date -u +%F)}"
output_file="${OUTPUT_FILE:-output.json}"
run_directory="$repository_root/results/$run_date"

if [[ ! "$run_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "RUN_DATE must use the YYYY-MM-DD format" >&2
  exit 1
fi

arguments=(
  --artifacts "$run_directory/artifacts"
  --concurrency "${CONCURRENCY:-1}"
  --docker-image "${DOCKER_IMAGE:-node:26.5.0-slim}"
  --experiment baseline
  --experiments "$repository_root/experiments"
  --output "$run_directory/$output_file"
  --scenarios "$repository_root/scenarios"
)

if [[ -n "${SHARD:-}" ]]; then
  arguments+=(--shard "$SHARD")
fi

node "$repository_root/packages/agent-eval/dist/cli.js" "${arguments[@]}"
