/**
 * Scheduled ingest pipeline: gather sources -> extract events
 * (feeds-first, Gemini fallback) -> normalize + dedupe -> write to Firestore.
 *
 * Runs server-side with the Firebase Admin SDK (bypasses security rules).
 * Credentials: Application Default Credentials on Cloud Run, or a service
 * account JSON in the FIREBASE_SERVICE_ACCOUNT env var.
 */
import { initializeApp, applicationDefault, cert, getApps, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { fetchWithRetry, extractJsonLdEvents, categorizeEvent, geminiExtractEventsFromUrl } from "./serverLib";
import firebaseConfig from "./firebase-applet-config.json";

const DATABASE_ID = firebaseConfig.firestoreDatabaseId || "(default)";

// Default NYC sources scraped for everyone (in addition to any signed-in users' sources).
const DEFAULT_SOURCES: string[] = [
  "https://www.wnyc.org/events/",
  "https://www.carnegiehall.org/Calendar",
  "https://www.lincolncenter.org/calendar",
  "https://www.bam.org/calendar",
  "https://www.boweryballroom.com/calendar",
  "https://www.bluenotejazz.com/nyc/shows/",
  "https://cityparksfoundation.org/summerstage/",
  "https://www.publictheater.org/",
];

let adminDb: Firestore | null = null;

function getAdminDb(): Firestore {
  if (adminDb) return adminDb;
  let app: App;
  if (getApps().length) {
    app = getApps()[0];
  } else {
    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (saJson) {
      app = initializeApp({ credential: cert(JSON.parse(saJson)), projectId: firebaseConfig.projectId });
    } else {
      // Application Default Credentials (works automatically on Cloud Run / GCP).
      app = initializeApp({ credential: applicationDefault(), projectId: firebaseConfig.projectId });
    }
  }
  adminDb = getFirestore(app, DATABASE_ID);
  return adminDb;
}

function hostOf(url: string): string {
  try {
    let s = url.trim();
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    return new URL(s).hostname.replace(/^www\./i, "");
  } catch (_) {
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
  // Firestore doc IDs cannot contain "/" and must be non-empty.
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
    doc: dedupeKey(title, dateStr),
    data: {
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
    },
  };
}

// --- Source extractors ---

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
  } catch (_) {
    // Network error / blocked — fall through to AI.
  }

  if (html) {
    const ld = extractJsonLdEvents(html, url);
    if (ld.length > 0) return ld;
  }

  // AI fallback (needs Gemini key). If no key, we simply return nothing for this source.
  if (!geminiKey && !process.env.GEMINI_API_KEY) return [];
  const text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 30000);
  try {
    return await geminiExtractEventsFromUrl(geminiKey, url, text || null);
  } catch (_) {
    return [];
  }
}

async function gatherSources(db: Firestore): Promise<string[]> {
  const set = new Set<string>(DEFAULT_SOURCES.map((s) => s.toLowerCase()));
  try {
    const snap = await db.collection("users").get();
    snap.forEach((doc) => {
      const sources = doc.data()?.sources;
      if (Array.isArray(sources)) sources.forEach((s: string) => typeof s === "string" && set.add(s.toLowerCase()));
    });
  } catch (err) {
    console.warn("Could not read user sources for ingest:", (err as any)?.message);
  }
  return [...set];
}

export interface IngestSummary {
  ok: boolean;
  total: number;
  written: number;
  perSource: Record<string, number>;
  startedAt: string;
  finishedAt: string;
  error?: string;
}

export async function runIngest(opts?: { ticketmasterKey?: string; geminiKey?: string }): Promise<IngestSummary> {
  const startedAt = new Date().toISOString();
  const perSource: Record<string, number> = {};
  const normalized: { doc: string; data: any }[] = [];
  const tmKey = opts?.ticketmasterKey || process.env.TICKETMASTER_KEY;
  const geminiKey = opts?.geminiKey || process.env.GEMINI_API_KEY;

  const db = getAdminDb();

  // 1. Ticketmaster API (fast, structured).
  if (tmKey) {
    try {
      const tm = await fetchTicketmaster(tmKey);
      tm.forEach((e) => normalized.push(normalizeEvent(e, e.ticketUrl || "https://www.ticketmaster.com", "Ticketmaster")));
      perSource["ticketmaster.com"] = tm.length;
    } catch (err) {
      console.warn("Ticketmaster ingest failed:", (err as any)?.message);
      perSource["ticketmaster.com"] = 0;
    }
  }

  // 2. All other sources (schema.org first, Gemini fallback).
  const sources = await gatherSources(db);
  for (const src of sources) {
    try {
      const events = await extractFromUrl(src, geminiKey);
      const provider = "Gemini";
      events.forEach((e) => normalized.push(normalizeEvent(e, src, provider)));
      perSource[hostOf(src)] = events.length;
    } catch (err) {
      console.warn(`Ingest failed for ${src}:`, (err as any)?.message);
      perSource[hostOf(src)] = 0;
    }
  }

  // 3. De-dupe by doc id (last write wins) and batch-write to Firestore.
  const byDoc = new Map<string, any>();
  normalized.forEach((n) => byDoc.set(n.doc, n.data));

  let written = 0;
  const entries = [...byDoc.entries()];
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const [docId, data] of entries.slice(i, i + 400)) {
      const ref = db.collection("events").doc(docId);
      batch.set(ref, { ...data, lastSeen: Date.now() }, { merge: true });
      written++;
    }
    await batch.commit();
  }

  const finishedAt = new Date().toISOString();
  const summary: IngestSummary = { ok: true, total: normalized.length, written, perSource, startedAt, finishedAt };
  try {
    await db.collection("meta").doc("ingest").set(summary, { merge: true });
  } catch (err) {
    console.warn("Could not write meta/ingest:", (err as any)?.message);
  }
  return summary;
}

export async function getLastIngestMeta(): Promise<any | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection("meta").doc("ingest").get();
    return doc.exists ? doc.data() : null;
  } catch (_) {
    return null;
  }
}
