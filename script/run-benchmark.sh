#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
benchmark_name="${BENCHMARK_NAME:?BENCHMARK_NAME is required}"
run_date="${RUN_DATE:-$(date -u +%F)}"

if [[ ! "$benchmark_name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "BENCHMARK_NAME must be a benchmark file name without its extension" >&2
  exit 1
fi

if [[ ! "$run_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "RUN_DATE must use the YYYY-MM-DD format" >&2
  exit 1
fi

node "$repository_root/packages/agent-eval/dist/cli.js" \
  --artifacts "$repository_root/artifacts" \
  --benchmark "$benchmark_name" \
  --benchmarks "$repository_root/benchmarks" \
  --concurrency "${CONCURRENCY:-1}" \
  --docker-image "${DOCKER_IMAGE:-node:26.5.0-slim}" \
  --output "$repository_root/results/benchmarks/$benchmark_name/$run_date/output.json" \
  --scenarios "$repository_root/scenarios"
