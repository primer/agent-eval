#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <benchmark|experiment> [evaluation-source-directory]" >&2
  exit 1
fi

evaluation_type="$1"
source_directory="${2:-$repository_root}"

case "$evaluation_type" in
  benchmark) results_directory="$repository_root/results/benchmarks" ;;
  experiment) results_directory="$repository_root/results/experiments" ;;
  *)
    echo "Evaluation type must be benchmark or experiment" >&2
    exit 1
    ;;
esac

outputs=()
if [[ -d "$results_directory" ]]; then
  while IFS= read -r -d '' output; do
    outputs+=("$output")
  done < <(find "$results_directory" -type f -name output.json -print0)
fi

if [[ ${#outputs[@]} -ne 1 ]]; then
  echo "Expected exactly one merged $evaluation_type result bundle in $results_directory; found ${#outputs[@]}" >&2
  exit 1
fi

source_directory="$(cd "$source_directory" && pwd)"
args=(
  "$evaluation_type" retry
  --benchmarks "$source_directory/benchmarks"
  --scenarios "$source_directory/scenarios"
  --output-dir "$(dirname "${outputs[0]}")"
  --copilot-concurrency "${COPILOT_CONCURRENCY:-2}"
  --container-concurrency "${CONTAINER_CONCURRENCY:-2}"
)
if [[ "$evaluation_type" == experiment ]]; then
  args+=(--experiments "$source_directory/experiments")
fi

cd "$source_directory"
node "$repository_root/packages/agent-eval/bin/agent-eval" "${args[@]}"
