#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <experiment-name> [agent-eval-options...]" >&2
  exit 1
fi

experiment_name="$1"
shift
run_date="${RUN_DATE:-$(date -u +%F)}"
run_directory="$repository_root/results/experiments/$experiment_name/$run_date"

if [[ ! "$experiment_name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "Experiment name must be a file name without its extension" >&2
  exit 1
fi

if [[ ! "$run_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "RUN_DATE must use the YYYY-MM-DD format" >&2
  exit 1
fi

node "$repository_root/packages/agent-eval/bin/agent-eval" \
  --experiment "$experiment_name" \
  --experiments "$repository_root/experiments" \
  --concurrency "${CONCURRENCY:-1}" \
  --docker-image "${DOCKER_IMAGE:-node:26.5.0-slim}" \
  --output-dir "$run_directory" \
  --scenarios "$repository_root/scenarios" \
  "$@"
