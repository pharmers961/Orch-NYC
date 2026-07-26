/**
 * Shared server-side helpers used by both the request handlers (server.ts)
 * and the scheduled ingest job (ingest.ts).
 */
import { GoogleGenAI } from "@google/genai";

export function getGeminiClient(clientApiKey?: string) {
  const apiKey = clientApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required or must be supplied in headers/settings.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

export async function fetchWithRetry(url: string, options: any = {}, retries = 2): Promise<Response> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

// Shared fallback shown when no price could be determined.
export const PRICE_FALLBACK = "Check site";

// ---- Pacific-time helpers ------------------------------------------------
// Convert an America/Los_Angeles wall time to the corresponding UTC instant
// (handles DST via Intl, fixed-point iteration).
export function laWallToUtc(y: number, mo: number, d: number, hh: number, mm: number): Date {
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

// ---- ICS parsing ----------------------------------------------------------
// Minimal ICS parser: unfold lines, walk VEVENT blocks, read the fields we use.
export function parseIcsDateValue(value: string): { date: string; time: string } | null {
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

// Best-effort categorization for a kids/family calendar. Keyword rules run
// first (most specific category to most general), then the venue provides a
// fallback for reliably single-genre venues (libraries, craft stores, farms).
export function categorizeEvent(title: string, description: string, venue = ""): string {
  const hay = `${title || ""} ${description || ""}`.toLowerCase();
  const v = (venue || "").toLowerCase();

  if (/(story ?time|storytelling|story hour|read to a (dog|therapy)|lap ?sit|baby time|toddler time|rhyme time|bilingual stories|book (club|buddies)|picture book)/.test(hay)) return "storytime";
  if (/(festival|\bfair\b|carnival|parade|celebration|egg hunt|trick.or.treat|tree lighting|oktoberfest|farmers.? market|holiday market|block party|touch.a.truck)/.test(hay)) return "festivals";
  if (/(\bcraft\b|crafts|\blego\b|maker|make ?break|build.*workshop|kids.? workshop|art (class|lab|studio)|painting|slime|\bstem\b|science (lab|saturday)|tinker|scouts? build|diy)/.test(hay)) return "crafts";
  if (/(wildlife|\banimals?\b|\bfarm\b|nature|hike|ranger|garden|\bzoo\b|creek|\bbugs?\b|\bbirds?\b|pony|petting|raptor|tide ?pool|junior naturalist)/.test(hay)) return "nature";
  if (/(puppet|magic show|magician|\bmovie\b|\bfilm\b|cinema|\bcircus\b|\bballet\b|nutcracker|theatre|theater|musical|\bplay\b|dance performance)/.test(hay)) return "shows";
  if (/(concert|music in the park|live music|\bband\b|sing.?along|kindermusik|music (class|together)|summer concert|symphony|orchestra|\bjazz\b|\bmusic\b)/.test(hay)) return "music";
  if (/(open gym|play ?time|open play|bounce|skate|swim|splash|soccer|basketball|gymnastics|t-ball|tumbling|bike (rodeo|ride)|scavenger hunt|obstacle|sports)/.test(hay)) return "play";

  // Venue fallback (strong signal when the title alone is generic).
  if (/(lindsay wildlife|regional park|ebparks|borges ranch|forest home farms|\branch\b|\bfarm\b)/.test(v)) return "nature";
  if (/(lowe'?s|home depot|lakeshore|michaels)/.test(v)) return "crafts";
  if (/\blibrary\b/.test(v)) return "storytime";
  if (/(lesher|village theatre|theatre|theater|amphitheat)/.test(v)) return "shows";
  return "other";
}

// Best-effort age-range extraction from event text. Returns "lo-hi", "all",
// or "" when nothing age-like is stated.
export function parseAges(text: string): string {
  const t = (text || "").toLowerCase();
  let m = /ages?\s*(\d{1,2})\s*(?:[-–—]|to|through)\s*(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}`;
  m = /ages?\s*(\d{1,2})\s*(?:\+|and (?:up|older|above))/.exec(t);
  if (m) return `${m[1]}-17`;
  m = /(?:under|younger than)\s+(\d{1,2})\b/.exec(t);
  if (m) return `0-${Math.max(0, +m[1] - 1)}`;
  m = /\bages?\s+(\d{1,2})\b/.exec(t);
  if (m) return `${m[1]}-${m[1]}`;
  if (/(babies|\bbaby\b|infant|lap ?sit)/.test(t)) return "0-1";
  if (/toddler/.test(t)) return "1-3";
  if (/preschool/.test(t)) return "3-5";
  if (/(school.age|elementary)/.test(t)) return "5-12";
  if (/\bteens?\b/.test(t)) return "13-17";
  if (/(all ages|whole family|everyone welcome)/.test(t)) return "all";
  return "";
}

// Events that clearly aren't for young kids: adults-only signals, nightlife,
// and alcohol-centric outings. Used to filter generic providers (Ticketmaster
// Family classification is pre-filtered, but scrapes and search results aren't).
export function isKidAppropriate(title: string, description = ""): boolean {
  const hay = `${title || ""} ${description || ""}`.toLowerCase();
  return !/(21\s*\+|18\s*\+|adults?[- ]only|ages? 21|wine (tasting|walk|stroll)|beer (crawl|fest|garden)|brewery tour|cocktail|mixology|bar crawl|happy hour|singles|speed dating|burlesque|drag brunch|casino|cannabis|gala dinner|networking mixer)/.test(hay);
}

// Deterministically parse schema.org / JSON-LD Event markup from a page (no API key needed).
export function extractJsonLdEvents(html: string, sourceUrl: string): any[] {
  const events: any[] = [];
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const blobs: any[] = [];
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      blobs.push(JSON.parse(match[1].trim()));
    } catch (_) {
      // Some sites concatenate multiple JSON objects; ignore unparseable blocks.
    }
  }

  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node["@graph"]) visit(node["@graph"]);
    if (node.subEvent) visit(node.subEvent);

    const rawType = node["@type"];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    const isEvent = types.some((t: any) => typeof t === "string" && /Event/i.test(t));
    if (!isEvent || !node.name) return;

    let date = "";
    let time = "19:00";
    if (node.startDate) {
      const dt = new Date(node.startDate);
      if (!isNaN(dt.getTime())) {
        // Use a consistent UTC instant for both date and time so the client
        // (which stores `${date}T${time}:00Z`) reconstructs the correct moment.
        const iso = dt.toISOString();
        date = iso.split("T")[0];
        time = iso.split("T")[1].slice(0, 5);
      }
    }

    let venue = "East Bay Venue";
    if (typeof node.location === "string") venue = node.location;
    else if (node.location?.name) venue = node.location.name;
    else if (node.location?.address?.addressLocality) venue = node.location.address.addressLocality;

    // Gather price across all offers so we can emit a real range, not just the
    // first low price. `lowPrice` implies a "from" price; `highPrice` closes a range.
    const offersArr = Array.isArray(node.offers) ? node.offers : node.offers ? [node.offers] : [];
    const lows: number[] = [];
    const highs: number[] = [];
    let currency = "USD";
    let sawLow = false;
    let sawHigh = false;
    for (const o of offersArr) {
      if (!o) continue;
      if (o.priceCurrency) currency = o.priceCurrency;
      const lowRaw = o.lowPrice ?? o.price;
      if (lowRaw != null && `${lowRaw}`.trim() !== "" && !isNaN(Number(lowRaw))) {
        lows.push(Number(lowRaw));
        if (o.lowPrice != null) sawLow = true;
      }
      if (o.highPrice != null && `${o.highPrice}`.trim() !== "" && !isNaN(Number(o.highPrice))) {
        highs.push(Number(o.highPrice));
        sawHigh = true;
      }
    }
    let price = PRICE_FALLBACK;
    if (lows.length) {
      const cur = currency === "USD" ? "$" : "";
      const min = Math.min(...lows);
      if (sawHigh && highs.length) {
        const max = Math.max(...highs);
        price = max > min ? `${cur}${min}–${cur}${max}` : min === 0 ? "Free" : `${cur}${min}`;
      } else if (sawLow) {
        price = min === 0 ? "Free" : `${cur}${min}+`;
      } else {
        price = min === 0 ? "Free" : `${cur}${min}`;
      }
    }

    const performer = Array.isArray(node.performer) ? node.performer[0] : node.performer;
    const desc = typeof node.description === "string" ? node.description.replace(/<[^>]+>/g, "").trim().slice(0, 400) : "";

    events.push({
      title: typeof node.name === "string" ? node.name.trim() : String(node.name),
      artist: performer?.name || "",
      venue,
      category: categorizeEvent(node.name, node.description || "", venue),
      utc: true, // startDate was resolved to a UTC instant above
      date,
      time,
      price,
      ticketUrl: node.url || offersArr[0]?.url || sourceUrl,
      description: desc,
    });
  };

  blobs.forEach(visit);
  const seen = new Set<string>();
  return events.filter((e) => {
    if (!e.date) return false;
    const key = `${e.title.toLowerCase()}_${e.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 25);
}

// The JSON schema instruction shared by the AI extraction prompts.
export const EVENT_JSON_SCHEMA_HINT = `Each event in the array MUST strictly follow this JSON schema:
{
  "title": "Clean event title",
  "artist": "Performer, host, or presenting organization (may be empty)",
  "venue": "Venue name (in or near Central Contra Costa County, CA)",
  "area": "City, e.g. Walnut Creek, Concord, Pleasant Hill, Danville, Lafayette, Moraga, Orinda, San Ramon, Martinez, Clayton",
  "category": "One of: storytime, crafts, music, shows, nature, play, festivals, other",
  "date": "YYYY-MM-DD",
  "time": "HH:MM 24h format, e.g. 10:30",
  "price": "e.g. Free, $10+ or $10-$25",
  "ages": "Target age range if stated, e.g. 3-5, 0-2, all (else empty string)",
  "ticketUrl": "The direct page to register/learn about this event",
  "description": "Short 1-2 sentence description of the event, mentioning target ages if stated"
}
Ensure all keys are valid JSON. Do not return backticks or markdown; start with [ and end with ].`;

// Use Gemini (with Google Search grounding) to extract events for a URL.
// `webpageText` may be null/empty when the page couldn't be read directly.
export async function geminiExtractEventsFromUrl(
  geminiKey: string | undefined,
  url: string,
  webpageText: string | null
): Promise<any[]> {
  const ai = getGeminiClient(geminiKey);
  const today = new Date().toISOString().split("T")[0];
  const hasText = !!webpageText && webpageText.trim().length > 600;
  const lead = hasText
    ? `We fetched the webpage content for the event page: ${url}. The plain-text content is below:\n---\n${webpageText}\n---\nAnalyze this content and extract the event(s) scheduled. If the text looks incomplete, ALSO use Google Search to find current listings for this page.`
    : `We could not read the webpage directly (it may be JS-rendered or blocking scrapers). Use Google Search to look up the current event listings for the page "${url}" (and the organization/venue it represents) and extract its upcoming events.`;
  const prompt = `${lead}
This feed powers a family events calendar for parents of young children (ages 0-7) in Central Contra Costa County, California: Walnut Creek, Concord, Pleasant Hill, Danville, Alamo, Lafayette, Moraga, Orinda, San Ramon, Martinez, and Clayton.
ONLY return events that are (a) designed for kids/families (storytimes, crafts, kids' workshops, puppet shows, nature programs), or (b) family-friendly community events a parent would happily bring young kids to (music in the park, festivals, farmers markets, movie nights). EXCLUDE adults-only events (21+, nightlife, wine/beer events, adult classes) and events located outside those cities.
Today's date is ${today}. ONLY return events scheduled on or after today, and use the correct full calendar year (this year or next) — never default to a past year. Discard anything already past.
Return a JSON array of parsed events (up to 20 for listings pages, 1 for a single event). Set ticketUrl to the most specific registration/info page you can find, otherwise "${url}".
${EVENT_JSON_SCHEMA_HINT}`;

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" },
    });
  } catch (_) {
    response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });
  }
  const jsonText = response && response.text ? response.text.trim() : "[]";
  const parsed = JSON.parse(jsonText);
  return Array.isArray(parsed) ? parsed : [];
}
