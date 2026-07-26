/**
 * Standalone scraper run by the GitHub Actions cron. No database:
 * gathers sources -> extracts events (feeds-first, Gemini fallback) ->
 * normalizes + de-dupes -> writes events.json. The workflow then publishes
 * that file to the `data` branch, and the app fetches it.
 *
 * Sources, in order of reliability:
 *   1. recurring-sources.json — curated fixed schedules (store kids' workshops,
 *      farmers markets, summer concert series). Always present, no network.
 *   2. ical-sources.json — city/venue iCal feeds (structured, no AI).
 *   3. Ticketmaster Discovery API (Family classification near Walnut Creek).
 *   4. sources.json — web pages: JSON-LD first, Playwright render, Gemini last.
 *   5. SerpApi Google Events (optional).
 *
 * Env: TICKETMASTER_KEY (optional), GEMINI_API_KEY (optional), SERPAPI_KEY (optional).
 */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fetchWithRetry, extractJsonLdEvents, geminiExtractEventsFromUrl, categorizeEvent, isKidAppropriate, PRICE_FALLBACK } from "../serverLib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "events.json");

function readJsonConfig(file: string, key: string): any[] {
  try {
    const raw = readFileSync(path.join(ROOT, file), "utf8");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed[key];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function readSources(): string[] {
  return [...new Set(readJsonConfig("sources.json", "sources").filter((s) => typeof s === "string"))];
}

interface IcalCfg {
  url: string;           // .ics feed URL
  source?: string;       // label shown in the Sources filter
  venue?: string;        // fallback venue when the feed has no LOCATION
  area?: string;         // city, e.g. "Danville"
  category?: string;     // fallback category
  price?: string;
}

interface RecurringCfg {
  title: string;
  venue: string;
  area: string;
  category?: string;
  price?: string;
  url: string;
  source?: string;
  desc?: string;
  schedule: {
    freq: "weekly" | "monthly";
    day: number;         // 0=Sunday .. 6=Saturday
    time: string;        // "HH:MM" Pacific wall time
    ordinals?: number[]; // for monthly: which <day> of the month (1=first, 3=third)
    months?: number[];   // restrict to these months (1-12), e.g. summer series
  };
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
    .replace(/\b(the|a|an|and|presents|free|family|kids|at|with|event)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
  const key = `${normTitle}_${dateStr}`.replace(/[^a-z0-9_-]/g, "");
  return key || `evt_${Math.random().toString(36).slice(2, 10)}`;
}

const VALID_CATS = ["storytime", "crafts", "music", "shows", "nature", "play", "festivals", "other"];

function normalizeEvent(raw: any, sourceUrl: string, provider: string, sourceHost?: string) {
  const cat = VALID_CATS.includes((raw.category || "").toLowerCase()) ? raw.category.toLowerCase() : "other";
  const dateStr = rollForwardIfPast(cleanDate(raw.date));
  const start = `${dateStr}T${raw.time || "10:00"}:00Z`;
  const startTs = new Date(start).getTime();
  const title = (raw.title || "Untitled Event").toString().trim();
  return {
    id: dedupeKey(title, dateStr),
    title,
    artist: raw.artist || "",
    venue: raw.venue || "East Bay Venue",
    area: raw.area || "Contra Costa",
    cat,
    price: raw.price || PRICE_FALLBACK,
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

// ---- Pacific-time helpers ------------------------------------------------
// Convert an America/Los_Angeles wall time to the corresponding UTC instant
// (handles DST via Intl, two-pass fixed-point).
function laWallToUtc(y: number, mo: number, d: number, hh: number, mm: number): Date {
  const target = Date.UTC(y, mo - 1, d, hh, mm);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    const parts: Record<string, string> = {};
    dtf.formatToParts(new Date(guess)).forEach((p) => (parts[p.type] = p.value));
    const seen = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    const diff = target - seen;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

// ---- Recurring curated schedules ----------------------------------------
// Expands fixed weekly/monthly schedules (store kids' workshops, farmers
// markets, concert series) into concrete events for the next ~7 weeks.
function expandRecurring(cfg: RecurringCfg, horizonDays = 49): any[] {
  const out: any[] = [];
  const s = cfg.schedule;
  if (!s || typeof s.day !== "number" || !s.time) return out;
  const [hh, mm] = s.time.split(":").map((n) => parseInt(n, 10));
  // Step at UTC noon: LA is 7-8h behind UTC, so the UTC calendar date at noon
  // matches the LA calendar date — weekday math stays correct.
  const start = new Date();
  start.setUTCHours(12, 0, 0, 0);
  for (let i = 0; i <= horizonDays; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    if (d.getUTCDay() !== s.day) continue;
    const month = d.getUTCMonth() + 1;
    if (s.months && !s.months.includes(month)) continue;
    if (s.freq === "monthly") {
      const ordinal = Math.floor((d.getUTCDate() - 1) / 7) + 1;
      if (!(s.ordinals || [1]).includes(ordinal)) continue;
    }
    const iso = laWallToUtc(d.getUTCFullYear(), month, d.getUTCDate(), hh, mm).toISOString();
    out.push({
      title: cfg.title,
      artist: "",
      venue: cfg.venue,
      area: cfg.area,
      category: cfg.category || categorizeEvent(cfg.title, cfg.desc || "", cfg.venue),
      date: iso.split("T")[0],
      time: iso.slice(11, 16),
      price: cfg.price || "Free",
      ticketUrl: cfg.url,
      description: cfg.desc || "",
    });
  }
  return out;
}

// ---- iCal feeds ----------------------------------------------------------
// Minimal ICS parser: unfold lines, walk VEVENT blocks, read the fields we
// use. City calendars mix in meetings/senior programming, so events run
// through a civic-noise blocklist plus the shared kid-appropriateness check.
const CIVIC_NOISE = /(city council|town council|planning commission|committee|commission meeting|board meeting|closed session|study session|task force|public hearing|budget|senior (center|bingo|lunch|social|trip)|blood drive|job fair|adults? \(?(18|21)|ballot|election)/i;

function parseIcsDateValue(value: string): { date: string; time: string } | null {
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: "10:00" }; // all-day
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value);
  if (!m) return null;
  const iso = m[7]
    ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || "0"))).toISOString()
    : laWallToUtc(+m[1], +m[2], +m[3], +m[4], +m[5]).toISOString(); // floating/TZID -> Pacific
  return { date: iso.split("T")[0], time: iso.slice(11, 16) };
}

export function parseIcs(text: string): { summary: string; dtstart: string; description: string; location: string; url: string }[] {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const events: any[] = [];
  let cur: any = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = { summary: "", dtstart: "", description: "", location: "", url: "" }; continue; }
    if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const [nameAndParams, value] = [line.slice(0, idx), line.slice(idx + 1)];
    const name = nameAndParams.split(";")[0].toUpperCase();
    const unescape = (v: string) => v.replace(/\\n/g, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").trim();
    if (name === "SUMMARY") cur.summary = unescape(value);
    else if (name === "DTSTART") cur.dtstart = value.trim();
    else if (name === "DESCRIPTION") cur.description = unescape(value).replace(/<[^>]+>/g, "").slice(0, 400);
    else if (name === "LOCATION") cur.location = unescape(value);
    else if (name === "URL") cur.url = value.trim();
  }
  return events;
}

async function fetchIcal(cfg: IcalCfg): Promise<any[]> {
  const res = await fetchWithRetry(cfg.url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36" },
  });
  if (!res.ok) throw new Error(`iCal HTTP ${res.status}`);
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("not an ICS feed");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const maxTs = today.getTime() + 120 * 86400000;
  const out: any[] = [];
  for (const ev of parseIcs(text)) {
    if (!ev.summary || !ev.dtstart) continue;
    const dt = parseIcsDateValue(ev.dtstart);
    if (!dt) continue;
    const ts = new Date(`${dt.date}T${dt.time}:00Z`).getTime();
    if (isNaN(ts) || ts < today.getTime() || ts > maxTs) continue;
    if (CIVIC_NOISE.test(`${ev.summary} ${ev.description}`)) continue;
    if (!isKidAppropriate(ev.summary, ev.description)) continue;
    const venue = ev.location || cfg.venue || "East Bay Venue";
    const guessedCat = categorizeEvent(ev.summary, ev.description, venue);
    out.push({
      title: ev.summary,
      artist: "",
      venue,
      area: cfg.area || "",
      category: guessedCat !== "other" ? guessedCat : cfg.category || "other",
      date: dt.date,
      time: dt.time,
      price: cfg.price || PRICE_FALLBACK,
      ticketUrl: ev.url || cfg.url,
      description: ev.description,
    });
  }
  return out;
}

