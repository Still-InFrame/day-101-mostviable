# mostviable

**Live:** https://mostviable.100dayaichallenge.com

![mostviable — find out which of your apps is worth selling](./public/hero.png)

> Product-concept mockup, not a literal screenshot. Try the live app at the link above.

Day 101 of Savion's 100 Day AI Build Challenge — one app per day for 100 days.

If you build far more apps than you sell, mostviable tells you which ones are worth turning into a product. It reads the GitHub repos you choose, researches the real market for the strongest candidates, and names the three most viable, each with a price and a plan to sell it.

## What it does

1. **Connect and choose.** Sign in with Google, connect GitHub, and tick the repos to include. Only ticked repos are read.
2. **Triage.** Every selected repo is scored from its README, file list and dependencies.
3. **Market research.** The top eight candidates get live web research: evidence of demand, real competitors and what they charge. Every claim links to its source, and a source that did not appear in the search results is flagged as unverified.
4. **The top three.** The shortlist is compared side by side and three winners are picked on market demand and how sellable they are, with code readiness as the tiebreaker.

## What you get for each winner

- **Scorecard:** five weighted dimensions (market demand, ease of selling, willingness to pay, open competition, readiness) with the reasoning behind each score.
- **Market view:** competitors with their published pricing, demand evidence, and a recommended price.
- **Go-to-market kit:** positioning, a first customer profile, pricing tiers, where to find buyers, a ten-step plan to the first ten customers, and a launch message you can copy.
- **Gap-to-sellable checklist:** what the repo still needs before someone could pay for it, with progress you can tick off.

You also get the runners-up with the reason each missed the top three, and an honest list of repos not worth pursuing as products.

A rescan only redoes work for repos that are new or were pushed to since the last scan.

## Install

```bash
git clone https://github.com/Still-InFrame/day-101-mostviable.git
cd day-101-mostviable
npm install
npm run dev
```

Copy `.env.local.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: a Supabase project with Google sign-in enabled. Create the tables with `supabase/schema.sql`.
- `ANTHROPIC_API_KEY`: a Claude API key.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: from a GitHub OAuth App (GitHub → Settings → Developer settings → OAuth Apps). Add a redirect URI of `<your origin>/api/github/callback` for each origin you run on. Leave "Expire user access tokens" unticked: the app does not refresh tokens yet.
- `GITHUB_TOKEN_ENCRYPTION_KEY`: `openssl rand -base64 32`.

Scans call the Claude API on your key, so each one costs money.

## Stack

- Next.js 16 (App Router), TypeScript, Tailwind CSS
- Supabase for Google sign-in and data, with row-level security per user
- GitHub OAuth for repo access; tokens are stored encrypted
- Claude Opus 5.5 with web search for triage, research and ranking
- Deployed on Vercel

## Links

- Live app: https://mostviable.100dayaichallenge.com
- Challenge tracker: https://www.100dayaichallenge.com/share/savion
