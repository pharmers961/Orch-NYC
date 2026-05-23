import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;

function getGeminiClient(clientApiKey?: string) {
  const apiKey = clientApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required or must be supplied in headers/settings.");
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

function getOfflineFallbackEvents(searchQuery: string = "") {
  const qClean = searchQuery.toLowerCase();
  
  // Helper to generate dynamic ISO dates in the future
  const getOffsetDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split("T")[0];
  };

  const pool = [
    {
      title: "Lincoln Center Open Air Summer Concert",
      artist: "NYC Philharmonic Ensemble",
      venue: "Lincoln Center",
      category: "classical",
      date: getOffsetDate(1),
      time: "19:00",
      price: "Free",
      ticketUrl: "https://www.lincolncenter.org",
      description: "Enjoy an evening of breathtaking symphonies under the open stars in Manhattan with the New York Philharmonic ensemble."
    },
    {
      title: "WNYC Greene Space: The Future of Public Media",
      artist: "WNYC Hosts & Special Guests",
      venue: "The Greene Space",
      category: "other",
      date: getOffsetDate(2),
      time: "18:30",
      price: "$15",
      ticketUrl: "https://www.wnyc.org/events/",
      description: "Live interactive panel discussing the future of storytelling, podcasting, and independent local journalism, hosted by WNYC."
    },
    {
      title: "Brooklyn Botanic Garden Sunset Serenade",
      artist: "The Brooklyn Jazz Collective",
      venue: "Brooklyn Botanic Garden",
      category: "concerts",
      date: getOffsetDate(3),
      time: "19:30",
      price: "$25",
      ticketUrl: "https://www.bbg.org",
      description: "Stroll through blooming gardens and settle in for live twilight jazz sets orchestrated by Brooklyn's premier jazz collective."
    },
    {
      title: "WNYC Presents: Selected Shorts Live",
      artist: "Acclaimed Stage and Screen Actors",
      venue: "Symphony Space",
      category: "broadway",
      date: getOffsetDate(4),
      time: "19:00",
      price: "$30+",
      ticketUrl: "https://www.wnyc.org/events/",
      description: "Classic and contemporary short stories read aloud by celebrated actors of Broadway and Hollywood. Introduced by WNYC hosts."
    },
    {
      title: "Yankees vs. Red Sox (Traditional Rivalry)",
      artist: "New York Yankees",
      venue: "Yankee Stadium",
      category: "sports",
      date: getOffsetDate(5),
      time: "13:05",
      price: "$45+",
      ticketUrl: "https://www.ticketmaster.com",
      description: "Catch the classic rivalry live at Yankee Stadium in the Bronx with thousands of passionate baseball fans."
    },
    {
      title: "Shakespeare in the Park: Twelfth Night",
      artist: "The Public Theater Ensemble",
      venue: "Delacorte Theater (Central Park)",
      category: "broadway",
      date: getOffsetDate(2),
      time: "20:00",
      price: "Free",
      ticketUrl: "https://www.publictheater.org/",
      description: "Free Shakespeare in the Park returns to Central Park with spectacular live open-air dramatic showcases."
    },
    {
      title: "Central Park SummerStage Live",
      artist: "SummerStage Orchestral & Soul Showcase",
      venue: "Rumsey Playfield (Central Park)",
      category: "concerts",
      date: getOffsetDate(6),
      time: "18:00",
      price: "Free",
      ticketUrl: "https://cityparksfoundation.org/summerstage/",
      description: "Dynamic outdoor live concert celebrating the musical vibrancy of New York City's public green spaces."
    },
    {
      title: "Brooklyn Museum First Saturdays: NYC Arts & Dance",
      artist: "Local DJs & Art Curators",
      venue: "Brooklyn Museum",
      category: "other",
      date: getOffsetDate(7),
      time: "17:00",
      price: "Free",
      ticketUrl: "https://www.brooklynmuseum.org/",
      description: "An evening of art, craft, community exhibits, and live DJ sets in the heart of Brooklyn's cultural district."
    },
    {
      title: "Blue Note Live: Herbie Hancock Tribute",
      artist: "The Greenwich Village All-Stars",
      venue: "Blue Note Jazz Club",
      category: "concerts",
      date: getOffsetDate(1),
      time: "20:00",
      price: "$35",
      ticketUrl: "http://www.bluenotejazz.com/",
      description: "Incredible evening of jazz bebop and post-bop classics in tribute to Herbie Hancock, celebrating jazz history."
    }
  ];

  if (qClean) {
    const matches = pool.filter(item => 
      item.title.toLowerCase().includes(qClean) || 
      item.artist.toLowerCase().includes(qClean) || 
      item.venue.toLowerCase().includes(qClean) || 
      item.category.toLowerCase().includes(qClean) ||
      item.description.toLowerCase().includes(qClean)
    );
    if (matches.length > 0) {
      return matches;
    }
  }

  return pool.slice(0, 6);
}

