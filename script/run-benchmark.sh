#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <benchmark-name> [run|plan|shard|merge] [agent-eval-options...]" >&2
  exit 1
fi

benchmark_name="$1"
shift
mode="run"
if [[ $# -gt 0 && "$1" != --* ]]; then
  mode="$1"
  shift
fi

run_date="${RUN_DATE:-$(date -u +%F)}"
run_directory="$repository_root/results/benchmarks/$benchmark_name/$run_date"
plan_path="$run_directory/plan.json"

if [[ ! "$benchmark_name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "Benchmark name must be a file name without its extension" >&2
  exit 1
fi

if [[ ! "$run_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "RUN_DATE must use the YYYY-MM-DD format" >&2
  exit 1
fi

case "$mode" in
  run)
    node "$repository_root/packages/agent-eval/bin/agent-eval" \
      --benchmark "$benchmark_name" \
      --benchmarks "$repository_root/benchmarks" \
      --concurrency "${CONCURRENCY:-1}" \
      --docker-image "${DOCKER_IMAGE:-node:26.5.0-slim}" \
      --output-dir "$run_directory" \
      --scenarios "$repository_root/scenarios" \
      "$@"
    ;;
  plan)
    node "$repository_root/packages/agent-eval/bin/agent-eval" \
      --benchmark "$benchmark_name" \
      --benchmarks "$repository_root/benchmarks" \
      --plan "$plan_path" \
      --scenarios "$repository_root/scenarios" \
      "$@"
    ;;
  shard)
    if [[ ! "${SHARD:-}" =~ ^([1-9][0-9]*)/([1-9][0-9]*)$ ]]; then
      echo "SHARD must use the order/total format" >&2
      exit 1
    fi

    node "$repository_root/packages/agent-eval/bin/agent-eval" \
      --benchmarks "$repository_root/benchmarks" \
      --concurrency "${CONCURRENCY:-1}" \
      --docker-image "${DOCKER_IMAGE:-node:26.5.0-slim}" \
      --from-plan "$plan_path" \
      --output-dir "$run_directory" \
      --scenarios "$repository_root/scenarios" \
      --shard "$SHARD" \
      "$@"
    ;;
  merge)
    node "$repository_root/packages/agent-eval/bin/agent-eval" \
      --merge-results \
      --output-dir "$run_directory" \
      "$@"
    rm -f "$run_directory"/output-*.json
    ;;
  *)
    echo "Mode must be one of: run, plan, shard, merge" >&2
    exit 1
    ;;
esac
