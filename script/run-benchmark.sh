#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
benchmark_name='design-system'
run_date="${RUN_DATE:-$(date -u +%F)}"
run_directory="$repository_root/results/benchmarks/$benchmark_name/$run_date"

if [[ ! "$benchmark_name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "BENCHMARK_NAME must be a benchmark file name without its extension" >&2
  exit 1
fi

if [[ ! "$run_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "RUN_DATE must use the YYYY-MM-DD format" >&2
  exit 1
fi

node "$repository_root/packages/agent-eval/bin/agent-eval" \
  --benchmark "$benchmark_name" \
  --benchmarks "$repository_root/benchmarks" \
  --concurrency "${CONCURRENCY:-1}" \
  --output-dir "$run_directory" \
  --scenarios "$repository_root/scenarios"
