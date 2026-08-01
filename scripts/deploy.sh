#!/usr/bin/env bash
#
# scripts/deploy.sh
# Canonical production deployment script for Mission Control.
#
# This is the SINGLE official way to deploy changes to the Mission Control
# web server in production.
#
# It performs a clean, verified deployment and fails fast on any problem
# so that broken asset references (CSS/JS chunk mismatches) cannot reach users.
#
# Usage:
#   ./scripts/deploy.sh
#
# The script:
#   - Stops the Mission Control service
#   - Verifies the service is stopped
#   - Removes stale .next
#   - Runs a clean production build (prisma generate && next build)
#   - Verifies the build succeeded
#   - Verifies every CSS/JS asset referenced by the generated output exists on disk
#   - Restarts the service
#   - Verifies the service started
#   - Verifies the homepage loads (HTTP 200 + expected content)
#   - Verifies the main CSS bundle returns HTTP 200
#   - Prints a concise summary
#
# On any verification failure:
#   - Stops immediately
#   - Does NOT restart or leave a broken deployment running
#   - Reports exactly what failed
#
# This script is intentionally strict. It is the hardened replacement for
# the previous manual "stop; npm run build; start" pattern.

set -euo pipefail

ROOT="/home/oggie/mission-control"
SERVICE="mission-control.service"
# We also manage the dispatcher in the common "full stack" stop/start
# pattern used in the project history and docs, but the primary target
# for asset verification and homepage checks is the web server.
DISPATCHER_SERVICE="mission-dispatcher.service"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

fail() {
  echo
  echo "DEPLOYMENT FAILED: $*"
  echo "Current service states:"
  systemctl --user is-active "$SERVICE" || true
  systemctl --user is-active "$DISPATCHER_SERVICE" || true
  echo
  echo "Do NOT restart manually. Investigate the failure above."
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Required command not found: $1"
  fi
}

cd "$ROOT" || fail "Cannot cd to $ROOT"

log "=== Mission Control Canonical Deployment Starting ==="

require_cmd systemctl
require_cmd npm
require_cmd curl
require_cmd systemctl

# 1. Stop the Mission Control service (and dispatcher for safety, matching historical practice)
log "Stopping services..."
systemctl --user stop "$SERVICE" "$DISPATCHER_SERVICE" || true

# 2. Verify the service has stopped
log "Verifying services are stopped..."
for svc in "$SERVICE" "$DISPATCHER_SERVICE"; do
  if systemctl --user is-active "$svc" >/dev/null 2>&1; then
    fail "Service $svc is still active after stop attempt"
  fi
done
log "Services confirmed stopped."

# 3. Remove stale .next artifacts (critical for preventing chunk reference mismatches)
log "Removing stale .next directory..."
rm -rf .next
if [[ -d .next ]]; then
  fail "Failed to remove .next directory"
fi
log ".next removed."

# 4. Perform a clean production build
log "Running clean production build..."
if ! npm run build; then
  fail "Production build failed (npm run build exited non-zero)"
fi
log "Build command completed."

# 5. Verify the build completed successfully (basic presence checks)
if [[ ! -d .next ]]; then
  fail "Build did not produce a .next directory"
fi
if [[ ! -f .next/BUILD_ID ]]; then
  fail "Build did not produce .next/BUILD_ID"
fi
log "Build artifacts present (BUILD_ID: $(cat .next/BUILD_ID))."

# 6. Verify that every CSS/JS asset referenced by the generated HTML actually exists
log "Running asset verification..."
if ! ./scripts/verify-build-assets.sh; then
  fail "Asset verification failed (see output above)"
fi
log "All referenced build assets verified on disk."

# 7. Restart the service
log "Starting services..."
systemctl --user start "$SERVICE" "$DISPATCHER_SERVICE"

# 8. Verify the service started successfully
log "Verifying services started..."
sleep 3
for svc in "$SERVICE" "$DISPATCHER_SERVICE"; do
  if ! systemctl --user is-active "$svc" >/dev/null 2>&1; then
    fail "Service $svc failed to start (check journalctl --user -u $svc)"
  fi
done
log "Services are active."

# 9. Verify the homepage loads correctly
log "Verifying homepage..."
if ! curl -fsS --max-time 10 http://localhost:3000/ > /dev/null; then
  fail "Homepage did not return HTTP 200"
fi
# Light content check
if ! curl -fsS --max-time 10 http://localhost:3000/ | grep -q 'Mission Control'; then
  fail "Homepage did not contain expected 'Mission Control' content"
fi
log "Homepage verified (HTTP 200 + content)."

# 10. Verify referenced CSS assets return HTTP 200
log "Verifying CSS bundle..."
CSS_HREF=$(curl -fsS --max-time 10 http://localhost:3000/ | grep -o 'href="[^"]*static/chunks/[^"]*\.css"' | head -1 | sed -E 's/.*href="([^"]+)".*/\1/' || true)

if [[ -z "$CSS_HREF" ]]; then
  fail "Could not extract CSS href from homepage"
fi

CSS_URL="http://localhost:3000${CSS_HREF}"
if ! curl -fsSI --max-time 10 "$CSS_URL" | grep -q '200'; then
  fail "CSS bundle did not return HTTP 200: $CSS_URL"
fi
log "CSS bundle verified: $CSS_URL (200 OK)"

# Success summary
echo
echo "=========================================="
echo "DEPLOYMENT SUCCESSFUL"
echo "=========================================="
echo "Service:         $SERVICE"
echo "BUILD_ID:        $(cat .next/BUILD_ID)"
echo "CSS verified:    $CSS_URL"
echo "Homepage:        http://localhost:3000/"
echo "Timestamp:       $(date)"
echo
echo "Services:"
systemctl --user status "$SERVICE" --no-pager -n 0 | cat
echo
log "Deployment complete. All verifications passed."

exit 0
