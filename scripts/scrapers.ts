/**
 * Platform-specific scrapers, tried before the generic JSON-LD/Playwright/
 * Gemini pipeline. Every adapter is defensive: any failure returns [] and the
 * generic pipeline still runs as a fallback.
 *
 * Adapters (keyed off the source URL):
 *  - tribeApi:     WordPress "The Events Calendar" REST API (/wp-json/tribe/...)
 *  - civicEngage:  CivicPlus Calendar.aspx -> per-event iCalendar.aspx?EID=n
 *  - granicus:     govAccess /Home/Components/Calendar -> Event/ICalendar?ID=n
 *  - eventbrite:   /d/ listing pages -> embedded window.__SERVER_DATA__ JSON
 *  - ticketleap:   organizer page -> follow event links -> JSON-LD per page
 *  - spaCapture:   render the SPA, capture its own JSON API responses, and
 *                  harvest event-shaped objects (BiblioCommons, Macaroni KID)
 */
import { fetchWithRetry, parseIcs, parseIcsDateValue, extractJsonLdEvents, categorizeEvent, PRICE_FALLBACK } from "../serverLib";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };

export interface ScrapeContext {
  // Renders a page with Playwright and captures JSON XHR/fetch responses the
  // page makes. Returns null when Playwright is unavailable.
  renderWithCapture: (url: string) => Promise<{ html: string; jsonBlobs: any[] } | null>;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetchWithRetry(url, { headers: UA });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function windowDays(date: string, time: string, maxDays = 120): boolean {
  const ts = new Date(`${date}T${time}:00Z`).getTime();
  if (isNaN(ts)) return false;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return ts >= today.getTime() && ts <= today.getTime() + maxDays * 86400000;
}

// ---- WordPress "The Events Calendar" REST API -----------------------------
async function tribeApi(url: string): Promise<any[]> {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return [];
  }
  const api = `${origin}/wp-json/tribe/events/v1/events?per_page=50&status=publish`;
  let data: any;
  try {
    const res = await fetchWithRetry(api, { headers: { ...UA, Accept: "application/json" } });
    if (!res.ok) return [];
    data = await res.json();
  } catch {
    return [];
  }
  const events = Array.isArray(data?.events) ? data.events : [];
  const out: any[] = [];
  for (const e of events) {
    if (!e?.title || !e?.start_date) continue; // start_date: "YYYY-MM-DD HH:MM:SS" local
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(e.start_date);
    if (!m) continue;
    const parsed = parseIcsDateValue(`${m[1].replace(/-/g, "")}T${m[2].replace(":", "")}00`);
    if (!parsed || !windowDays(parsed.date, parsed.time)) continue;
    const title = String(e.title).replace(/<[^>]+>/g, "").trim();
    const desc = String(e.description || e.excerpt || "").replace(/<[^>]+>/g, "").trim().slice(0, 400);
    const venue = e.venue?.venue || e.venue?.city || "";
    let price = PRICE_FALLBACK;
    if (e.cost === "" || /free/i.test(String(e.cost))) price = e.cost === "" ? PRICE_FALLBACK : "Free";
    else if (e.cost) price = String(e.cost);
    out.push({
      title,
      artist: "",
      venue: venue || undefined,
      area: e.venue?.city || undefined,
      category: categorizeEvent(title, desc, venue),
      utc: true,
      date: parsed.date,
      time: parsed.time,
      price,
      ticketUrl: e.url || url,
      image: e.image?.url || "",
      description: desc,
    });
  }
  return out;
}

// ---- Per-event ICS harvesting (shared by CivicPlus + Granicus) -------------
async function harvestEventIcs(icsUrls: string[], fallbackUrl: string, area?: string): Promise<any[]> {
  const out: any[] = [];
  for (const icsUrl of icsUrls.slice(0, 30)) {
    const text = await fetchText(icsUrl);
    if (!text || !/BEGIN:VCALENDAR/i.test(text)) continue;
    for (const ev of parseIcs(text)) {
      if (!ev.summary || !ev.dtstart) continue;
      const dt = parseIcsDateValue(ev.dtstart);
      if (!dt || !windowDays(dt.date, dt.time)) continue;
      out.push({
        title: ev.summary,
        artist: "",
        venue: ev.location || undefined,
        area,
        category: categorizeEvent(ev.summary, ev.description, ev.location),
        utc: true,
        date: dt.date,
        time: dt.time,
        price: PRICE_FALLBACK,
        ticketUrl: ev.url || fallbackUrl,
        description: ev.description,
      });
    }
  }
  return out;
}

