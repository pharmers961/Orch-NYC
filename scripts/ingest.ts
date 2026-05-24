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
import { fetchWithRetry, extractJsonLdEvents, geminiExtractEventsFromUrl } from "../serverLib";

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

function normalizeEvent(raw: any, sourceUrl: string, provider: string) {
  const cat = VALID_CATS.includes((raw.category || "").toLowerCase()) ? raw.category.toLowerCase() : "other";
  const dateStr = cleanDate(raw.date);
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
    source: hostOf(sourceUrl),
    sourceUrl,
    provider,
  };
}

async function fetchTicketmaster(key: string): Promise<any[]> {
  const now = new Date().toISOString().split(".")[0] + "Z";
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${key}&dmaId=345&sort=date,asc&size=100&startDateTime=${now}&locale=*`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`Ticketmaster ${res.status}`);
  const data: any = await res.json();
  const raw = data?._embedded?.events || [];
  return raw.map((e: any) => {
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
  });
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

async function main() {
  const tmKey = process.env.TICKETMASTER_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const perSource: Record<string, number> = {};
  const all: any[] = [];

  if (tmKey) {
    try {
      const tm = await fetchTicketmaster(tmKey);
      tm.forEach((e) => all.push(normalizeEvent(e, e.ticketUrl || "https://www.ticketmaster.com", "Ticketmaster")));
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

  // De-dupe by id (last write wins).
  const byId = new Map<string, any>();
  all.forEach((e) => byId.set(e.id, e));
  const events = [...byId.values()].sort((a, b) => a.startTs - b.startTs);

  const payload = {
    generatedAt: new Date().toISOString(),
    count: events.length,
    perSource,
    events,
  };
  writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${events.length} events to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error("Ingest crashed:", err);
  process.exit(1);
});
