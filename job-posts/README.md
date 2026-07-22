# Job Posts — personal job-search agent

Polls job postings across major companies' own ATS boards (Greenhouse, Lever,
Workday), remote/international aggregators (Remotive, RemoteOK, Arbeitnow,
Adzuna), scores each posting against your profile with OpenAI, and shows
matches in a dashboard. Optionally sends a daily email digest.

## How it finds jobs

There's no single API that covers every company's career page, so this
combines three approaches:

1. **Direct ATS polling** — most large employers post jobs through Greenhouse,
   Lever, or Workday, all of which expose a public JSON endpoint per company.
   Manage the list of companies to poll on the **Profile** page.
2. **Aggregators** — Remotive, RemoteOK, and Arbeitnow need no API key and
   cover a lot of remote/international listings. Adzuna (optional, free key)
   adds per-country coverage (US, UK, Germany, Canada, India, and more).
3. Everything is scored against your profile (title/skills/location/salary/
   visa needs) with `gpt-4o-mini` and shown ranked in the dashboard.

LinkedIn and Indeed are intentionally not scraped — both actively block and
prohibit it in their terms of service.

## Deploying

1. **Create a Vercel project** pointed at this repo with **Root Directory**
   set to `job-posts/` (Project Settings → General → Root Directory). This
   keeps it a separate deployment from the rest of the repo.
2. **Set environment variables** in Vercel (Project Settings → Environment
   Variables) — see `.env.example` for the full list:
   - `DATABASE_URL` — your Neon Postgres connection string
   - `OPENAI_API_KEY` — for match scoring
   - `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` — optional, broadens coverage
   - `RESEND_API_KEY`, `DIGEST_TO_EMAIL`, `DIGEST_FROM_EMAIL` — optional,
     enables the daily email digest
   - `CRON_SECRET` — any random string; stops the `/api/collect` and
     `/api/digest` endpoints from being triggered by anyone who finds the URL
3. Deploy. The Vercel Cron jobs defined in `vercel.json` run collection daily
   at 12:00 UTC and the digest at 13:00 UTC (Hobby plan allows daily crons).
4. Open the deployed URL → **Profile** tab, fill in your target roles,
   skills, locations, visa situation, and paste your resume. Add companies to
   poll (or keep the starter list: Stripe, Airbnb, Pinterest, Robinhood,
   Coinbase, Reddit, Lyft, Plaid, Target).
5. Click **Run collection now** on the dashboard to do a first pull instead
   of waiting for the next cron tick.

## Known limitations (v1)

- **No login.** Anyone with the deployed URL can view/edit the profile and
  trigger `/api/collect` (which costs OpenAI tokens) unless `CRON_SECRET` is
  set — and even then, the dashboard's own "Run collection now" button will
  stop working once you set it, since that request doesn't carry the secret.
  For a single-user personal tool this is an acceptable v1 trade-off, but if
  the URL leaks, consider Vercel's Deployment Protection / password
  protection, or ask for real auth to be added.
- Retailers on Workday need their tenant/dc/site discovered by hand (see the
  Profile page for how) — there's no directory of these to hardcode reliably.
- Adzuna requires a free API key and only covers a fixed set of countries.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL at minimum
npm run dev
```
