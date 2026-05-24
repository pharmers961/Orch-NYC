/**
 * Standalone scraper run by the GitHub Actions cron. No database:
 * gathers sources -> extracts events (feeds-first, Gemini fallback) ->
 * normalizes + de-dupes -> writes events.json. The workflow then publishes
 * that file to the `data` branch, and the app fetches it.
 *
 * Env: TICKETMASTER_KEY (optional), GEMINI_API_KEY (optional).
 */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fetchWithRetry, extractJsonLdEvents, geminiExtractEventsFromUrl, categorizeEvent } from "../serverLib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "events.json");

function readSources(): string[] {
  try {
    const raw = readFileSync(path.join(ROOT, "sources.json"), "utf8");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed.sources;
    return Array.isArray(list) ? [...new Set(list.filter((s) => typeof s === "string"))] : [];
  } catch {
    return [];
  }
}

interface SocrataCfg {
  id: string;            // Socrata dataset id, e.g. "fudw-fgrp"
  source?: string;       // label shown in the Sources filter
  dateField?: string;
  titleField?: string;
  venueField?: string;
  descField?: string;
  urlField?: string;
  category?: string;
  price?: string;
  limit?: number;
}

function readSocrataSources(): SocrataCfg[] {
  try {
    const raw = readFileSync(path.join(ROOT, "socrata-sources.json"), "utf8");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed.datasets;
    return Array.isArray(list) ? list.filter((d: any) => d && typeof d.id === "string") : [];
  } catch {
    return [];
  }
}