// ---- Ticketmaster --------------------------------------------------------
function mapTmEvent(e: any) {
  const seg = e.classifications?.[0]?.segment?.name || "";
  const venue = e._embedded?.venues?.[0]?.name || "East Bay Venue";
  let category = categorizeEvent(e.name, e.info || e.description || "", venue);
  if (category === "other") {
    if (seg === "Music") category = "music";
    else if (seg === "Sports") category = "play";
    else category = "shows"; // Family / Arts & Theatre / Film
  }
  let price = PRICE_FALLBACK;
  if (e.priceRanges?.[0]) {
    const min = Math.round(e.priceRanges[0].min || 0);
    const max = Math.round(e.priceRanges[0].max || 0);
    price = min === max ? `$${min}` : `$${min}-$${max}`;
  }
  const imgs = e.images ? [...e.images].sort((a: any, b: any) => b.width - a.width) : [];
  const image = imgs.find((i: any) => i.ratio === "16_9")?.url || imgs[0]?.url || "";
  const start = e.dates?.start?.dateTime || `${e.dates?.start?.localDate}T17:00:00Z`;
  return {
    title: e.name,
    artist: e._embedded?.attractions?.[0]?.name || "",
    venue,
    area: e._embedded?.venues?.[0]?.city?.name || "Contra Costa",
    category,
    date: start.split("T")[0],
    time: (start.split("T")[1] || "17:00").slice(0, 5),
    price,
    ticketUrl: e.url,
    image,
    status: e.dates?.status?.code || "onsale",
    description: e.info || e.description || "",
  };
}

