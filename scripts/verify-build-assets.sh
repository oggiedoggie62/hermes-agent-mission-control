#!/usr/bin/env bash
# scripts/verify-build-assets.sh
# Lightweight verification that the key CSS/JS assets referenced by the
# built Next.js app actually exist on disk.
#
# This specifically hardens against the class of failure where a referenced
# main stylesheet (or main JS) is missing, causing unstyled pages.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Verifying critical build assets in .next ..."

if [[ ! -d .next ]]; then
  echo "ERROR: .next directory does not exist. Run a production build first."
  exit 1
fi

missing=0

# 1. Verify at least one main CSS bundle exists (the Tailwind + app styles)
main_css=$(find .next/static/chunks -name '*.css' -type f 2>/dev/null | head -1 || true)
if [[ -z "$main_css" || ! -f "$main_css" ]]; then
  echo "MISSING: No main CSS bundle found in .next/static/chunks/"
  missing=1
else
  echo "Found main CSS: $main_css"
fi

# 2. Verify the root page (or main app) references an existing CSS
# Look in the built static HTML for the primary stylesheet
primary_ref=$(grep -oE '/_next/static/chunks/[^"'\'' ]+\.css' \
  .next/server/app/page.html \
  .next/server/app/index.html \
  .next/server/pages/index.html 2>/dev/null | head -1 || true)

if [[ -n "$primary_ref" ]]; then
  css_file=".next${primary_ref}"
  if [[ ! -f "$css_file" ]]; then
    echo "MISSING primary referenced CSS: $primary_ref"
    missing=1
  else
    echo "Primary CSS reference verified: $primary_ref"
  fi
fi

# 3. Basic sanity: at least one JS chunk for the app should exist
main_js=$(find .next/static/chunks -name '*.js' -type f 2>/dev/null | head -3 | wc -l)
if [[ "$main_js" -lt 1 ]]; then
  echo "MISSING: No JS chunks found in .next/static/chunks/"
  missing=1
fi

if [[ $missing -ne 0 ]]; then
  echo "BUILD ASSET VERIFICATION FAILED"
  echo "This class of problem (missing referenced CSS/JS) was the root cause of unstyled HTML rendering."
  exit 1
fi

echo "BUILD ASSET VERIFICATION PASSED — main CSS and critical chunks present."
exit 0
