#!/usr/bin/env bash
set -euo pipefail

prompt="${2:-}"
execution_id="$(sed -n 's/^Execution ID: //p' <<<"$prompt")"
debrief_path="$(sed -n 's/^Write a debrief to \(.*\)\.$/\1/p' <<<"$prompt")"
description="$(sed -n 's/^Description: //p' <<<"$prompt")"
control_dir="${MISSION_DISPATCH_TEST_CONTROL:?MISSION_DISPATCH_TEST_CONTROL is required}"

printf '%s\n' "$execution_id" >> "$control_dir/launches.log"
touch "$control_dir/started-$execution_id"
while [[ ! -f "$control_dir/release-$execution_id" ]]; do
  sleep 0.05
done

if [[ "$description" != *"[stub:missing-debrief]"* ]]; then
  mkdir -p "$(dirname "$debrief_path")"
  printf '%s\n' \
    '## Summary' \
    'Controlled dispatcher verification completed.' \
    '## Work Performed' \
    'Ran the no-cost Hermes stub.' \
    '## Evidence' \
    'The expected debrief was created.' \
    '## Decisions Made' \
    'No production mission data was used.' > "$debrief_path"
fi

printf 'Controlled result for %s\n' "$execution_id"