// Page through the Ticketmaster Discovery API for Family-classified events
// within 15 miles of Walnut Creek (geohash 9q9pw). Deep paging capped at 1000.
async function fetchTicketmaster(key: string): Promise<any[]> {
  const now = new Date().toISOString().split(".")[0] + "Z";
  const size = 100;
  const maxPages = 5;
  const raw: any[] = [];
  for (let page = 0; page < maxPages; page++) {
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${key}&geoPoint=9q9pw&radius=15&unit=miles&classificationName=Family&sort=date,asc&size=${size}&page=${page}&startDateTime=${now}&locale=*`;
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

// --- Playwright headless rendering (fallback for JS-rendered venue pages) ---
// Lazy, shared browser. If Playwright/Chromium isn't available, it degrades to
// null and the pipeline falls back to Gemini exactly as before.
let browserPromise: Promise<any | null> | null = null;
async function getBrowser(): Promise<any | null> {
  if (process.env.DISABLE_PLAYWRIGHT === "1") return null;
  if (!browserPromise) {
    browserPromise = (async () => {
      try {
        const { chromium } = await import("playwright");
        return await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
      } catch (err) {
        console.warn("Playwright unavailable, skipping render fallback:", (err as any)?.message);
        return null;
      }
    })();
  }
  return browserPromise;
}
async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise;
  if (b) await b.close().catch(() => {});
  browserPromise = null;
}
async function renderHtml(url: string): Promise<string | null> {
  const browser = await getBrowser();
  if (!browser) return null;
  let page: any;
  try {
    page = await browser.newPage({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(2500); // let client-side JS populate the calendar
    return await page.content();
  } catch (err) {
    console.warn(`Playwright render failed for ${url}:`, (err as any)?.message);
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

async function extractFromUrl(url: string, geminiKey?: string): Promise<any[]> {
  let html = "";
  try {
    const res = await fetchWithRetry(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36" },
    });
    if (res.ok) html = await res.text();
  } catch {
    // blocked / network error -> fall through to render/AI
  }

  if (html) {
    const ld = extractJsonLdEvents(html, url);
    if (ld.length > 0) return ld;
  }

  // Plain fetch had no structured events — render the page (executes JS) and
  // re-check for schema.org, which JS-heavy venue sites inject after load.
  const rendered = await renderHtml(url);
  if (rendered) {
    const ld = extractJsonLdEvents(rendered, url);
    if (ld.length > 0) return ld;
    html = rendered; // richer text for the AI fallback than the empty shell
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

// SerpApi Google Events engine — structured local family-event results.
// Note: SerpApi's free tier is ~100 searches/month; the workflow runs twice a
// day (~60 calls/month for one query), which fits.
async function fetchSerpApi(key: string): Promise<any[]> {
  const year = new Date().getFullYear();
  const url = `https://serpapi.com/search.json?engine=google_events&q=${encodeURIComponent("kids and family events near Walnut Creek CA")}&hl=en&gl=us&api_key=${key}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`SerpApi HTTP ${res.status}`);
  const data: any = await res.json();
  const results = Array.isArray(data.events_results) ? data.events_results : [];
  const out: any[] = [];
  for (const e of results) {
    const venue = e.venue?.name || (Array.isArray(e.address) ? e.address[0] : e.address) || "Contra Costa";
    let ticketUrl = e.link || "";
    if (Array.isArray(e.ticket_info) && e.ticket_info.length) {
      ticketUrl = e.ticket_info[0].link || e.ticket_info[0].source_link || e.link || "";
    }
    const whenStr = e.date?.when || e.date?.start_date || "";
    let dateVal = "";
    let timeVal = "10:00";
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
    if (!isKidAppropriate(e.title, e.description || "")) continue;
    out.push({
      title: e.title,
      artist: "",
      venue,
      category: categorizeEvent(e.title || "", e.description || "", typeof venue === "string" ? venue : ""),
      date: dateVal,
      time: timeVal,
      price: e.ticket_info?.[0]?.price || PRICE_FALLBACK,
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

  // 1. Curated recurring schedules — always available, no network needed.
  for (const cfg of readJsonConfig("recurring-sources.json", "events") as RecurringCfg[]) {
    const label = cfg.source || hostOf(cfg.url);
    const rows = expandRecurring(cfg);
    rows.forEach((e) => all.push(normalizeEvent(e, cfg.url, "Recurring", label)));
    perSource[label] = (perSource[label] || 0) + rows.length;
  }
  console.log(`Recurring schedules: ${all.length} events`);

  // 2. iCal feeds — structured, no AI.
  for (const cfg of readJsonConfig("ical-sources.json", "feeds") as IcalCfg[]) {
    const label = cfg.source || hostOf(cfg.url);
    try {
      const rows = await fetchIcal(cfg);
      rows.forEach((e) => all.push(normalizeEvent(e, e.ticketUrl, "City Feed", label)));
      perSource[label] = (perSource[label] || 0) + rows.length;
      console.log(`${label} (ical): ${rows.length} events`);
    } catch (err) {
      console.warn(`iCal ${cfg.url} failed:`, (err as any)?.message);
      perSource[label] = perSource[label] || 0;
    }
  }

  // 3. Ticketmaster Discovery (Family events near Walnut Creek).
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

  // 4. Web sources: JSON-LD -> Playwright -> Gemini.
  for (const src of readSources()) {
    try {
      const events = (await extractFromUrl(src, geminiKey)).filter((e) => isKidAppropriate(e.title || "", e.description || ""));
      events.forEach((e) => all.push(normalizeEvent(e, src, "Gemini")));
      perSource[hostOf(src)] = (perSource[hostOf(src)] || 0) + events.length;
      console.log(`${hostOf(src)}: ${events.length} events`);
    } catch (err) {
      console.warn(`Failed ${src}:`, (err as any)?.message);
      perSource[hostOf(src)] = perSource[hostOf(src)] || 0;
    }
  }

  // 5. SerpApi Google Events — structured local results (optional).
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

  await closeBrowser();

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