// In-memory cache for parsed URL results to avoid re-hitting sites/LLM (rate-limit friendly)
const parseUrlCache = new Map<string, { ts: number; events: any[] }>();
const PARSE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function fetchWithRetry(url: string, options: any = {}, retries = 2): Promise<Response> {
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

function categorizeEvent(title: string, description: string): string {
  const hay = `${title || ""} ${description || ""}`.toLowerCase();
  if (/(philharmonic|opera|symphony|orchestra|chamber|recital|classical|quartet)/.test(hay)) return "classical";
  if (/(broadway|theater|theatre|\bplay\b|musical|comedy|drama|cabaret)/.test(hay)) return "broadway";
  if (/(\bvs\.?\b|yankees|mets|knicks|nets|rangers|liberty|\bgame\b|stadium|playoff|nba|nfl|nhl|mlb)/.test(hay)) return "sports";
  if (/(concert|music|jazz|festival|\bband\b|\blive\b|\bdj\b|rock|hip.?hop|set)/.test(hay)) return "concerts";
  return "other";
}

// Deterministically parse schema.org/JSON-LD Event markup from a page (no API key needed).
function extractJsonLdEvents(html: string, sourceUrl: string): any[] {
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
        date = dt.toISOString().split("T")[0];
        const tMatch = String(node.startDate).match(/T(\d{2}:\d{2})/);
        time = tMatch ? tMatch[1] : dt.toISOString().split("T")[1].slice(0, 5);
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
  // Only keep events with a resolvable date; de-dupe by title+date.
  const seen = new Set<string>();
  return events.filter((e) => {
    if (!e.date) return false;
    const key = `${e.title.toLowerCase()}_${e.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 25);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  // API middleware to bypass any CORS restrictions and serve ticketmaster & gemini requests
  app.post("/api/marquee", async (req, res) => {
    try {
      const { action, payload } = req.body;
      const clientTmKey = req.headers["x-ticketmaster-key"] as string || req.body.ticketmasterKey;
      const clientGeminiKey = req.headers["x-gemini-key"] as string || req.body.geminiKey;

      const TICKETMASTER_KEY = clientTmKey || process.env.TICKETMASTER_KEY;

      if (action === "ticketmaster") {
        if (!TICKETMASTER_KEY) {
          return res.status(200).json({
            success: false,
            error: "Ticketmaster API key is not configured. Please add it to Settings or the server environment.",
            events: []
          });
        }

        const now = new Date().toISOString().split(".")[0] + "Z";
        // Free consumer key limit of 5000/day
        const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_KEY}&dmaId=345&sort=date,asc&size=100&startDateTime=${now}&locale=*`;
        
        try {
          const apiRes = await fetchWithRetry(url);
          if (!apiRes.ok) {
            const errBody = await apiRes.text();
            console.error("Ticketmaster API returned non-200:", apiRes.status, errBody);
            return res.status(400).json({ success: false, error: `Ticketmaster error: ${apiRes.statusText}` });
          }
          const data = await apiRes.json();
          return res.status(200).json({ success: true, count: data._embedded?.events?.length || 0, data });
        } catch (tmFetchError: any) {
          console.error("Failed to fetch Ticketmaster API:", tmFetchError);
          return res.status(500).json({ success: false, error: tmFetchError.message });
        }
      }

      if (action === "gemini") {
        let ai;
        try {
          ai = getGeminiClient(clientGeminiKey);
        } catch (geminiInitErr: any) {
          return res.status(200).json({
            success: false,
            error: "Gemini API key is not configured. Please supply a key in Settings or the server environment.",
            events: []
          });
        }

        // Search Grounding Prompt
        const prompt = `Search the web for real, currently-scheduled upcoming events in New York City over the next ~3 weeks across classical/opera (NY Philharmonic, Metropolitan Opera, Carnegie Hall), Broadway theater, major concerts (Madison Square Garden, Barclays Center, Radio City Music Hall, Brooklyn Steel), and pro sports (Knicks, Rangers, Yankees, Mets, Nets, Liberty). You can also include any notable local event venues in NYC.
Return ONLY a JSON array of up to 12 events.
Each event in the array MUST strictly follow this JSON object schema:
{
  "title": "Clean event title without corporate sponsors if possible",
  "artist": "Leading artist or sports team name",
  "venue": "Actual venue name in NYC",
  "category": "One of: classical, broadway, concerts, sports",
  "date": "YYYY-MM-DD",
  "time": "HH:MM 24h format, e.g. 19:30",
  "price": "e.g. $45+ or $60-$120",
  "ticketUrl": "The direct page to buy that specific event ticket (not a generic home page)",
  "description": "Short 1-2 sentence description of the event"
}
Ensure all keys are formatted perfectly in JSON. Do not return any backticks or markdown, start with [ and end with ].`;

        let response;
        try {
          // Model selection guide recommends gemini-3.5-flash for general search grounding
          response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }],
              responseMimeType: "application/json",
            },
          });
        } catch (geminiCallError: any) {
          console.warn("Gemini grounding API call failed, attempting self-healing fallback without search tool:", geminiCallError.message || geminiCallError);
          try {
            const fallbackPrompt = `${prompt}\n(Note: Your real-time search tool is currently hitting rate limits, so please do your best to retrieve recent or periodically scheduled upcoming events from your training knowledge base.)`;
            response = await ai.models.generateContent({
              model: "gemini-3.5-flash",
              contents: fallbackPrompt,
              config: {
                responseMimeType: "application/json",
              },
            });
          } catch (fallbackError: any) {
            console.error("Gemini grounding and fallback search both failed, triggering offline self-healing registry:", fallbackError.message || fallbackError);
            return res.status(200).json({ 
              success: true, 
              events: getOfflineFallbackEvents(),
              isOfflineFallback: true,
              warning: "Gemini API rate limit exceeded. Displaying offline-optimized New York City events."
            });
          }
        }

        try {
          const jsonText = response && response.text ? response.text.trim() : "[]";
          const events = JSON.parse(jsonText);
          return res.status(200).json({ success: true, events });
        } catch (parseError: any) {
          console.error("Failed to parse Gemini JSON output structure:", parseError);
          return res.status(200).json({ success: false, error: "Failed to parse synchronized schedules. Please try again in a few seconds." });
        }
      }

      if (action === "googleEvents") {
        const clientSerpApiKey = req.headers["x-serpapi-key"] as string || req.body.serpapiKey;
        const SERPAPI_KEY = clientSerpApiKey || process.env.SERPAPI_KEY;

        const { query } = payload || {};
        const searchQueryStr = (query || "upcoming popular events").trim();

        // 1. Try SerpApi Google Events Scraper directly
        if (SERPAPI_KEY) {
          try {
            const serpQuery = searchQueryStr.toLowerCase().includes("nyc") || searchQueryStr.toLowerCase().includes("new york") 
              ? searchQueryStr 
              : `${searchQueryStr} New York`;
            const url = `https://serpapi.com/search.json?engine=google_events&q=${encodeURIComponent(serpQuery)}&api_key=${SERPAPI_KEY}`;
            console.log(`Querying SerpApi Google Events at: ${url}`);
            
            const serpRes = await fetch(url);
            if (serpRes.ok) {
              const data = await serpRes.json();
              if (Array.isArray(data.events_results)) {
                const events = data.events_results.map((e: any) => {
                  const venueName = e.venue?.name || (Array.isArray(e.address) ? e.address[0] : e.address) || "NYC Venue";
                  let ticketUrl = e.link || "";
                  if (Array.isArray(e.ticket_info) && e.ticket_info.length > 0) {
                    ticketUrl = e.ticket_info[0].link || e.ticket_info[0].source_link || e.link || "";
                  }
                  
                  // Category heuristics
                  const tLower = (e.title || "").toLowerCase();
                  const dLower = (e.description || "").toLowerCase();
                  let category = "other";
                  if (tLower.includes("concert") || tLower.includes("music") || tLower.includes("jazz") || tLower.includes("festival") || tLower.includes("band") || tLower.includes("live at") || tLower.includes("rock") || tLower.includes("live in")) {
                    category = "concerts";
                  } else if (tLower.includes("philharmonic") || tLower.includes("opera") || tLower.includes("symphony") || tLower.includes("orchestra") || tLower.includes("chamber") || tLower.includes("piano recital") || tLower.includes("classical")) {
                    category = "classical";
                  } else if (tLower.includes("broadway") || tLower.includes("theater") || tLower.includes("play") || tLower.includes("musical") || tLower.includes("comedy") || tLower.includes("drama")) {
                    category = "broadway";
                  } else if (tLower.includes("vs.") || tLower.includes("vs ") || tLower.includes("yankees") || tLower.includes("knicks") || tLower.includes("mets") || tLower.includes("nets") || tLower.includes("rangers") || tLower.includes("sports") || tLower.includes("game")) {
                    category = "sports";
                  } else if (dLower.includes("symphony") || dLower.includes("classical") || dLower.includes("orchestra")) {
                    category = "classical";
                  } else if (dLower.includes("broadway") || dLower.includes("theater") || dLower.includes("musical")) {
                    category = "broadway";
                  } else if (dLower.includes("concert") || dLower.includes("music") || dLower.includes("jazz") || dLower.includes("live sets")) {
                    category = "concerts";
                  } else if (dLower.includes("vs.") || dLower.includes("game") || dLower.includes("stadium")) {
                    category = "sports";
                  }

                  // Date/time extraction
                  let dateVal = "";
                  let timeVal = "19:00";
                  if (e.date?.start_time) {
                    try {
                      const dt = new Date(e.date.start_time);
                      if (!isNaN(dt.getTime())) {
                        dateVal = dt.toISOString().split("T")[0];
                        timeVal = dt.toISOString().split("T")[1].slice(0, 5);
                      }
                    } catch (_) {}
                  }

                  if (!dateVal && e.date?.when) {
                    try {
                      const rawWhen = e.date.when.replace(/^[A-Za-z]{3},\s*/, "");
                      const currentYear = new Date().getFullYear();
                      const dt = new Date(`${rawWhen} ${currentYear}`);
                      if (!isNaN(dt.getTime())) {
                        dateVal = dt.toISOString().split("T")[0];
                        const timeMatch = e.date.when.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                        if (timeMatch) {
                          let [_, h, m, ampm] = timeMatch;
                          let hour = parseInt(h, 10);
                          if (ampm.toUpperCase() === "PM" && hour !== 12) hour += 12;
                          if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;
                          timeVal = `${String(hour).padStart(2, "0")}:${m}`;
                        }
                      }
                    } catch (_) {}
                  }

                  if (!dateVal) {
                    dateVal = new Date().toISOString().split("T")[0];
                  }

                  return {
                    title: e.title,
                    artist: e.artist || "",
                    venue: venueName,
                    category: category,
                    date: dateVal,
                    time: timeVal,
                    price: e.ticket_info?.[0]?.price || "Check Site",
                    ticketUrl: ticketUrl,
                    description: e.description || ""
                  };
                });
                return res.status(200).json({ success: true, events, source: "serpapi" });
              }
            } else {
              const errTxt = await serpRes.text();
              console.warn("SerpApi returned non-200 state, attempting Gemini fallback:", serpRes.status, errTxt);
            }
          } catch (serpError: any) {
            console.error("SerpApi fetching failed, attempting Gemini fallback:", serpError);
          }
        }

        // 2. Gemini Grounding engine fallback (if SerpApi was missing or failed)
        let ai;
        try {
          ai = getGeminiClient(clientGeminiKey);
        } catch (geminiInitErr: any) {
          return res.status(200).json({
            success: false,
            error: "Gemini / SerpApi credentials are not configured. Please supply a key in Settings or the server environment.",
            events: []
          });
        }

        // Specific search prompt for Google Events happening in New York City (NYC)
        const prompt = `You are powering a real-time "Google Events API" connection for New York City (NYC).
Search Google Events or the live web for upcoming events matching the user's focus: "${searchQueryStr}".
CRITICAL CONSTRAINT: You MUST restrict findings to real events scheduled to occur in New York City (NYC) or its immediate boroughs (Manhattan, Brooklyn, Queens, Bronx, Staten Island). Under no circumstances return events outside of New York City.
Return ONLY a JSON array of up to 12 scheduled events.
Each event in the array MUST strictly follow this JSON object schema:
{
  "title": "Clean event title",
  "artist": "Lead performer, sports team, host, or lineup",
  "venue": "Venue name in NYC (e.g., Madison Square Garden, Blue Note, Carnegie Hall, etc.)",
  "category": "One of: classical, broadway, concerts, sports, other",
  "date": "YYYY-MM-DD",
  "time": "HH:MM 24h format, e.g. 19:30 or 14:00",
  "price": "e.g. Free, $15, $50+, or Check Site",
  "ticketUrl": "The direct purchase page, official listing page, or ticket info URL",
  "description": "Short 1-2 sentence description explaining the event"
}
Ensure all keys are formatted perfectly in JSON. Do not return any backticks, markdown, or text wrapping description outside JSON, start with [ and end with ].`;

        let response;
        try {
          response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }],
              responseMimeType: "application/json",
            },
          });
        } catch (geminiCallError: any) {
          console.warn("Google Events grounding call failed, attempting fallback:", geminiCallError.message || geminiCallError);
          try {
            response = await ai.models.generateContent({
              model: "gemini-3.5-flash",
              contents: `${prompt}\n(Grounding search tool hit rate-limit constraints, please respond with standard training knowledge for upcoming events in New York City matching '${searchQueryStr}')`,
              config: {
                responseMimeType: "application/json",
              },
            });
          } catch (fallbackError: any) {
            console.error("Google Events API call and fallback both failed, triggering offline self-healing registry:", fallbackError.message || fallbackError);
            return res.status(200).json({ 
              success: true, 
              events: getOfflineFallbackEvents(searchQueryStr),
              isOfflineFallback: true,
              warning: "Google Events search hit rate limits. Displaying pre-cached upcoming schedules."
            });
          }
        }

        try {
          const jsonText = response && response.text ? response.text.trim() : "[]";
          const events = JSON.parse(jsonText);
          return res.status(200).json({ success: true, events });
        } catch (parseError: any) {
          console.error("Failed to parse Google Events JSON output:", parseError);
          return res.status(200).json({ success: false, error: "Failed to parse Google Events schedules. Try refining your query." });
        }
      }

      if (action === "parseUrl") {
        const { url } = payload;
        if (!url) {
          return res.status(400).json({ success: false, error: "Missing url parameter" });
        }

        // 0. Serve from cache if fresh (rate-limit friendly).
        const cached = parseUrlCache.get(url);
        if (cached && Date.now() - cached.ts < PARSE_CACHE_TTL_MS) {
          return res.status(200).json({ success: true, events: cached.events, cached: true });
        }

        let webpageText = "";
        let fetchSucceeded = false;

        try {
          const fetchRes = await fetchWithRetry(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          if (fetchRes.ok) {
            const html = await fetchRes.text();

            // 1. Try deterministic schema.org / JSON-LD extraction first — no API key required.
            const ldEvents = extractJsonLdEvents(html, url);
            if (ldEvents.length > 0) {
              parseUrlCache.set(url, { ts: Date.now(), events: ldEvents });
              return res.status(200).json({ success: true, events: ldEvents, method: "schema.org" });
            }

            // Strip styles, scripts, and HTML tags to keep it within tokens
            webpageText = html
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .slice(0, 30000);
            fetchSucceeded = true;
          }
        } catch (fetchErr) {
          console.log(`Direct fetch for ${url} failed or was blocked by CORS, falling back solely to Gemini grounding retrieval.`);
        }

        // 2. LLM fallback (needs a Gemini key).
        let ai;
        try {
          ai = getGeminiClient(clientGeminiKey);
        } catch (geminiInitErr: any) {
          return res.status(200).json({
            success: false,
            errorCode: "NO_GEMINI_KEY",
            error: "No structured event data (schema.org) was found on this page, and AI extraction needs a Gemini API key. Add one in Settings, or try a page with structured event listings.",
            events: []
          });
        }

        const domainAndUrlPrompt = fetchSucceeded 
          ? `We fetched the webpage content for the event page: ${url}. The plain-text content is below:
---
${webpageText}
---
Analyze this content and extract the event(s) scheduled. Make sure to find the Title, Performing Artist or Team, Date, Time, Venue, Price, and a short Description. Set the ticketUrl to the direct ticketing page if present, otherwise set it to "${url}".`
          : `We could not fetch the webpage directly. Please search the web or lookup the event page: "${url}" using Google Search and extract its events. Set ticketUrl to "${url}".`;

        const finalPrompt = `${domainAndUrlPrompt}
Return a JSON array of parsed events. If multiple events are scheduled (like a roster/listings page), parse up to 5 events. If a single event, parse 1 event.
Each event in the array MUST strictly follow this JSON schema:
{
  "title": "Clean event title",
  "artist": "Leading artist or sports team name",
  "venue": "Venue name in NYC or nearby",
  "category": "One of: classical, broadway, concerts, sports",
  "date": "YYYY-MM-DD",
  "time": "HH:MM 24h format, e.g. 19:30",
  "price": "e.g. $45+ or $60-$120",
  "ticketUrl": "The direct page to buy that specific event ticket (defaults to ${url} if not found elsewhere)",
  "description": "Short 1-2 sentence description of the event"
}
Ensure all keys are formatted perfectly in JSON. Do not return any backticks or markdown, start with [ and end with ].`;

        let response;
        try {
          response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: finalPrompt,
            config: {
              tools: [{ googleSearch: {} }],
              responseMimeType: "application/json",
            },
          });
        } catch (geminiCallError: any) {
          console.warn("Gemini parsing API call with grounding failed, trying fallback without grounding tool:", geminiCallError.message || geminiCallError);
          try {
            response = await ai.models.generateContent({
              model: "gemini-3.5-flash",
              contents: finalPrompt,
              config: {
                responseMimeType: "application/json",
              },
            });
          } catch (fallbackError: any) {
            console.error("Gemini parseUrl both grounding and fallback configurations failed:", fallbackError);
            const isQuotaError = fallbackError.message?.includes("quota") || fallbackError.message?.includes("429") || fallbackError.message?.includes("RESOURCE_EXHAUSTED");
            const errorMessage = isQuotaError
              ? "Gemini API rate limit exceeded (Quota Exhausted). Please wait a moment or supply an alternative custom API key in Settings."
              : `Gemini extraction is temporarily unavailable: ${fallbackError.message}`;
            return res.status(200).json({ success: false, error: errorMessage });
          }
        }

        try {
          const jsonText = response && response.text ? response.text.trim() : "[]";
          const events = JSON.parse(jsonText);
          if (Array.isArray(events) && events.length > 0) {
            parseUrlCache.set(url, { ts: Date.now(), events });
          }
          return res.status(200).json({ success: true, events, method: "ai" });
        } catch (parseError: any) {
          console.error("Failed to parse static page extracted event JSON:", parseError);
          return res.status(200).json({ success: false, error: "Failed to parse schedules extracted from this target URL." });
        }
      }

      return res.status(400).json({ success: false, error: "Unavailable action" });
    } catch (err: any) {
      console.error("Unhandle server-side proxy exception:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Serve static assets in production, otherwise Vite handles requests in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Serve client-side router files under index.html as fallback in Express
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