// ---- CivicPlus / CivicEngage (Calendar.aspx) --------------------------------
// Harvest EID links from the calendar page, then pull each event's iCal export.
// Plain fetch first; if the page is bot-walled or JS-built, render it.
async function fetchOrRender(listUrl: string, ctx: ScrapeContext, needle: RegExp): Promise<string | null> {
  let html = await fetchText(listUrl);
  if (html && needle.test(html)) return html;
  const rendered = await ctx.renderWithCapture(listUrl);
  if (rendered?.html) return rendered.html;
  return html;
}

async function civicEngage(url: string, ctx: ScrapeContext, area?: string): Promise<any[]> {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return [];
  }
  const listUrl = /calendar\.aspx/i.test(url) ? url : `${origin}/calendar.aspx`;
  const eidRe = /Calendar\.aspx\?EID=(\d+)/gi;
  const html = await fetchOrRender(listUrl, ctx, /Calendar\.aspx\?EID=\d+/i);
  if (!html) {
    console.log(`  civicengage ${origin}: list page unreachable`);
    return [];
  }
  const eids = [...new Set([...html.matchAll(eidRe)].map((m) => m[1]))];
  console.log(`  civicengage ${origin}: page ${html.length}b, ${eids.length} event ids`);
  const icsUrls = eids.map((id) => `${origin}/common/modules/iCalendar/iCalendar.aspx?EID=${id}&feed=calendar`);
  return harvestEventIcs(icsUrls, listUrl, area);
}

// ---- Granicus govAccess (/Home/Components/Calendar) ------------------------
async function granicus(url: string, ctx: ScrapeContext, area?: string): Promise<any[]> {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return [];
  }
  const html = await fetchOrRender(url, ctx, /\/Home\/Components\/Calendar\/Event\/\d+/i);
  if (!html) {
    console.log(`  granicus ${origin}: page unreachable`);
    return [];
  }
  const ids = [...new Set([...html.matchAll(/\/Home\/Components\/Calendar\/Event\/(\d+)/gi)].map((m) => m[1]))];
  console.log(`  granicus ${origin}: page ${html.length}b, ${ids.length} event ids`);
  const icsUrls = ids.map((id) => `${origin}/Home/Components/Calendar/Event/ICalendar?ID=${id}&IsPublished=True`);
  return harvestEventIcs(icsUrls, url, area);
}

// ---- Eventbrite /d/ listing pages ------------------------------------------
// The discovery pages embed window.__SERVER_DATA__ with full search results.
function mapEventbriteResult(r: any, pageUrl: string): any | null {
  const name = r?.name || r?.name_display || r?.title;
  const date = r?.start_date || r?.startDate;
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return null;
  const time = /^\d{2}:\d{2}/.test(String(r?.start_time || "")) ? String(r.start_time).slice(0, 5) : "10:00";
  // Eventbrite start times are venue-local (Pacific); convert like ICS floating times.
  const parsed = parseIcsDateValue(`${String(date).replace(/-/g, "")}T${time.replace(":", "")}00`);
  if (!parsed || !windowDays(parsed.date, parsed.time)) return null;
  const venue = r?.primary_venue?.name || r?.venue?.name || "";
  const cityArea = r?.primary_venue?.address?.city || r?.venue?.address?.city || undefined;
  let price = PRICE_FALLBACK;
  if (r?.ticket_availability?.is_free || r?.is_free) price = "Free";
  else if (r?.ticket_availability?.minimum_ticket_price?.display) price = r.ticket_availability.minimum_ticket_price.display.replace(/\.\d{2}$/, "") + "+";
  const desc = String(r?.summary || r?.description || "").replace(/<[^>]+>/g, "").trim().slice(0, 400);
  return {
    title: String(name).trim(),
    artist: "",
    venue: venue || undefined,
    area: cityArea,
    category: categorizeEvent(String(name), desc, venue),
    utc: true,
    date: parsed.date,
    time: parsed.time,
    price,
    ticketUrl: r?.url || r?.tickets_url || pageUrl,
    image: r?.image?.url || r?.image?.original?.url || "",
    description: desc,
  };
}

