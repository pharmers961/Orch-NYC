import { EventItem, EventCategory } from "../types";
import { CATEGORIES } from "./constants";

// ---------- URL helpers ----------
function safeGetHostname(url: string | undefined, defaultHost: string): string {
  if (!url) return defaultHost;
  try {
    let urlStr = url.trim();
    if (!/^(https?:)?\/\//i.test(urlStr)) urlStr = "https://" + urlStr;
    return new URL(urlStr).hostname.replace(/^www\./i, "");
  } catch (_) {
    return defaultHost;
  }
}

// Normalize a user-pasted URL: prepend https:// if missing, validate, strip trailing slash.
export function normalizeUrl(raw: string): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (!u.hostname.includes(".")) return null;
    return u.toString().replace(/\/+$/, "");
  } catch (_) {
    return null;
  }
}

export function hostOf(url: string): string {
  return safeGetHostname(url, url);
}

// ---------- Source label formatting ----------
const SOURCE_ACRONYMS: Record<string, string> = {
  ccclib: "CCC Library", ebparks: "East Bay Parks", serpapi: "SerpApi", ca: "CA",
};

function titleCaseWord(w: string): string {
  if (!w) return w;
  const low = w.toLowerCase();
  if (SOURCE_ACRONYMS[low]) return SOURCE_ACRONYMS[low];
  return w.charAt(0).toUpperCase() + w.slice(1);
}

// Turn a raw source token into a clean label with no TLD.
// "ticketmaster.com" -> "Ticketmaster", "google.com/events" -> "Google · Events",
// "wnyc.org" -> "WNYC". Already-human labels (with spaces) are passed through tidied.
export function formatSourceLabel(source: string): string {
  if (!source) return "Unknown";
  // Friendly labels (contain spaces) are already readable — just tidy capitalization.
  if (/\s/.test(source)) {
    return source.replace(/\b([a-z])/g, (m) => m.toUpperCase());
  }
  const [hostPartRaw, ...rest] = source.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/");
  const hostNoTld = hostPartRaw.replace(/\.[a-z]{2,}$/i, "");
  const hostLabel = hostNoTld.split(".").map(titleCaseWord).join(" ");
  const pathSeg = rest.find((s) => s.length > 0);
  return pathSeg ? `${hostLabel} · ${titleCaseWord(pathSeg)}` : hostLabel;
}

// ---------- Provenance (data reliability) ----------
export type ProviderTone = "official" | "web" | "manual";
export function providerMeta(ev: EventItem): { label: string; tone: ProviderTone } {
  switch (ev.provider) {
    case "Ticketmaster":
    case "City Feed":
    case "Recurring":
    case "Scraper":
      return { label: "Official", tone: "official" };
    case "Manual":
      return { label: "Added by you", tone: "manual" };
    case "Gemini":
    case "SerpApi":
    default:
      return { label: "Web", tone: "web" };
  }
}

