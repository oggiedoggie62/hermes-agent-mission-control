#!/usr/bin/env bash
# agent: codex | model: gpt-5 | date: 2026-07-22
set -euo pipefail

prompt="${2:-}"
mission_id="$(sed -n 's/^Mission ID: //p' <<<"$prompt" | head -1)"
execution_id="$(sed -n 's/^Execution ID: //p' <<<"$prompt" | head -1)"
debrief_path="$(sed -n 's/^1\. You MUST write the debrief to this exact absolute path: //p' <<<"$prompt")"
description="$(sed -n 's/^Description: //p' <<<"$prompt")"
control_dir="${MISSION_DISPATCH_TEST_CONTROL:?MISSION_DISPATCH_TEST_CONTROL is required}"

printf '%s\n' "$execution_id" >> "$control_dir/launches.log"
touch "$control_dir/started-$execution_id"
while [[ ! -f "$control_dir/release-$execution_id" ]]; do
  sleep 0.05
done

if [[ "$description" != *"[stub:missing-debrief]"* && "$description" != *"[stub:diagnostic-failure]"* ]]; then
  mkdir -p "$(dirname "$debrief_path")"
  if [[ "$description" == *"[stub:malformed-debrief]"* ]]; then
    printf '%s\n' \
      '## Summary' \
      'Controlled malformed debrief.' \
      '## Work Performed' \
      'Created an intentionally incomplete artifact.' > "$debrief_path"
  else
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
fi

if [[ "$description" == *"[stub:invalid-acknowledgement]"* ]]; then
  printf 'Controlled result for %s\n' "$execution_id"
elif [[ "$description" == *"[stub:wrong-path-acknowledgement]"* ]]; then
  printf '%s\n' \
    'MISSION CONTROL COMPLETION' \
    "Mission ID: $mission_id" \
    "Execution ID: $execution_id" \
    "Debrief Path: ${debrief_path}.wrong" \
    'Debrief Written: yes' \
    'Result Summary: Controlled dispatcher verification completed.'
elif [[ "$description" == *"[stub:diagnostic-failure]"* ]]; then
  printf 'diagnostic-stdout-start:%05000d:%s\n' 0 "${MISSION_DISPATCH_TEST_SECRET:-missing-secret}"
  printf 'diagnostic-stderr-start:%05000d:%s\n' 0 "${MISSION_DISPATCH_TEST_SECRET:-missing-secret}" >&2
else
  printf '%s\n' \
    'MISSION CONTROL COMPLETION' \
    "Mission ID: $mission_id" \
    "Execution ID: $execution_id" \
    "Debrief Path: $debrief_path" \
    'Debrief Written: yes' \
    'Result Summary: Controlled dispatcher verification completed.'
fi
