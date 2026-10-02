# mostviable

**Live:** https://mostviable.100dayaichallenge.com

<!-- deploy.sh inserts a **Live:** line here automatically -->

![mostviable — find the three apps most worth selling](./public/hero.png)

> Product-concept mockup — try the live app at the link above.

Day 101 of Savion's 100 Day AI Build Challenge — one app per day for 100 days.

> Scan your GitHub repos and find out which three apps are most worth selling, with market research, pricing and a plan to sell each one.

## What it does

1. Sign in with Google, then connect GitHub and tick the repos to include.
2. Every selected repo is triaged from its README, file list and dependencies.
3. The strongest candidates get live web research: demand, competitors and what they charge.
4. The top three are picked on market demand and selling viability, each with a scorecard, a go-to-market kit and a gap-to-sellable checklist. The rest get an honest "not worth pursuing" list.
5. A rescan only redoes work for repos that are new or were pushed to since the last scan.

## Stack

Next.js (App Router) + TypeScript + Tailwind, Supabase (auth and data), GitHub OAuth, Claude Opus 5.5 with web search.

## Run

```bash
npm install
npm run dev
```

Copy `.env.local.example` to `.env.local` and fill in:

- `ANTHROPIC_API_KEY`: a Claude API key.
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`: from a GitHub OAuth App (GitHub → Settings → Developer settings → OAuth Apps). Add a redirect URI of `<your origin>/api/github/callback` for each origin you run on (for example `http://localhost:3000` and your production domain). Leave "Expire user access tokens" unticked: the app does not refresh tokens yet.
- `GITHUB_TOKEN_ENCRYPTION_KEY`: `openssl rand -base64 32`.

The database tables are in `supabase/schema.sql`.

## Links

- Live demo: _(if deployed)_
- Tracker: https://100dayaichallenge.com
