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

export function categorizeEvent(title: string, description: string): string {
  const hay = `${title || ""} ${description || ""}`.toLowerCase();
  if (/(philharmonic|opera|symphony|orchestra|chamber|recital|classical|quartet)/.test(hay)) return "classical";
  if (/(broadway|theater|theatre|\bplay\b|musical|comedy|drama|cabaret)/.test(hay)) return "broadway";
  if (/(\bvs\.?\b|yankees|mets|knicks|nets|rangers|liberty|\bgame\b|stadium|playoff|nba|nfl|nhl|mlb)/.test(hay)) return "sports";
  if (/(concert|music|jazz|festival|\bband\b|\blive\b|\bdj\b|rock|hip.?hop|set)/.test(hay)) return "concerts";
  return "other";
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

    let venue = "NYC Venue";
    if (typeof node.location === "string") venue = node.location;
    else if (node.location?.name) venue = node.location.name;
    else if (node.location?.address?.addressLocality) venue = node.location.address.addressLocality;

    let price = "Check Site";
    const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
    if (offers) {
      const p = offers.lowPrice ?? offers.price;
      if (p !== undefined && p !== null && `${p}`.trim() !== "") {
        const cur = !offers.priceCurrency || offers.priceCurrency === "USD" ? "$" : "";
        price = Number(p) === 0 ? "Free" : `${cur}${p}`;
      }
    }

    const performer = Array.isArray(node.performer) ? node.performer[0] : node.performer;
    const desc = typeof node.description === "string" ? node.description.replace(/<[^>]+>/g, "").trim().slice(0, 400) : "";

    events.push({
      title: typeof node.name === "string" ? node.name.trim() : String(node.name),
      artist: performer?.name || "",
      venue,
      category: categorizeEvent(node.name, node.description || ""),
      date,
      time,
      price,
      ticketUrl: node.url || offers?.url || sourceUrl,
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
  "artist": "Leading artist or sports team name",
  "venue": "Venue name in NYC or nearby",
  "category": "One of: classical, broadway, concerts, sports, other",
  "date": "YYYY-MM-DD",
  "time": "HH:MM 24h format, e.g. 19:30",
  "price": "e.g. Free, $45+ or $60-$120",
  "ticketUrl": "The direct page to buy/learn about this event",
  "description": "Short 1-2 sentence description of the event"
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
  const hasText = !!webpageText && webpageText.trim().length > 600;
  const lead = hasText
    ? `We fetched the webpage content for the event page: ${url}. The plain-text content is below:\n---\n${webpageText}\n---\nAnalyze this content and extract the event(s) scheduled. If the text looks incomplete, ALSO use Google Search to find current listings for this page.`
    : `We could not read the webpage directly (it may be JS-rendered or blocking scrapers). Use Google Search to look up the current event listings for the page "${url}" (and the organization/venue it represents) and extract its upcoming events.`;
  const prompt = `${lead}
Return a JSON array of parsed events (up to 20 for listings pages, 1 for a single event). Set ticketUrl to the most specific ticket/info page you can find, otherwise "${url}".
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