// The previous feed (downloaded by the workflow into prev-events.json) so the
// feed accumulates across runs instead of being rebuilt from scratch.
function readPrevEvents(): any[] {
  try {
    const raw = readFileSync(path.join(ROOT, "prev-events.json"), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

function hostOf(url: string): string {
  try {
    let s = url.trim();
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    return new URL(s).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function cleanDate(raw: string): string {
  if (!raw) return new Date().toISOString().split("T")[0];
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  const m = raw.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return new Date().toISOString().split("T")[0];
}

// If an extracted date is in the past, assume a wrong year and roll it forward
// to the next occurrence of that month/day (this year, else next year).
function rollForwardIfPast(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const orig = new Date(`${dateStr}T12:00:00Z`);
  if (isNaN(orig.getTime()) || orig.getTime() >= today.getTime()) return dateStr;
  const [, , mm, dd] = m;
  let cand = new Date(`${today.getUTCFullYear()}-${mm}-${dd}T12:00:00Z`);
  if (cand.getTime() < today.getTime()) {
    cand = new Date(`${today.getUTCFullYear() + 1}-${mm}-${dd}T12:00:00Z`);
  }
  return isNaN(cand.getTime()) ? dateStr : cand.toISOString().split("T")[0];
}

function dedupeKey(title: string, dateStr: string): string {
  const normTitle = (title || "")
    .toLowerCase()
    .replace(/\b(the|a|an|presents|tour|live|vs|at|nyc|show|concert)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
  const key = `${normTitle}_${dateStr}`.replace(/[^a-z0-9_-]/g, "");
  return key || `evt_${Math.random().toString(36).slice(2, 10)}`;
}

const VALID_CATS = ["concerts", "broadway", "classical", "sports", "other"];

function normalizeEvent(raw: any, sourceUrl: string, provider: string, sourceHost?: string) {
  const cat = VALID_CATS.includes((raw.category || "").toLowerCase()) ? raw.category.toLowerCase() : "other";
  const dateStr = rollForwardIfPast(cleanDate(raw.date));
  const start = `${dateStr}T${raw.time || "19:00"}:00Z`;
  const startTs = new Date(start).getTime();
  const title = (raw.title || "Untitled Event").toString().trim();
  return {
    id: dedupeKey(title, dateStr),
    title,
    artist: raw.artist || "",
    venue: raw.venue || "NYC Venue",
    area: raw.area || "New York",
    cat,
    price: raw.price || "Check Site",
    start,
    startTs: isNaN(startTs) ? Date.now() : startTs,
    desc: raw.description || raw.desc || "",
    ticketUrl: raw.ticketUrl || sourceUrl,
    image: raw.image || "",
    status: raw.status || "onsale",
    source: sourceHost || hostOf(sourceUrl),
    sourceUrl,
    provider,
  };
}

function mapTmEvent(e: any) {
  const c = e.classifications?.[0];
  let category = "concerts";
  if (c?.segment?.name === "Sports") category = "sports";
  else if (c?.segment?.name === "Music") category = "concerts";
  else if (["Classical", "Opera", "Orchestral"].includes(c?.genre?.name)) category = "classical";
  else category = "broadway";
  const venue = e._embedded?.venues?.[0]?.name || "NYC Venue";
  let price = "Price TBA";
  if (e.priceRanges?.[0]) {
    const min = Math.round(e.priceRanges[0].min || 0);
    const max = Math.round(e.priceRanges[0].max || 0);
    price = min === max ? `$${min}` : `$${min}-$${max}`;
  }
  const imgs = e.images ? [...e.images].sort((a: any, b: any) => b.width - a.width) : [];
  const image = imgs.find((i: any) => i.ratio === "16_9")?.url || imgs[0]?.url || "";
  const start = e.dates?.start?.dateTime || `${e.dates?.start?.localDate}T19:00:00Z`;
  return {
    title: e.name,
    artist: e._embedded?.attractions?.[0]?.name || "",
    venue,
    area: e._embedded?.venues?.[0]?.city?.name || "New York",
    category,
    date: start.split("T")[0],
    time: (start.split("T")[1] || "19:00").slice(0, 5),
    price,
    ticketUrl: e.url,
    image,
    status: e.dates?.status?.code || "onsale",
    description: e.info || e.description || "",
  };
}

// Page through the Ticketmaster Discovery API for NYC (dmaId 345) to pull far
// more than one page of events. Deep paging is capped at 1000 results.
async function fetchTicketmaster(key: string): Promise<any[]> {
  const now = new Date().toISOString().split(".")[0] + "Z";
  const size = 100;
  const maxPages = 5;
  const raw: any[] = [];
  for (let page = 0; page < maxPages; page++) {
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${key}&dmaId=345&sort=date,asc&size=${size}&page=${page}&startDateTime=${now}&locale=*`;
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      if (page === 0) throw new Error(`Ticketmaster ${res.status}`);
      break;
    }
    const data: any = await res.json();
    const events = data?._embedded?.events || [];
    raw.push(...events);
    const totalPages = data?.page?.totalPages ?? 1;
    if (events.length < size || page + 1 >= totalPages) break;
  }
  return raw.map(mapTmEvent);
}

async function extractFromUrl(url: string, geminiKey?: string): Promise<any[]> {
  let html = "";
  try {
    const res = await fetchWithRetry(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36" },
    });
    if (res.ok) html = await res.text();
  } catch {
    // blocked / network error -> fall through to AI
  }

  if (html) {
    const ld = extractJsonLdEvents(html, url);
    if (ld.length > 0) return ld;
  }

  if (!geminiKey && !process.env.GEMINI_API_KEY) return [];
  const text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 30000);
  try {
    return await geminiExtractEventsFromUrl(geminiKey, url, text || null);
  } catch {
    return [];
  }
}

// Pull events from a NYC Open Data (Socrata) dataset via the SODA API.
// Structured JSON — no scraping or AI, so it's reliable. Field names vary by
// dataset, so we use the configured field then fall back to common names.
function pickField(row: any, configured: string | undefined, candidates: string[]): any {
  if (configured && row[configured] != null) return row[configured];
  for (const k of candidates) if (row[k] != null) return row[k];
  return undefined;
}

async function fetchSocrata(cfg: SocrataCfg, appToken?: string): Promise<any[]> {
  const url = `https://data.cityofnewyork.us/resource/${cfg.id}.json?$limit=${cfg.limit || 500}`;
  const headers: any = { Accept: "application/json" };
  if (appToken) headers["X-App-Token"] = appToken;
  const res = await fetchWithRetry(url, { headers });
  if (!res.ok) throw new Error(`Socrata ${cfg.id} HTTP ${res.status}`);
  const rows: any = await res.json();
  if (!Array.isArray(rows)) return [];
  const out: any[] = [];
  for (const row of rows) {
    let rawDate = pickField(row, cfg.dateField, ["start_date_time", "start_date", "startdate", "date", "datetime", "start", "event_date", "date_time", "performance_date"]);
    if (rawDate && typeof rawDate === "object") rawDate = rawDate.$date || rawDate.date || "";
    const title = pickField(row, cfg.titleField, ["title", "name", "event_name", "eventname", "program", "headline", "show"]);
    if (!rawDate || !title) continue;
    const dt = new Date(rawDate);
    if (isNaN(dt.getTime())) continue;
    const iso = dt.toISOString();
    const venue = pickField(row, cfg.venueField, ["venue", "location", "park_name", "place", "address", "borough", "site"]);
    const desc = pickField(row, cfg.descField, ["snippet", "description", "summary", "details", "event_description"]);
    const link = pickField(row, cfg.urlField, ["event_url", "url", "link", "website", "permalink", "tickets"]);
    out.push({
      title: String(title).trim(),
      artist: "",
      venue: venue ? String(venue) : "New York",
      category: cfg.category || "other",
      date: iso.split("T")[0],
      time: iso.split("T")[1].slice(0, 5),
      price: cfg.price || "Check Site",
      ticketUrl: typeof link === "string" && link ? link : `https://data.cityofnewyork.us/d/${cfg.id}`,
      description: typeof desc === "string" ? desc.replace(/<[^>]+>/g, "").trim().slice(0, 400) : "",
    });
  }
  return out;
}

// SerpApi Google Events engine — structured NYC event results.
// Note: SerpApi's free tier is ~100 searches/month, so 1 call per hourly run
// (~720/month) will exceed it. Use a daily schedule or a paid plan if free.
async function fetchSerpApi(key: string): Promise<any[]> {
  const year = new Date().getFullYear();
  const url = `https://serpapi.com/search.json?engine=google_events&q=${encodeURIComponent("events in New York")}&hl=en&gl=us&api_key=${key}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`SerpApi HTTP ${res.status}`);
  const data: any = await res.json();
  const results = Array.isArray(data.events_results) ? data.events_results : [];
  const out: any[] = [];
  for (const e of results) {
    const venue = e.venue?.name || (Array.isArray(e.address) ? e.address[0] : e.address) || "New York";
    let ticketUrl = e.link || "";
    if (Array.isArray(e.ticket_info) && e.ticket_info.length) {
      ticketUrl = e.ticket_info[0].link || e.ticket_info[0].source_link || e.link || "";
    }
    const whenStr = e.date?.when || e.date?.start_date || "";
    let dateVal = "";
    let timeVal = "19:00";
    if (whenStr) {
      const cleaned = String(whenStr).replace(/^[A-Za-z]{3},\s*/, "").split(/[–-]/)[0].trim();
      const dt = new Date(`${cleaned} ${year}`);
      if (!isNaN(dt.getTime())) dateVal = dt.toISOString().split("T")[0];
      const tm = String(whenStr).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (tm) {
        let h = parseInt(tm[1], 10);
        if (/pm/i.test(tm[3]) && h !== 12) h += 12;
        if (/am/i.test(tm[3]) && h === 12) h = 0;
        timeVal = `${String(h).padStart(2, "0")}:${tm[2]}`;
      }
    }
    if (!dateVal || !e.title) continue;
    out.push({
      title: e.title,
      artist: "",
      venue,
      category: categorizeEvent(e.title || "", e.description || ""),
      date: dateVal,
      time: timeVal,
      price: e.ticket_info?.[0]?.price || "Check Site",
      ticketUrl: ticketUrl || `https://www.google.com/search?q=${encodeURIComponent(e.title)}`,
      description: e.description || "",
    });
  }
  return out;
}

async function main() {
  const tmKey = process.env.TICKETMASTER_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const perSource: Record<string, number> = {};
  const all: any[] = [];

  if (tmKey) {
    try {
      const tm = await fetchTicketmaster(tmKey);
      tm.forEach((e) => all.push(normalizeEvent(e, e.ticketUrl || "https://www.ticketmaster.com", "Ticketmaster", "ticketmaster.com")));
      perSource["ticketmaster.com"] = tm.length;
      console.log(`Ticketmaster: ${tm.length} events`);
    } catch (err) {
      console.warn("Ticketmaster failed:", (err as any)?.message);
    }
  } else {
    console.log("No TICKETMASTER_KEY set — skipping Ticketmaster.");
  }

  for (const src of readSources()) {
    try {
      const events = await extractFromUrl(src, geminiKey);
      events.forEach((e) => all.push(normalizeEvent(e, src, "Gemini")));
      perSource[hostOf(src)] = events.length;
      console.log(`${hostOf(src)}: ${events.length} events`);
    } catch (err) {
      console.warn(`Failed ${src}:`, (err as any)?.message);
      perSource[hostOf(src)] = 0;
    }
  }

  // SerpApi Google Events — structured NYC results (optional).
  const serpKey = process.env.SERPAPI_KEY;
  if (serpKey) {
    try {
      const rows = await fetchSerpApi(serpKey);
      rows.forEach((e) => all.push(normalizeEvent(e, e.ticketUrl, "SerpApi", "google events (serpapi)")));
      perSource["google events (serpapi)"] = rows.length;
      console.log(`SerpApi: ${rows.length} events`);
    } catch (err) {
      console.warn("SerpApi failed:", (err as any)?.message);
    }
  }

  // NYC Open Data (Socrata) datasets — reliable structured JSON.
  const socToken = process.env.SOCRATA_APP_TOKEN;
  for (const cfg of readSocrataSources()) {
    const label = cfg.source || "data.cityofnewyork.us";
    try {
      const rows = await fetchSocrata(cfg, socToken);
      rows.forEach((e) => all.push(normalizeEvent(e, e.ticketUrl, "NYC Open Data", label)));
      perSource[label] = (perSource[label] || 0) + rows.length;
      console.log(`${label} (${cfg.id}): ${rows.length} events`);
    } catch (err) {
      console.warn(`Socrata ${cfg.id} failed:`, (err as any)?.message);
      perSource[label] = perSource[label] || 0;
    }
  }

  // Accumulate: merge with the previous feed so events captured in earlier runs
  // persist even when a flaky AI extraction returns nothing this run. Fresh
  // scrape results win on id collisions (so details/dates stay current).
  const prev = readPrevEvents();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const byId = new Map<string, any>();
  [...prev, ...all]
    .filter((e) => typeof e?.startTs === "number" && e.startTs >= cutoff)
    .forEach((e) => byId.set(e.id, e));
  const events = [...byId.values()].sort((a, b) => a.startTs - b.startTs);

  const payload = {
    generatedAt: new Date().toISOString(),
    count: events.length,
    perSourceThisRun: perSource,
    events,
  };
  writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${events.length} events to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error("Ingest crashed:", err);
  process.exit(1);
});