// ---------- City / date helpers ----------
// Map an event's area/venue text to one of the covered cities (best-effort).
// Alamo counts as Danville; landmark venues resolve to their home city.
export function getCity(area: string, venue: string): string {
  const hay = `${area || ""} ${venue || ""}`.toLowerCase();
  if (/(walnut creek|lesher|lindsay wildlife|broadway plaza|civic park|heather farm|bedford gallery|borges ranch|shadelands|larkey|boundary oak)/.test(hay)) return "Walnut Creek";
  if (/(concord|todos santos|veranda|pixieland|sunvalley|hurricane harbor|markham)/.test(hay)) return "Concord";
  if (/(pleasant hill|diablo valley college|\bdvc\b)/.test(hay)) return "Pleasant Hill";
  if (/(danville|alamo|blackhawk|san ramon valley museum|village theatre)/.test(hay)) return "Danville";
  if (/lafayette/.test(hay)) return "Lafayette";
  if (/(moraga|saint mary's college|moraga commons)/.test(hay)) return "Moraga";
  if (/orinda/.test(hay)) return "Orinda";
  if (/(san ramon|bishop ranch|dougherty|forest home farms)/.test(hay)) return "San Ramon";
  if (/martinez/.test(hay)) return "Martinez";
  if (/clayton/.test(hay)) return "Clayton";
  return "Other";
}

// If a feed event's date is in the past (a scraper/AI year mistake), roll it forward
// to the next occurrence of that month/day so it isn't hidden.
export function rollStartForward(startIso: string): string {
  const d = new Date(startIso);
  if (isNaN(d.getTime())) return startIso;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (d.getTime() >= now.getTime()) return startIso;
  const cand = new Date(d);
  cand.setFullYear(now.getFullYear());
  if (cand.getTime() < now.getTime()) cand.setFullYear(now.getFullYear() + 1);
  return cand.toISOString();
}

// Local-timezone YYYY-MM-DD key so calendar cells match what the list view shows.
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------- Price helpers ----------
export function parseLowestNumericPrice(priceStr: string): number {
  const lower = priceStr.toLowerCase();
  if (lower.includes("tba") || lower.includes("free")) return 0;
  const cleaned = priceStr.replace(/[^0-9\-–]/g, "");
  const matches = cleaned.match(/\d+/g);
  if (!matches) return 99999;
  return Math.min(...matches.map((n) => parseInt(n, 10)));
}

// Presentation only — keep the stored price string canonical.
// "$45+" -> "from $45"; ranges / "Free" / fallbacks pass through unchanged.
export function formatPriceDisplay(price: string): string {
  const t = (price || "").trim();
  const m = /^\$(\d+)\+$/.exec(t);
  if (m) return `from $${m[1]}`;
  return t;
}

// ---------- Category helpers ----------
export function getEventImage(item: EventItem): string {
  if (item.image) return item.image;
  if (item.cat === "storytime") return "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)";
  if (item.cat === "crafts") return "linear-gradient(135deg, #c471f5 0%, #fa71cd 100%)";
  if (item.cat === "music") return "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)";
  if (item.cat === "shows") return "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)";
  if (item.cat === "nature") return "linear-gradient(135deg, #96e6a1 0%, #d4fc79 100%)";
  if (item.cat === "play") return "linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)";
  if (item.cat === "festivals") return "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)";
  return "linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)";
}

export function getCategoryEmoji(cat: EventCategory): string {
  return CATEGORIES.find((c) => c.id === cat)?.emoji || "✨";
}

export function getCategoryColor(cat: EventCategory): string {
  return CATEGORIES.find((c) => c.id === cat)?.color || "#0071e3";
}

// ---------- Ticket link resolution ----------
// Returns a safe target: a high-fidelity direct link when available, otherwise a
// Ticketmaster/Google search query — so links are never dead (important for scrapes).
export function resolveTicketTarget(ev: EventItem): { url: string; label: string } {
  const url = ev.ticketUrl;
  let qualityLink = false;
  try {
    const u = new URL(url);
    const pathSegments = u.pathname.split("/").filter((s) => s.length > 0);
    if (pathSegments.length >= 2) qualityLink = true;
  } catch (_) {
    // invalid/empty URL -> fall through to a search target
  }

  if (qualityLink) {
    return { url, label: `Opens ${new URL(url).hostname.replace(/^www\./, "")}` };
  }

  const dateObj = new Date(ev.start);
  const dateLabel = dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const fallbackQuery = encodeURIComponent(`${ev.title} ${ev.venue} tickets ${dateLabel}`);
  return { url: `https://www.google.com/search?q=${fallbackQuery}`, label: "Find listings via Google" };
}

// ---------- Calendar / ICS exports ----------
export async function shareEvent(ev: EventItem): Promise<void> {
  const textLabel = `Sprout Scout: ${ev.title} at ${ev.venue} (${ev.price})`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Sprout Scout", text: textLabel, url: ev.ticketUrl });
    } catch (_) {
      // user cancelled / share unavailable
    }
  } else {
    navigator.clipboard.writeText(`${textLabel} - Buy tickets: ${ev.ticketUrl}`);
    alert("Event details & links copied to clipboard!");
  }
}

export function googleCalendarUrl(ev: EventItem): string {
  const startStr = new Date(ev.start).toISOString().replace(/-|:|\.\d\d\d/g, "");
  const endDateObj = new Date(new Date(ev.start).getTime() + 2.5 * 60 * 60 * 1000);
  const endStr = endDateObj.toISOString().replace(/-|:|\.\d\d\d/g, "");
  const details = `${ev.desc || "Family event in the East Bay"} \n\nDetails: ${ev.ticketUrl}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${startStr}/${endStr}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(ev.venue + ", " + ev.area)}`;
}

function icsTime(d: Date): string {
  return d.toISOString().replace(/-|:|\.\d\d\d/g, "");
}

function vevent(ev: EventItem): string {
  const start = new Date(ev.start);
  const end = new Date(start.getTime() + 2.5 * 60 * 60 * 1000);
  return [
    "BEGIN:VEVENT",
    `UID:${ev.id}@sproutscout.app`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${ev.title.replace(/\n/g, " ")}`,
    `DESCRIPTION:${(ev.desc || "Family event in the East Bay").replace(/\n/g, "\\n")} \\n\\nDetails: ${ev.ticketUrl}`,
    `LOCATION:${ev.venue}, ${ev.area}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:Reminder: ${ev.title.replace(/\n/g, " ")}`,
    "END:VALARM",
    "END:VEVENT",
  ].join("\r\n");
}

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function downloadICS(ev: EventItem): void {
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SproutScout//EN", vevent(ev), "END:VCALENDAR"].join("\r\n");
  triggerDownload(`${ev.title.toLowerCase().replace(/[^a-z0-9]/g, "_")}.ics`, ics);
}

// Returns the number of events exported (0 means nothing to export).
export function downloadMultiICS(list: EventItem[], filename: string): number {
  if (list.length === 0) return 0;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SproutScout//EN", ...list.map(vevent), "END:VCALENDAR"].join("\r\n");
  triggerDownload(filename, ics);
  return list.length;
}
