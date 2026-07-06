# BOOTSTRAP.md

**Audience:** an Hermes (or Claude Code) agent the user has pointed at
this repo to set it up for them. If you're a human reading this, see
`README.md` instead.

## What you're setting up

A mission-control dashboard the user will use to see every agent they
run - tasks completed, current status, cost to date. It's a Next.js 16
app with Prisma + Postgres.

## Your onboarding flow

Walk the user through these steps **one question at a time**. Don't dump
everything at once. Wait for each answer, write to the right file, and
confirm before moving to the next step.

### Step 1 - Interview

Ask the user in this order:

1. **Which agents do you plan to connect to this dashboard?** Get a list.
   Examples to prompt them with: content writer, trading bot, research
   analyst, inbox triage, deal scout, growth scout.
2. **Where is your Postgres database?** Options:
   - "I have a Neon / Vercel Postgres / Supabase URL" -> ask them to paste
     the `DATABASE_URL`.
   - "I want local Postgres" -> tell them to run `brew install postgresql`
     (mac) or use `docker run postgres`, then set
     `DATABASE_URL="postgresql://postgres@localhost:5432/openclaw"`.
3. **Any API keys the dashboard itself needs?** By default it needs none.
   If the user wants the dashboard to call LLMs (for example, to summarize
   agent activity), collect an `OPENROUTER_API_KEY`. Otherwise leave it
   blank. Authentication for the dashboard is out of scope for v0.1; see
   "What to extend next" below to add it later.

### Step 2 - Write the env file

Copy `.env.example` to `.env`, fill in collected values. Generate
`INTERNAL_API_SECRET` with `openssl rand -hex 32`. This is the shared
secret the user's agents will use to authenticate when posting state
updates. Store it safely; the user will need to inject it into each
agent's environment.

### Step 3 - Install + push schema

```bash
npm install
npx prisma db push
```

If `prisma db push` fails with auth errors, the `DATABASE_URL` is wrong
or the DB isn't reachable. Ask the user to verify.

### Step 4 - Seed demo data

```bash
npm run seed:demo
```

This inserts 4 fake agents, 3 missions, and 3 ideas so the dashboard
renders with something the first time they open it.

### Step 5 - Start dev + verify health

```bash
npm run dev
```

Then hit `http://localhost:3000/api/health`. Should return
`{"ok": true, "db": "connected"}`. If not, debug and fix before
continuing.

Open `http://localhost:3000` in the browser. User should see a dashboard
with 4 demo agents.

### Step 6 - Wire a real agent

Pick ONE of the user's actual agents (whichever is fastest to integrate).
Write a minimal heartbeat function for it that POSTs to
`/api/agents/state` every 30 seconds. See `README.md` for payload shape.

After they confirm the agent appears live on the dashboard, the bootstrap
is done.

## What to extend next (optional)

Suggest these to the user, in order of impact. Build whichever they ask for:

1. **Authentication** - wire up NextAuth (install `next-auth` + the
   matching Prisma adapter, add Account/Session/User models to the
   schema, configure Google or another provider). This repo ships
   without auth for simplicity; most people will want it the moment
   they deploy.
2. **Agent detail pages** - drill into one agent's recent activity log.
3. **Live mission queue** - UI for the user to assign a new mission to
   any agent.
4. **Cost dashboard** - break down spend by agent, by day, by model.
5. **Custom integrations** - whatever they actually run. Don't assume;
   ask first.

## Rules for you, the agent

- Never put real API keys in committed files. The user will provide them,
  they go in `.env` which is gitignored.
- Before building any new feature the user asks for, ask if they want it
  a) purely on the dashboard, b) with a backing Prisma model, c) with an
  external API. Those are three very different scope levels.
- If the user says "make it look like Max HQ", reference the styling in
  `src/app/globals.css` and the sidebar in `src/components/sidebar.tsx`.
- No em dashes in generated content (this is a sharbelxyz convention
  baked into every repo he ships).

## When bootstrap is complete

Tell the user:

> All set. Your Mission Control is live at localhost:3000. Your first
> agent is reporting in. Open `BOOTSTRAP.md` when you want to add the
> next agent, or ask me to build a new view when you know what you need.
