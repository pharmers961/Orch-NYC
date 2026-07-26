# Sprout Scout 🌱

A kid-friendly events calendar for **Central Contra Costa** (Walnut Creek, Concord, Pleasant Hill, Danville, Lafayette, Moraga, Orinda, San Ramon, Martinez, Clayton). Storytimes, free store craft workshops, music in the park, farmers markets, festivals, nature programs — aggregated automatically so you can just pick a day and go.

Built for families with little ones (ages 0–7). Free events are first-class citizens: most of what the feed carries costs nothing.

## How it works

```
GitHub Actions cron (2x daily)
  └─ scripts/ingest.ts
       1. recurring-sources.json  — curated fixed schedules (Lakeshore crafts,
          Home Depot / Lowe's / Michaels kids' workshops, farmers markets,
          summer concert series). Zero network needed, always present.
       2. ical-sources.json       — city calendar iCal feeds (structured)
       3. Ticketmaster Discovery  — Family events within 15 mi of Walnut Creek
       4. sources.json            — ~30 local web pages: schema.org JSON-LD
          first, Playwright render second, Gemini AI extraction last
       5. SerpApi Google Events   — optional catch-all
     → events.json published to the `data` branch
  └─ the static app (Vite + React) fetches events.json at runtime
```

Every extracted event passes a kid-appropriateness filter (no 21+/nightlife/wine-walk noise) and a civic-noise filter (no city council meetings), then gets categorized: 📚 Storytime, 🎨 Crafts, 🎶 Music, 🎭 Shows, 🦋 Nature, 🤸 Play, 🎪 Festivals.

## Run locally

**Prerequisites:** Node.js 20+

1. `npm install`
2. `npm run dev` — the app loads the shared feed from the `data` branch
3. (optional) `npm run ingest` — run the scraper yourself; set `GEMINI_API_KEY`, `TICKETMASTER_KEY`, `SERPAPI_KEY` in `.env.local` for the richer sources (see `.env.example`)

## Repository secrets (Actions)

| Secret | What it unlocks |
| --- | --- |
| `TICKETMASTER_KEY` | Family-classified ticketed shows near Walnut Creek (free key from developer.ticketmaster.com) |
| `GEMINI_API_KEY` | AI extraction for event pages without structured data |
| `SERPAPI_KEY` | Google Events results (free tier ~100 searches/month) |

All are optional — without them the feed still fills from recurring schedules, iCal feeds, and schema.org markup.

## Tuning the sources

- `recurring-sources.json` — fixed weekly/monthly schedules. Verify seasonal ranges (concert series, seasonal markets) once a year.
- `ical-sources.json` — city iCal feeds (CivicPlus pattern URLs; a wrong URL logs 0 events and never breaks the run).
- `sources.json` — pages to scrape. Add any local venue/calendar URL; JSON-LD is picked up automatically.
