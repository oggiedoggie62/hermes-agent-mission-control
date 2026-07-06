#!/usr/bin/env bash
cd /home/oggie/mission-control
export DATABASE_URL="postgresql://mint:***@localhost:5432/hermes_mc"
export INTERNAL_API_SECRET=***
exec npx next start -p 3000