function harvestEventbriteData(html: string, pageUrl: string): any[] {
  const m = /window\.__SERVER_DATA__\s*=\s*(\{[\s\S]*?\});\s*\n/.exec(html) || /window\.__SERVER_DATA__\s*=\s*(\{[\s\S]*?\});/.exec(html);
  if (!m) return [];
  let data: any;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return [];
  }
  // Result arrays have moved around between page versions; check known spots
  // then fall back to a bounded walk for arrays of event-shaped objects.
  const candidates: any[] = [
    data?.search_data?.events?.results,
    data?.events?.results,
    data?.jsonld,
  ].filter(Array.isArray);
  const out: any[] = [];
  for (const arr of candidates) {
    for (const r of arr) {
      const mapped = mapEventbriteResult(r, pageUrl);
      if (mapped) out.push(mapped);
    }
    if (out.length) return out;
  }
  const seen = new Set<any>();
  const walk = (node: any, depth: number) => {
    if (!node || typeof node !== "object" || depth > 6 || seen.has(node) || out.length >= 60) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        const mapped = item && typeof item === "object" ? mapEventbriteResult(item, pageUrl) : null;
        if (mapped) out.push(mapped);
        else walk(item, depth + 1);
      }
      return;
    }
    Object.values(node).forEach((v) => walk(v, depth + 1));
  };
  walk(data, 0);
  return out;
}

async function eventbrite(url: string, ctx: ScrapeContext): Promise<any[]> {
  const html = await fetchText(url);
  console.log(`  eventbrite: plain fetch ${html ? `${html.length}b, server_data=${/__SERVER_DATA__/.test(html)}` : "failed"}`);
  if (html) {
    const out = harvestEventbriteData(html, url);
    if (out.length) return out;
  }
  // Bot-walled or restructured: render and retry the same extraction, and
  // also harvest any JSON the page fetched for itself.
  const rendered = await ctx.renderWithCapture(url);
  if (rendered?.html) {
    console.log(`  eventbrite: rendered ${rendered.html.length}b, server_data=${/__SERVER_DATA__/.test(rendered.html)}, jsonBlobs=${rendered.jsonBlobs.length}`);
    const out = harvestEventbriteData(rendered.html, url);
    if (out.length) return out;
    for (const blob of rendered.jsonBlobs) {
      const harvested = harvestEventObjects(blob, url);
      if (harvested.length) return harvested;
    }
  }
  return [];
}

// ---- TicketLeap organizer pages ---------------------------------------------
// The organizer page links to per-event pages that carry schema.org JSON-LD.
async function ticketleap(url: string): Promise<any[]> {
  const html = await fetchText(url);
  if (!html) return [];
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return [];
  }
  const links = [...new Set([...html.matchAll(/href=["'](https?:\/\/[^"']+|\/[^"']+)["']/gi)]
    .map((m) => {
      try {
        return new URL(m[1], url).toString();
      } catch {
        return "";
      }
    })
    .filter((l) => l && new URL(l).host === host)
    .filter((l) => /\/(details|events?)\b/i.test(l) || /ticketleap\.com\/[a-z0-9-]+\/?$/i.test(l))
    .filter((l) => l.replace(/\/$/, "") !== url.replace(/\/$/, "")))];
  const out: any[] = [];
  console.log(`  ticketleap: ${links.length} candidate event links`);
  for (const link of links.slice(0, 12)) {
    const page = await fetchText(link);
    if (!page) continue;
    out.push(...extractJsonLdEvents(page, link));
  }
  return out;
}

// ---- SPA JSON capture (BiblioCommons, Macaroni KID) -------------------------
// Render the SPA, let it call its own JSON APIs, then harvest event-shaped
// objects: anything with a title/name string plus a parseable start date.
const TITLE_KEYS = ["title", "name", "eventName", "summary"];
const DATE_KEYS = ["startDate", "start_date", "startTime", "start_time", "start", "date", "eventStart", "startsAt", "starts_at", "dateTime", "startDateTime"];
const VENUE_KEYS = ["branchName", "branch", "locationName", "location", "venueName", "venue", "place"];
const URL_KEYS = ["url", "link", "eventUrl", "permalink", "canonicalUrl"];
const DESC_KEYS = ["description", "summary", "excerpt", "shortDescription", "teaser"];

export function harvestEventObjects(root: any, pageUrl: string, defaults: { venue?: string; area?: string } = {}): any[] {
  const out: any[] = [];
  const seen = new Set<any>();
  const asStr = (v: any): string => (typeof v === "string" ? v : v && typeof v === "object" && typeof v.name === "string" ? v.name : "");
  const walk = (node: any, depth: number) => {
    if (!node || typeof node !== "object" || depth > 8 || seen.has(node) || out.length >= 80) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, depth + 1));
      return;
    }
    const titleKey = TITLE_KEYS.find((k) => typeof node[k] === "string" && node[k].trim().length > 2);
    const dateKey = DATE_KEYS.find((k) => {
      const v = node[k];
      return (typeof v === "string" && !isNaN(new Date(v).getTime())) || (v && typeof v === "object" && typeof v.date === "string");
    });
    if (titleKey && dateKey) {
      const rawDate = typeof node[dateKey] === "string" ? node[dateKey] : node[dateKey].date;
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        const iso = d.toISOString();
        const date = iso.split("T")[0];
        const hasTime = /T\d{2}:\d{2}/.test(String(rawDate)) || /\d{1,2}:\d{2}/.test(String(rawDate));
        const time = hasTime ? iso.slice(11, 16) : "10:00";
        if (windowDays(date, time)) {
          const title = String(node[titleKey]).replace(/<[^>]+>/g, "").trim();
          const venue = asStr(node[VENUE_KEYS.find((k) => node[k]) as string]) || defaults.venue || "";
          const link = URL_KEYS.map((k) => node[k]).find((v) => typeof v === "string" && /^https?:\/\//.test(v));
          const desc = String(node[DESC_KEYS.find((k) => typeof node[k] === "string") as string] || "").replace(/<[^>]+>/g, "").trim().slice(0, 400);
          out.push({
            title,
            artist: "",
            venue: venue || undefined,
            area: defaults.area,
            category: categorizeEvent(title, desc, venue),
            utc: true,
            date,
            time,
            price: PRICE_FALLBACK,
            ticketUrl: link || pageUrl,
            description: desc,
          });
          return; // don't descend into an object we already mapped
        }
      }
    }
    Object.values(node).forEach((v) => walk(v, depth + 1));
  };
  walk(root, 0);
  // De-dupe within the harvest (same title+date can appear in multiple payloads).
  const keys = new Set<string>();
  return out.filter((e) => {
    const k = `${e.title.toLowerCase()}_${e.date}`;
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });
}

