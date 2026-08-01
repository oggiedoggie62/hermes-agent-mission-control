#!/usr/bin/env bash
cd /home/oggie/mission-control
export DATABASE_URL="postgresql://mint:***@localhost:5432/hermes_mc"
export INTERNAL_API_SECRET=***
# Deprecated legacy. Use ./scripts/deploy.sh instead
# exec npx next start -p 3000