async function spaCapture(url: string, ctx: ScrapeContext, defaults: { venue?: string; area?: string } = {}): Promise<any[]> {
  const rendered = await ctx.renderWithCapture(url);
  if (!rendered) return [];
  const out: any[] = [];
  for (const blob of rendered.jsonBlobs) {
    out.push(...harvestEventObjects(blob, url, defaults));
    if (out.length >= 80) break;
  }
  return out;
}

// ---- Dispatcher --------------------------------------------------------------
// Hosts where the WordPress Events Calendar REST API is worth probing first.
const TRIBE_HOSTS = /(bishopranch\.com|walnutcreekdowntown\.com|visitconcordca\.com|moragaparks\.org|lafayettechamber\.org|510families\.com|lindsaywildlife\.org|claytonca\.gov|ruthbancroftgarden\.org|fairyland\.org|oaklandzoo\.org|lawrencehallofscience\.org|museumsrv\.org|blackhawkmuseum\.org|mdia\.org|rockinjump\.com)/i;
const CIVICENGAGE_HOSTS = /(danville\.ca\.gov|cityofconcord\.org|phillca\.gov|pleasanthillrec\.com|moraga\.ca\.us|cityoforinda\.org|claytonca\.gov|contracosta\.ca\.gov)/i;
const GRANICUS_HOSTS = /(walnutcreekca\.gov|walnutcreekartsrec\.org|lovelafayette\.org|cityofmartinez\.org|lesherartscenter\.org)/i;

export async function platformExtract(url: string, ctx: ScrapeContext): Promise<any[]> {
  const results: any[] = [];
  try {
    if (/eventbrite\.com\/d\//i.test(url)) return await eventbrite(url, ctx);
    if (/ticketleap\.com/i.test(url)) return await ticketleap(url);
    if (/bibliocommons\.com/i.test(url)) return await spaCapture(url, ctx, { venue: "Contra Costa County Library" });
    if (/macaronikid\.com/i.test(url)) return await spaCapture(url, ctx);

    if (TRIBE_HOSTS.test(url)) {
      const tribe = await tribeApi(url);
      if (tribe.length) return tribe;
    }
    if (CIVICENGAGE_HOSTS.test(url)) {
      const civ = await civicEngage(url, ctx);
      if (civ.length) return civ;
    }
    if (GRANICUS_HOSTS.test(url)) {
      const gr = await granicus(url, ctx);
      if (gr.length) return gr;
    }
  } catch (err) {
    console.warn(`platformExtract failed for ${url}:`, (err as any)?.message);
  }
  return results;
}
