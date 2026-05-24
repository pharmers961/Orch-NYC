import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Sparkles,
  Calendar,
  List as ListIcon,
  Search,
  Heart,
  MapPin,
  ExternalLink,
  CalendarPlus,
  Share2,
  Plus,
  X,
  Moon,
  Sun,
  Monitor,
  AlertCircle,
  Palette,
  CheckCircle2,
  SlidersHorizontal
} from "lucide-react";
import { EventItem, EventCategory } from "./types";

// Shared events are produced by the scheduled scraper (GitHub Actions) and
// published to the `data` branch as events.json. Override with VITE_EVENTS_URL.
const EVENTS_URL =
  (import.meta as any).env?.VITE_EVENTS_URL ||
  "https://raw.githubusercontent.com/pharmers961/Orch-NYC/data/events.json";

// Seed data as fallback? The brief says: "NO sample/fake fallback. Only real live events." 
// We will start with empty events and rely completely on fetches.

const CATEGORIES: { id: EventCategory; label: string; emoji: string; color: string }[] = [
  { id: "concerts", label: "Concerts", emoji: "🎤", color: "#0071e3" },
  { id: "broadway", label: "Broadway & Theater", emoji: "🎭", color: "#00a17a" },
  { id: "classical", label: "Classical & Opera", emoji: "🎻", color: "#5e5ce6" },
  { id: "sports", label: "Sports", emoji: "🏟️", color: "#ff9f0a" },
  { id: "other", label: "Other & Custom", emoji: "✨", color: "#8e8e93" },
];

const SEED_VENU_AREAS: Record<string, string> = {
  "Lincoln Center": "Upper West Side",
  "Metropolitan Opera House": "Upper West Side",
  "Carnegie Hall": "Midtown",
  "Madison Square Garden": "Midtown",
  "Barclays Center": "Brooklyn",
  "Radio City Music Hall": "Midtown",
  "Brooklyn Steel": "Williamsburg",
  "Yankee Stadium": "Bronx",
  "Citi Field": "Queens",
};

function safeGetHostname(url: string | undefined, defaultHost: string): string {
  if (!url) return defaultHost;
  try {
    let urlStr = url.trim();
    if (!/^(https?:)?\/\//i.test(urlStr)) {
      urlStr = "https://" + urlStr;
    }
    return new URL(urlStr).hostname.replace(/^www\./i, "");
  } catch (_) {
    return defaultHost;
  }
}

// Normalize a user-pasted URL: prepend https:// if missing, validate, strip trailing slash.
// Returns null if the input can't be a real URL.
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

export const NYC_BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

// Map an event's area/venue text to one of the five boroughs (best-effort).
export function getBorough(area: string, venue: string): string {
  const hay = `${area || ""} ${venue || ""}`.toLowerCase();
  if (/staten/.test(hay)) return "Staten Island";
  if (/(bronx|yankee)/.test(hay)) return "Bronx";
  if (/(brooklyn|williamsburg|bushwick|dumbo|barclays|\bbam\b|prospect|greenpoint|coney)/.test(hay)) return "Brooklyn";
  if (/(queens|astoria|flushing|citi field|forest hills|long island city|\blic\b)/.test(hay)) return "Queens";
  if (/(manhattan|midtown|upper west|upper east|harlem|village|soho|tribeca|chelsea|lincoln center|carnegie|madison square|radio city|times square|downtown)/.test(hay)) return "Manhattan";
  return "Other";
}

// Safety net: if a feed event's date is in the past (a scraper/AI year mistake),
// roll it forward to the next occurrence of that month/day so it isn't hidden.
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

export default function App() {
  // --- STATE ---
  const [events, setEvents] = useState<EventItem[]>(() => {
    const saved = localStorage.getItem("marquee_events");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Drop any previously-cached sample/seed events.
          return parsed.filter((e) => !String(e?.id).startsWith("seed_"));
        }
      } catch (_) {}
    }
    return [];
  });
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem("marquee_saved_ids");
    return saved ? JSON.parse(saved) : [];
  });
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    return (localStorage.getItem("marquee_theme") as "light" | "dark" | "system") || "system";
  });
  const [customVenueColors, setCustomVenueColors] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("marquee_venue_colors");
    return saved ? JSON.parse(saved) : {};
  });

  // Filters State
  const [hiddenSources, setHiddenSources] = useState<string[]>([]); // sources the user has hidden
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<EventCategory[]>(["concerts", "broadway", "classical", "sports", "other"]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "weekend" | "week" | "month" | "custom">("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "calendar" | "plan">("list");
  const [calendarView, setCalendarView] = useState<"month" | "week" | "agenda">("month");
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth()); // 0-indexed
  const [weekRef, setWeekRef] = useState(() => new Date()); // reference date for week view
  const [sortBy, setSortBy] = useState<"soonest" | "lowestPrice" | "recentlyAdded" | "endingSoon">("soonest");
  const [savedOnly, setSavedOnly] = useState(false);
  // Discovery filters
  const [selectedBoroughs, setSelectedBoroughs] = useState<string[]>([]);
  const [maxPrice, setMaxPrice] = useState<number>(0); // 0 = no cap
  const [freeOnly, setFreeOnly] = useState(false);

  // Status/Uis
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiSuccessNote, setApiSuccessNote] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(() => {
    const saved = localStorage.getItem("marquee_last_updated");
    return saved ? new Date(saved) : null;
  });

   // Modals state
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile drawer
  const [addEventOpen, setAddEventOpen] = useState(false); // Manual add-event modal
  const [dayAgendaKey, setDayAgendaKey] = useState<string | null>(null); // Calendar day popover (YYYY-MM-DD local)

  // Theme observer
  useEffect(() => {
    const root = window.document.documentElement;
    const updateTheme = () => {
      if (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };
    updateTheme();
    localStorage.setItem("marquee_theme", theme);

    if (theme === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = () => updateTheme();
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
  }, [theme]);

  // Persists events & saved state
  useEffect(() => {
    localStorage.setItem("marquee_events", JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    localStorage.setItem("marquee_saved_ids", JSON.stringify(savedIds));
  }, [savedIds]);

  useEffect(() => {
    localStorage.setItem("marquee_venue_colors", JSON.stringify(customVenueColors));
  }, [customVenueColors]);

  // Escape closes whichever overlay is open (accessibility).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedEventId) setSelectedEventId(null);
      else if (addEventOpen) setAddEventOpen(false);
      else if (dayAgendaKey) setDayAgendaKey(null);
      else if (sidebarOpen) setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedEventId, addEventOpen, dayAgendaKey, sidebarOpen]);

  // Persist primary view state to the URL so it survives reload and is shareable.
  useEffect(() => {
    const params = new URLSearchParams();
    if (viewMode !== "list") params.set("view", viewMode);
    if (sortBy !== "soonest") params.set("sort", sortBy);
    if (dateFilter !== "all") params.set("when", dateFilter);
    if (savedOnly) params.set("saved", "1");
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (selectedBoroughs.length) params.set("boroughs", selectedBoroughs.join(","));
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [viewMode, sortBy, dateFilter, savedOnly, searchQuery, selectedBoroughs]);

  // Read view state from the URL once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view");
    if (v === "calendar" || v === "plan" || v === "list") setViewMode(v);
    const s = params.get("sort");
    if (s === "endingSoon" || s === "lowestPrice" || s === "recentlyAdded" || s === "soonest") setSortBy(s);
    const w = params.get("when");
    if (w === "today" || w === "weekend" || w === "week" || w === "month" || w === "all") setDateFilter(w);
    if (params.get("saved") === "1") setSavedOnly(true);
    const q = params.get("q");
    if (q) setSearchQuery(q);
    const b = params.get("boroughs");
    if (b) setSelectedBoroughs(b.split(",").filter(Boolean));
  }, []);

  // Primary data path: fetch the shared events.json published by the scheduled
  // scraper (GitHub Actions). The browser no longer scrapes — all sourcing
  // happens server-side in the cron and lands in this feed.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(EVENTS_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`events.json ${res.status}`);
        const data = await res.json();
        const list: any[] = Array.isArray(data) ? data : data.events;
        if (!Array.isArray(list) || list.length === 0) throw new Error("empty events.json");

        const mapped: EventItem[] = list.map((x) => ({
          id: x.id || `feed_${Math.random().toString(36).slice(2, 9)}`,
          title: x.title || "Untitled Event",
          artist: x.artist || "",
          venue: x.venue || "NYC Venue",
          area: x.area || "New York",
          cat: x.cat || "other",
          price: x.price || "Check Site",
          start: rollStartForward(x.start),
          desc: x.desc || x.description || "",
          ticketUrl: x.ticketUrl || x.sourceUrl || "",
          image: x.image || "",
          status: x.status,
          source: x.source || "",
          provider: x.provider || "Gemini",
          added: Date.now(),
          tags: [],
        }));
        if (cancelled) return;
        mergeAndDeDuplicate(mapped);
        setLastUpdated(data.generatedAt ? new Date(data.generatedAt) : new Date());
      } catch (err: any) {
        console.warn("Could not load the events feed.", err?.message);
        if (!cancelled) setErrorMessage("Couldn't load the live events feed. It refreshes hourly — please try again shortly.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // --- NORMALIZE & DE-DUPLICATE ENGINE ---
  const mergeAndDeDuplicate = (newEvents: EventItem[]) => {
    setEvents((prevEvents) => {
      const allEvents = [...prevEvents];
      
      newEvents.forEach((newEvent) => {
        // Calculate deduplication key: (lowercased title with filler words like the/a/tour/live/vs/at/nyc removed) + (YYYY-MM-DD date)
        const dateStr = newEvent.start.split("T")[0];
        const normalizedTitle = newEvent.title
          .toLowerCase()
          .replace(/\b(the|a|an|presents|tour|live|vs|at|nyc|show|concert)\b/g, "")
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 18);
        const dupKey = `${normalizedTitle}_${dateStr}`;

        const existingIdx = allEvents.findIndex((e) => {
          const eDate = e.start.split("T")[0];
          const eTitle = e.title
            .toLowerCase()
            .replace(/\b(the|a|an|presents|tour|live|vs|at|nyc|show|concert)\b/g, "")
            .replace(/[^a-z0-9]/g, "")
            .slice(0, 18);
          return `${eTitle}_${eDate}` === dupKey || e.id === newEvent.id;
        });

        if (existingIdx > -1) {
          const existing = allEvents[existingIdx];
          // Keep the "richer" one: prefer Ticketmaster, one with a description, or higher priced data
          const existingScore = (existing.provider === "Ticketmaster" ? 2 : 0) + (existing.desc ? 1 : 0) + (existing.image ? 1 : 0);
          const newScore = (newEvent.provider === "Ticketmaster" ? 2 : 0) + (newEvent.desc ? 1 : 0) + (newEvent.image ? 1 : 0);
          if (newScore > existingScore) {
            allEvents[existingIdx] = { ...existing, ...newEvent };
          }
        } else {
          allEvents.push(newEvent);
        }
      });

      return allEvents;
    });
  };

  // Manually add an event the user types in (for pages that can't be scraped).
  const addManualEvent = (data: {
    title: string; venue: string; date: string; time: string; price: string;
    cat: EventCategory; ticketUrl: string; desc: string; artist: string;
  }) => {
    if (!data.title.trim() || !data.date) {
      setErrorMessage("A manual event needs at least a title and a date.");
      return;
    }
    const ticket = normalizeUrl(data.ticketUrl) || "";
    const ev: EventItem = {
      id: `manual_${Math.random().toString(36).substring(2, 9)}`,
      title: data.title.trim(),
      artist: data.artist.trim(),
      venue: data.venue.trim() || "NYC Venue",
      area: SEED_VENU_AREAS[data.venue.trim()] || "New York",
      cat: data.cat,
      price: data.price.trim() || "Check Site",
      start: `${data.date}T${data.time || "19:00"}:00Z`,
      desc: data.desc.trim(),
      ticketUrl: ticket,
      image: "",
      source: ticket ? hostOf(ticket) : "manual",
      provider: "Manual",
      added: Date.now(),
      tags: ["manual"],
    };
    mergeAndDeDuplicate([ev]);
    setApiSuccessNote(`Added "${ev.title}" to your calendar.`);
    setAddEventOpen(false);
  };

  // --- DERIVED METRICS / FILTER ENGINE ---
  const activeSources = useMemo(() => {
    return [...new Set(events.map((e) => e.source).filter(Boolean))];
  }, [events]);

  const activeVenues = useMemo(() => {
    const list = events.map((e) => e.venue);
    return [...new Set(list)].sort();
  }, [events]);

  const venueStats = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => {
      counts[e.venue] = (counts[e.venue] || 0) + 1;
    });
    return counts;
  }, [events]);

  const sourceStats = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => {
      counts[e.source] = (counts[e.source] || 0) + 1;
    });
    return counts;
  }, [events]);

  const activeTags = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => {
      if (e.tags) {
        e.tags.forEach((t) => {
          counts[t] = (counts[t] || 0) + 1;
        });
      }
    });
    return counts;
  }, [events]);

  // Combined Filters Logic
  const filteredEventsList = useMemo(() => {
    return events
      .filter((e) => {
        // Categories Filter
        if (!selectedCategories.includes(e.cat)) return false;

        // Sources Filter
        if (hiddenSources.includes(e.source)) return false;

        // Venues Filter
        if (selectedVenues.length > 0 && !selectedVenues.includes(e.venue)) return false;

        // Borough Filter
        if (selectedBoroughs.length > 0 && !selectedBoroughs.includes(getBorough(e.area, e.venue))) return false;

        // Price Filters
        const isFree = /free/i.test(e.price) || parseLowestNumericPrice(e.price) === 0;
        if (freeOnly && !isFree) return false;
        if (maxPrice > 0) {
          const low = parseLowestNumericPrice(e.price);
          if (low !== 99999 && low > maxPrice) return false;
        }

        // Saved Filter
        if (savedOnly && !savedIds.includes(e.id)) return false;

        // Tags Filter
        if (selectedTags.length > 0) {
          const evTags = e.tags || [];
          if (!evTags.some((t) => selectedTags.includes(t))) return false;
        }

        // Search Filter
        if (searchQuery.trim() !== "") {
          const q = searchQuery.toLowerCase();
          const matchTitle = e.title.toLowerCase().includes(q);
          const matchArtist = e.artist.toLowerCase().includes(q);
          const matchVenue = e.venue.toLowerCase().includes(q);
          const matchDesc = e.desc ? e.desc.toLowerCase().includes(q) : false;
          if (!matchTitle && !matchArtist && !matchVenue && !matchDesc) return false;
        }

        // Date Period Filter (only applied in list/plan view, not the calendar grid)
        if (viewMode === "list" || viewMode === "plan") {
          const evDate = new Date(e.start);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          if (dateFilter === "today") {
            const endOfToday = new Date(today);
            endOfToday.setHours(23, 59, 59, 999);
            if (evDate < today || evDate > endOfToday) return false;
          } else if (dateFilter === "weekend") {
            // Friday, Saturday, Sunday
            const currentDay = today.getDay(); // 0 is Sunday, 5 is Friday
            const fri = new Date(today);
            fri.setDate(today.getDate() + (5 - currentDay));
            const sun = new Date(today);
            sun.setDate(today.getDate() + (7 - currentDay));
            sun.setHours(23, 59, 59, 999);
            if (evDate < fri || evDate > sun) return false;
          } else if (dateFilter === "week") {
            // Next 7 days
            const sevenDaysLater = new Date(today);
            sevenDaysLater.setDate(today.getDate() + 7);
            sevenDaysLater.setHours(23, 59, 59, 999);
            if (evDate < today || evDate > sevenDaysLater) return false;
          } else if (dateFilter === "month") {
            // Next 30 days
            const thirtyDaysLater = new Date(today);
            thirtyDaysLater.setDate(today.getDate() + 30);
            thirtyDaysLater.setHours(23, 59, 59, 999);
            if (evDate < today || evDate > thirtyDaysLater) return false;
          } else if (dateFilter === "custom") {
            // User-chosen start/end (either bound optional). Shows past events too if asked.
            if (customStart) {
              const start = new Date(`${customStart}T00:00:00`);
              if (evDate < start) return false;
            }
            if (customEnd) {
              const end = new Date(`${customEnd}T23:59:59`);
              if (evDate > end) return false;
            }
            if (!customStart && !customEnd && evDate < today) return false;
          } else {
            // All upcoming (filter out past events)
            if (evDate < today) return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        // Sort engine
        if (sortBy === "soonest") {
          return new Date(a.start).getTime() - new Date(b.start).getTime();
        }
        if (sortBy === "recentlyAdded") {
          return b.added - a.added;
        }
        if (sortBy === "lowestPrice") {
          const priceA = parseLowestNumericPrice(a.price);
          const priceB = parseLowestNumericPrice(b.price);
          return priceA - priceB;
        }
        if (sortBy === "endingSoon") {
          // Soonest upcoming first, treating past as far away
          const now = Date.now();
          const ta = new Date(a.start).getTime();
          const tb = new Date(b.start).getTime();
          const da = ta < now ? Infinity : ta;
          const db = tb < now ? Infinity : tb;
          return da - db;
        }
        return 0;
      });
  }, [events, selectedCategories, hiddenSources, selectedVenues, selectedBoroughs, maxPrice, freeOnly, savedOnly, savedIds, searchQuery, dateFilter, customStart, customEnd, sortBy, selectedTags, viewMode]);

  function parseLowestNumericPrice(priceStr: string): number {
    if (priceStr.toLowerCase().includes("tba") || priceStr.toLowerCase().includes("free")) return 0;
    const cleaned = priceStr.replace(/[^0-9\-–]/g, ""); // isolate numbers and separators
    const matches = cleaned.match(/\d+/g);
    if (!matches) return 99999; // fallback high number for sorting
    const numbers = matches.map(n => parseInt(n, 10));
    return Math.min(...numbers);
  }

  // Live stat summaries
  const stats = useMemo(() => {
    const totalCount = filteredEventsList.length;
    const uniqueVenues = new Set(filteredEventsList.map((e) => e.venue)).size;
    const uniqueSources = new Set(filteredEventsList.map((e) => e.source)).size;
    return { events: totalCount, venues: uniqueVenues, sources: uniqueSources };
  }, [filteredEventsList]);

  // --- BUTTON INTERACTIONS & EXPORTS ---
  const toggleSave = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSavedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((existingId) => existingId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleAddTag = (eventId: string, newTag: string) => {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id === eventId) {
          const currentTags = e.tags || [];
          if (currentTags.includes(trimmed)) return e;
          return { ...e, tags: [...currentTags, trimmed] };
        }
        return e;
      })
    );
    setTagInput("");
  };

  const handleRemoveTag = (eventId: string, tagToRemove: string) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id === eventId) {
          const currentTags = e.tags || [];
          return { ...e, tags: currentTags.filter((t) => t !== tagToRemove) };
        }
        return e;
      })
    );
  };

  // Toggle a source's visibility (checked = visible; unchecking hides it).
  const handleSourceCheckbox = (source: string) => {
    setHiddenSources((prev) => {
      if (prev.includes(source)) return prev.filter((s) => s !== source);
      return [...prev, source];
    });
  };

  // "Only": show just this source by hiding every other active source.
  const isolateSourceOnly = (source: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHiddenSources(activeSources.filter((s) => s !== source));
  };

  const handleVenueCheckbox = (venue: string) => {
    setSelectedVenues((prev) => {
      if (prev.includes(venue)) return prev.filter((v) => v !== venue);
      return [...prev, venue];
    });
  };

  const handleCategoryCheckbox = (cat: EventCategory) => {
    setSelectedCategories((prev) => {
      if (prev.includes(cat)) return prev.filter((c) => c !== cat);
      return [...prev, cat];
    });
  };

  // Helper to resolve fallback emojis and gradient backgrounds for models mapped from Google grounded Search (which don't have default images)
  const getEventImage = (item: EventItem) => {
    if (item.image) return item.image;
    // Category specific elegant gradient backdrops code
    if (item.cat === "classical") return "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)";
    if (item.cat === "broadway") return "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)";
    if (item.cat === "sports") return "linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)";
    return "linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)";
  };

  const getCategoryEmoji = (cat: EventCategory) => {
    return CATEGORIES.find((c) => c.id === cat)?.emoji || "✨";
  };

  const getCategoryColor = (cat: EventCategory) => {
    return CATEGORIES.find((c) => c.id === cat)?.color || "#0071e3";
  };

  // Ticket Link Resolution Formula
  const resolvedTicketTarget = useMemo(() => {
    if (!selectedEventId) return null;
    const ev = events.find((e) => e.id === selectedEventId);
    if (!ev) return null;

    // Check if the URL is high fidelity (has a path >= 2 segments deep)
    const url = ev.ticketUrl;
    let qualityLink = false;
    try {
      const u = new URL(url);
      const pathname = u.pathname;
      const pathSegments = pathname.split("/").filter((s) => s.length > 0);
      if (pathSegments.length >= 2) {
        qualityLink = true;
      }
    } catch (_) {
      // standard invalid URL
    }

    if (qualityLink) {
      return {
        url,
        label: `Directly opens ${new URL(url).hostname.replace("www.", "")}`,
      };
    }

    // Huge arenas logic for sports/concerts search query helper
    const lowerVenue = ev.venue.toLowerCase();
    const isArena =
      lowerVenue.includes("madison square garden") ||
      lowerVenue.includes("barclays center") ||
      lowerVenue.includes("radio city music hall") ||
      lowerVenue.includes("brooklyn steel");

    if (isArena && (ev.cat === "concerts" || ev.cat === "sports")) {
      const query = encodeURIComponent(`${ev.artist || ev.title} ${ev.venue}`);
      return {
        url: `https://www.ticketmaster.com/search?q=${query}`,
        label: "Resolving safe purchase via Ticketmaster",
      };
    }

    // Google query fallback
    const dateObj = new Date(ev.start);
    const dateLabel = dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const fallbackQuery = encodeURIComponent(`${ev.title} ${ev.venue} tickets ${dateLabel}`);
    return {
      url: `https://www.google.com/search?q=${fallbackQuery}`,
      label: "Find verified reseller listings via Google Search",
    };
  }, [selectedEventId, events]);

  // Calendar exports helper
  const googleCalendarUrl = (ev: EventItem) => {
    const startStr = new Date(ev.start).toISOString().replace(/-|:|\.\d\d\d/g, "");
    // end date is start date plus 2.5 hours default representation
    const endDateObj = new Date(new Date(ev.start).getTime() + 2.5 * 60 * 60 * 1000);
    const endStr = endDateObj.toISOString().replace(/-|:|\.\d\d\d/g, "");
    const details = `${ev.desc || "NYC Live Event"} \n\nDirect tickets: ${ev.ticketUrl}`;
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${startStr}/${endStr}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(ev.venue + ", " + ev.area)}`;
  };

  const handleDownloadICS = (ev: EventItem) => {
    const startStr = new Date(ev.start).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const endDateObj = new Date(new Date(ev.start).getTime() + 2.5 * 60 * 60 * 1000);
    const endStr = endDateObj.toISOString().replace(/-|:|\.\d\d\d/g, "");

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Marquee NYC Live//EN",
      "BEGIN:VEVENT",
      `UID:${ev.id}@marqueeny.live`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:${ev.title}`,
      `DESCRIPTION:${(ev.desc || "Live nyc performance").replace(/\n/g, "\\n")} \\n\\nTicket Booking: ${ev.ticketUrl}`,
      `LOCATION:${ev.venue}, ${ev.area}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT1H",
      "ACTION:DISPLAY",
      `DESCRIPTION:Reminder: ${ev.title}`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${ev.title.toLowerCase().replace(/[^a-z0-9]/g, "_")}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShareEvent = async (ev: EventItem) => {
    const textLabel = `Orch: ${ev.title} at ${ev.venue} (${ev.price})`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Orch",
          text: textLabel,
          url: ev.ticketUrl,
        });
      } catch (err) {
        console.log("Error sharing", err);
      }
    } else {
      navigator.clipboard.writeText(`${textLabel} - Buy tickets: ${ev.ticketUrl}`);
      alert("Event details & links copied successfully onto clipboard!");
    }
  };

  // --- CALENDAR GRID PROCESSORS ---
  const calendarData = useMemo(() => {
    const today = new Date();
    const year = calendarYear;
    const month = calendarMonth;

    // First day of current month representation
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay(); // index 0 is Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const calendarCells: { dateNum: number | null; events: EventItem[]; isToday: boolean }[] = [];

    // Padding empty cells before the month starts
    for (let i = 0; i < startOffset; i++) {
      calendarCells.push({ dateNum: null, events: [], isToday: false });
    }

    // Populate actual days (match on LOCAL date so events land on the day shown in the list view)
    for (let d = 1; d <= daysInMonth; d++) {
      const cellKey = localDateKey(new Date(year, month, d));
      const matchedEvents = filteredEventsList
        .filter((e) => localDateKey(new Date(e.start)) === cellKey)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      calendarCells.push({
        dateNum: d,
        events: matchedEvents,
        isToday: today.getDate() === d && today.getMonth() === month && today.getFullYear() === year,
      });
    }

    const monthLabel = new Date(year, month).toLocaleString("default", { month: "long", year: "numeric" });
    return { monthLabel, cells: calendarCells };
  }, [filteredEventsList, calendarYear, calendarMonth]);

  // Index filtered events by local date key (for the day-agenda popover & week view).
  const eventsByLocalDate = useMemo(() => {
    const map: Record<string, EventItem[]> = {};
    filteredEventsList.forEach((e) => {
      const key = localDateKey(new Date(e.start));
      (map[key] = map[key] || []).push(e);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
    return map;
  }, [filteredEventsList]);

  // Week view: 7 days starting Sunday of the week containing weekRef.
  const weekData = useMemo(() => {
    const start = new Date(weekRef);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = localDateKey(d);
      return { date: d, key, events: eventsByLocalDate[key] || [], isToday: key === localDateKey(new Date()) };
    });
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const label = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    return { days, label };
  }, [weekRef, eventsByLocalDate]);

  // Agenda view: upcoming events grouped by local date.
  const agendaGroups = useMemo(() => {
    const groups: { key: string; date: Date; events: EventItem[] }[] = [];
    const sorted = [...filteredEventsList].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const byKey: Record<string, EventItem[]> = {};
    sorted.forEach((e) => {
      const key = localDateKey(new Date(e.start));
      (byKey[key] = byKey[key] || []).push(e);
    });
    Object.keys(byKey).sort().forEach((key) => {
      groups.push({ key, date: new Date(`${key}T12:00:00`), events: byKey[key] });
    });
    return groups;
  }, [filteredEventsList]);

  // Build a multi-event .ics file and download it (bulk calendar export).
  const downloadMultiICS = (list: EventItem[], filename: string) => {
    if (list.length === 0) {
      setErrorMessage("No events to export with the current filters.");
      return;
    }
    const fmt = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, "");
    const vevents = list.map((ev) => {
      const start = new Date(ev.start);
      const end = new Date(start.getTime() + 2.5 * 60 * 60 * 1000);
      return [
        "BEGIN:VEVENT",
        `UID:${ev.id}@orch.live`,
        `DTSTART:${fmt(start)}`,
        `DTEND:${fmt(end)}`,
        `SUMMARY:${ev.title.replace(/\n/g, " ")}`,
        `DESCRIPTION:${(ev.desc || "Live NYC event").replace(/\n/g, "\\n")} \\n\\nTickets: ${ev.ticketUrl}`,
        `LOCATION:${ev.venue}, ${ev.area}`,
        "BEGIN:VALARM",
        "TRIGGER:-PT1H",
        "ACTION:DISPLAY",
        `DESCRIPTION:Reminder: ${ev.title.replace(/\n/g, " ")}`,
        "END:VALARM",
        "END:VEVENT",
      ].join("\r\n");
    });
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Orch NYC//EN", ...vevents, "END:VCALENDAR"].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setApiSuccessNote(`Exported ${list.length} event(s) to ${filename}.`);
  };

  // Trap focus inside modal on launch
  const activeEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return events.find((e) => e.id === selectedEventId) || null;
  }, [selectedEventId, events]);

  // Saved events as a chronological itinerary ("My Plan"), grouped by date with overlap detection.
  const planGroups = useMemo(() => {
    const saved = events
      .filter((e) => savedIds.includes(e.id))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const byKey: Record<string, EventItem[]> = {};
    saved.forEach((e) => {
      const key = localDateKey(new Date(e.start));
      (byKey[key] = byKey[key] || []).push(e);
    });
    return Object.keys(byKey).sort().map((key) => {
      const list = byKey[key];
      // Mark overlaps (events within 2.5h windows of each other on the same day)
      const overlaps = new Set<string>();
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const s1 = new Date(list[i].start).getTime();
          const s2 = new Date(list[j].start).getTime();
          if (Math.abs(s1 - s2) < 2.5 * 60 * 60 * 1000) {
            overlaps.add(list[i].id);
            overlaps.add(list[j].id);
          }
        }
      }
      return { key, date: new Date(`${key}T12:00:00`), events: list, overlaps };
    });
  }, [events, savedIds]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#000000] text-slate-900 dark:text-zinc-100 transition-colors duration-300 flex flex-col antialiased">
      {/* Top loading indicator while the feed loads */}
      {loading && (
        <div className="fixed top-0 left-0 right-0 h-1 z-[110] bg-gradient-to-r from-blue-500 to-indigo-600 animate-pulse" />
      )}

      {/* STICKY GLASS NAVIGATION BAR */}
      <nav id="glass-nav" className="sticky top-0 z-50 h-14 flex items-center justify-between px-6 bg-white/70 dark:bg-black/70 backdrop-blur-xl border-b border-black/10 dark:border-zinc-800/60 font-sans">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0071e3] to-[#5e5ce6] flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-lg leading-none font-display">O</span>
          </div>
          <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-slate-900 via-slate-750 to-indigo-900 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">
            Orch
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick theme toggler */}
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light")}
            className="p-2 text-slate-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all"
            title="Toggle theme (Light / Dark / System)"
            id="theme-toggle"
          >
            {theme === "light" ? <Sun size={18} /> : theme === "dark" ? <Moon size={18} /> : <Monitor size={18} />}
          </button>

          {/* Add a one-off event by hand (client-side) */}
          <button
            onClick={() => setAddEventOpen(true)}
            className="flex px-3 sm:px-4 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] transition-all text-xs font-semibold rounded-full items-center gap-1.5 shadow-sm"
            id="add-event-btn"
            title="Add an event to your calendar"
          >
            <Plus size={13} />
            <span className="hidden sm:inline">Add event</span>
          </button>

          {/* Mobile floating layouts toggler */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 text-slate-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"
            id="filter-drawer-toggle"
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto w-full px-6 flex-1 flex flex-col md:grid md:grid-cols-[260px_1fr] lg:grid-cols-[280px_1fr] gap-8 pb-16">
        {/* HERO HEADER */}
        <header className="col-span-full pt-8 pb-4 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-widest font-mono">
                Orch v3
              </span>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 rounded-full">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full pulse-dot animate-pulse"></div>
                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-mono">
                  Live Feed
                </span>
              </div>
            </div>
            <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight mb-2 text-slate-900 dark:text-white font-display">
              Everything happening <br className="hidden sm:inline" />
              in New York.
            </h1>
            <p className="text-slate-500 dark:text-zinc-400 text-sm max-w-lg">
              Live events fully aggregated from Ticketmaster, live Google Searches (via SerpApi/Gemini), and custom local sources in a unified, interactive custom calendar.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500 dark:text-zinc-400">
            <div className="bg-white dark:bg-zinc-950 px-3 py-1.5 rounded-lg border border-slate-200/60 dark:border-zinc-800">
              <span className="text-slate-900 dark:text-white font-bold">{stats.events}</span> Events listed
            </div>
            <div className="bg-white dark:bg-zinc-950 px-3 py-1.5 rounded-lg border border-slate-200/60 dark:border-zinc-800">
              <span className="text-slate-900 dark:text-white font-bold">{stats.venues}</span> Venues
            </div>
            <div className="bg-white dark:bg-zinc-950 px-3 py-1.5 rounded-lg border border-slate-200/60 dark:border-zinc-800">
              <span className="text-slate-900 dark:text-white font-bold">{stats.sources}</span> Sources
            </div>
          </div>
        </header>

        {/* FEED status banners */}
        {errorMessage && (
          <div className="col-span-full p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-red-500 text-xs flex items-center gap-3">
            <AlertCircle size={16} className="shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">{errorMessage}</p>
            </div>
            <button onClick={() => setErrorMessage(null)} className="p-1 hover:bg-red-500/10 rounded">
              <X size={14} />
            </button>
          </div>
        )}

        {apiSuccessNote && (
          <div className="col-span-full p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-3 animate-fade-in">
            <CheckCircle2 size={16} className="shrink-0" />
            <p className="flex-1 font-medium">{apiSuccessNote}</p>
            <button onClick={() => setApiSuccessNote(null)} className="p-1 hover:bg-emerald-500/10 rounded">
              <X size={14} />
            </button>
          </div>
        )}

        {/* STICKY TOOLBAR PANEL FOR ACTIVE CONTROLS */}
        <section className="col-span-full sticky top-[57px] z-40 bg-slate-50/80 dark:bg-black/80 backdrop-blur-xl py-3 border-b border-slate-200/60 dark:border-zinc-800/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Quick Date chips */}
          <div className="flex flex-wrap items-center gap-1.5" id="date-chips">
            <button
              onClick={() => { setDateFilter("all"); setSavedOnly(false); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
                dateFilter === "all" && !savedOnly
                  ? "bg-slate-900 text-white dark:bg-zinc-100 dark:text-black"
                  : "bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900"
              }`}
            >
              All upcoming
            </button>
            <button
              onClick={() => { setDateFilter("today"); setSavedOnly(false); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
                dateFilter === "today" && !savedOnly
                  ? "bg-slate-900 text-white dark:bg-zinc-100 dark:text-black"
                  : "bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => { setDateFilter("weekend"); setSavedOnly(false); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
                dateFilter === "weekend" && !savedOnly
                  ? "bg-slate-900 text-white dark:bg-zinc-100 dark:text-black"
                  : "bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900"
              }`}
            >
              This weekend
            </button>
            <button
              onClick={() => { setDateFilter("week"); setSavedOnly(false); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
                dateFilter === "week" && !savedOnly
                  ? "bg-slate-900 text-white dark:bg-zinc-100 dark:text-black"
                  : "bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900"
              }`}
            >
              This week
            </button>
            <button
              onClick={() => { setDateFilter("month"); setSavedOnly(false); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
                dateFilter === "month" && !savedOnly
                  ? "bg-slate-900 text-white dark:bg-zinc-100 dark:text-black"
                  : "bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900"
              }`}
            >
              This month
            </button>
            <button
              onClick={() => { setDateFilter("custom"); setSavedOnly(false); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
                dateFilter === "custom" && !savedOnly
                  ? "bg-slate-900 text-white dark:bg-zinc-100 dark:text-black"
                  : "bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900"
              }`}
            >
              Custom range
            </button>

            {dateFilter === "custom" && (
              <div className="flex items-center gap-1.5 pl-1">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  aria-label="Start date"
                />
                <span className="text-slate-400 text-xs">→</span>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart || undefined}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  aria-label="End date"
                />
                {(customStart || customEnd) && (
                  <button
                    onClick={() => { setCustomStart(""); setCustomEnd(""); }}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 p-1"
                    title="Clear range"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            <div className="w-px h-6 bg-slate-200 dark:bg-zinc-800 mx-1"></div>

            <button
              onClick={() => setSavedOnly(!savedOnly)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 ${
                savedOnly
                  ? "bg-[#ff3b30] text-white"
                  : "bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900 text-[#ff3b30]"
              }`}
            >
              <Heart size={12} fill={savedOnly ? "currentColor" : "none"} />
              Saved <span className="opacity-80">({savedIds.length})</span>
            </button>
          </div>

          {/* Quick search & Visual Toggles */}
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <div className="relative flex-1 sm:flex-initial">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search artists, sports, venues..."
                className="w-full sm:w-60 pl-8 pr-7 py-2 bg-white/60 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 rounded-full text-xs focus:outline-none focus:ring-1 focus:ring-slate-500 dark:focus:ring-zinc-500"
              />
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Sort Options */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1.5 rounded-full border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-slate-700 dark:text-zinc-300 focus:outline-none"
            >
              <option value="soonest">Soonest</option>
              <option value="endingSoon">Ending soon</option>
              <option value="lowestPrice">Lowest price</option>
              <option value="recentlyAdded">Recently added</option>
            </select>

            {/* Bulk export to calendar */}
            <button
              onClick={() => downloadMultiICS(filteredEventsList, "orch-nyc-events.ics")}
              className="p-1.5 rounded-full border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-all"
              title="Export all visible events to your calendar (.ics)"
            >
              <CalendarPlus size={14} />
            </button>

            {/* List / Calendar / Plan toggle */}
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-zinc-800 p-0.5 bg-slate-100 dark:bg-zinc-900">
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === "list" ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white" : "text-slate-500"
                }`}
                title="List View"
                aria-label="List view"
              >
                <ListIcon size={14} />
              </button>
              <button
                onClick={() => setViewMode("calendar")}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === "calendar" ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white" : "text-slate-500"
                }`}
                title="Calendar View"
                aria-label="Calendar view"
              >
                <Calendar size={14} />
              </button>
              <button
                onClick={() => setViewMode("plan")}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === "plan" ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white" : "text-slate-500"
                }`}
                title="My Plan (saved itinerary)"
                aria-label="My plan"
              >
                <Heart size={14} />
              </button>
            </div>
          </div>
        </section>

        {/* --- LEFT SIDEBAR / MOBILE DRAWER PANEL --- */}
        <aside
          className={`lg:block shrink-0 ${
            sidebarOpen
              ? "fixed inset-0 z-55 bg-white dark:bg-zinc-950 p-6 overflow-y-auto block"
              : "hidden"
          } space-y-6 lg:bg-white/40 lg:dark:bg-zinc-950/40 lg:backdrop-blur-md lg:border-r lg:border-black/5 lg:dark:border-white/5 lg:p-6 lg:rounded-2xl lg:h-fit`}
        >
          {/* Mobile drawer header */}
          <div className="flex items-center justify-between lg:hidden mb-4 border-b border-slate-200 dark:border-zinc-800 pb-3">
            <span className="font-extrabold text-sm uppercase text-slate-500 font-mono tracking-widest">Filters</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-full"
            >
              <X size={18} />
            </button>
          </div>

          {/* Categories select checklist */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
              Categories
            </h3>
            <div className="space-y-2">
              {CATEGORIES.map((cat) => {
                const count = events.filter((e) => e.cat === cat.id).length;
                return (
                  <label
                    key={cat.id}
                    className="flex items-center justify-between text-xs group cursor-pointer text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(cat.id)}
                        onChange={() => handleCategoryCheckbox(cat.id)}
                        className="w-4 h-4 rounded border-slate-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                        style={{ accentColor: cat.color }}
                      />
                      <span>
                        {cat.emoji} {cat.label}
                      </span>
                    </div>
                    <span className="text-[9px] bg-slate-200/50 dark:bg-zinc-800 px-2 py-0.5 rounded-full font-semibold">
                      {count}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Borough filter */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Borough</h3>
              {selectedBoroughs.length > 0 && (
                <button onClick={() => setSelectedBoroughs([])} className="text-[9px] text-indigo-600 dark:text-[#5e5ce6] font-semibold hover:underline">Clear</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {NYC_BOROUGHS.map((b) => {
                const active = selectedBoroughs.includes(b);
                return (
                  <button
                    key={b}
                    onClick={() => setSelectedBoroughs((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b])}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-indigo-400"}`}
                  >
                    {b}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price filter */}
          <div className="space-y-2.5 pt-2">
            <h3 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Price</h3>
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-300 dark:border-zinc-700" />
              Free events only
            </label>
            <div className={freeOnly ? "opacity-40 pointer-events-none" : ""}>
              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 mb-1">
                <span>Max price</span>
                <span className="font-mono font-bold">{maxPrice === 0 ? "Any" : `$${maxPrice}`}</span>
              </div>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={maxPrice}
                onChange={(e) => setMaxPrice(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600"
              />
            </div>
          </div>

          {/* Sources Filter Section (always visible so users can select and query custom APIs) */}
          {activeSources.length >= 1 && (
            <div className="space-y-3 pt-2 font-sans">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
                  Sources
                </h3>
                {hiddenSources.length > 0 && (
                  <button
                    onClick={() => setHiddenSources([])}
                    className="text-[9px] text-indigo-600 dark:text-[#5e5ce6] font-semibold hover:underline"
                  >
                    Show all
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {activeSources.map((source) => {
                  const sCount = sourceStats[source] || 0;
                  
                  // Aesthetic Labeling & Icons
                  let label = source;
                  let icon = "🌐";
                  if (source === "ticketmaster.com") {
                    label = "ticketmaster.com";
                    icon = "🎫";
                  } else if (source === "google.com/events") {
                    label = "google.com/events";
                    icon = "🔍";
                  } else if (source === "wnyc.org") {
                    label = "wnyc.org";
                    icon = "📻";
                  }

                  return (
                    <div
                      key={source}
                      onClick={() => handleSourceCheckbox(source)}
                      className="flex items-center justify-between text-xs group cursor-pointer text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!hiddenSources.includes(source)}
                          onChange={() => {}} // toggled on container tap
                          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-zinc-700"
                        />
                        <span className="truncate max-w-[130px] font-mono text-[11px] flex items-center gap-1.5">
                          <span>{icon}</span>
                          <span>{label}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] bg-slate-200/50 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
                          {sCount}
                        </span>
                        <button
                          onClick={(e) => isolateSourceOnly(source, e)}
                          className="text-[9px] text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 font-semibold pl-1.5"
                        >
                          Only
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Venues dynamic checkbox selections option with personalized colors */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
                Venues
              </h3>
              {selectedVenues.length > 0 && (
                <button
                  onClick={() => setSelectedVenues([])}
                  className="text-[9px] text-indigo-600 dark:text-[#5e5ce6] font-semibold hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {activeVenues.map((venue) => {
                const count = venueStats[venue] || 0;
                const vColor = customVenueColors[venue] || null;
                return (
                  <div
                    key={venue}
                    onClick={() => handleVenueCheckbox(venue)}
                    className="flex items-center justify-between text-xs group cursor-pointer text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <input
                        type="checkbox"
                        checked={selectedVenues.includes(venue)}
                        onChange={() => {}} // Toggled by container click
                        className="w-3.5 h-3.5 rounded border-slate-300 dark:border-zinc-700"
                      />
                      {vColor && (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: vColor }}
                        />
                      )}
                      <span className="truncate">{venue}</span>
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono">({count})</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom Tags Filter Section */}
          {Object.keys(activeTags).length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
                  Custom Tags
                </h3>
                {selectedTags.length > 0 && (
                  <button
                    onClick={() => setSelectedTags([])}
                    className="text-[9px] text-indigo-600 dark:text-[#5e5ce6] font-semibold hover:underline"
                  >
                    Clear tags
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {Object.entries(activeTags).map(([tag, count]) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => {
                        setSelectedTags((prev) =>
                          prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                        );
                      }}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all flex items-center gap-1 border cursor-pointer ${
                        isSelected
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                          : "bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <span>#{tag}</span>
                      <span className={`text-[8px] opacity-80 ${isSelected ? "text-slate-white" : "text-slate-450 dark:text-zinc-500"}`}>
                        ({count})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-4 mt-auto">
            <div className="p-4 rounded-xl bg-gradient-to-br from-[#0071e3] to-[#5e5ce6] text-white shadow-md">
              <span className="text-[9px] font-bold uppercase tracking-wider opacity-90">
                PRO TIP
              </span>
              <p className="text-xs font-semibold leading-relaxed mt-1">
                Pin your favorite events. They are cached locally so they survive reload sessions.
              </p>
            </div>
          </div>
        </aside>

        {/* --- MAIN CONTENT WINDOWS --- */}
        <main className="space-y-6">
          {events.length === 0 && !loading && (
            <div className="p-8 sm:p-12 rounded-2xl bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm border border-slate-200/60 dark:border-zinc-800 text-center">
              <Sparkles size={32} className="text-indigo-500 mx-auto mb-4" />
              <h3 className="font-bold text-lg text-slate-800 dark:text-zinc-200">No events loaded yet</h3>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 max-w-md mx-auto">
                Events load automatically from the live NYC feed, which refreshes hourly. If nothing appears, the feed may still be updating — check back shortly, or add your own event.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button onClick={() => setAddEventOpen(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-full">
                  Add an event
                </button>
              </div>
            </div>
          )}

          {/* SKELETON LOADERS WHILE LOADING AND EVENTS IS EMPTY */}
          {loading && events.length === 0 && (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-32 rounded-2xl bg-white/40 dark:bg-zinc-950/40 border border-slate-200/60 dark:border-zinc-800/60 p-4 animate-pulse flex gap-4"
                >
                  <div className="w-16 bg-slate-200 dark:bg-zinc-800 h-full rounded-xl"></div>
                  <div className="w-24 bg-slate-200 dark:bg-zinc-800 h-full rounded-xl shrink-0"></div>
                  <div className="flex-1 space-y-3 pt-2">
                    <div className="h-4 bg-slate-200 dark:bg-zinc-800 rounded w-1/3"></div>
                    <div className="h-4 bg-slate-200 dark:bg-zinc-800 rounded w-2/3"></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* EMPTY SEARCH RESULTS */}
          {viewMode === "list" && filteredEventsList.length === 0 && events.length > 0 && (
            <div className="p-12 text-center rounded-2xl bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm border border-slate-200/60 dark:border-zinc-800">
              <AlertCircle size={32} className="text-slate-400 mx-auto mb-4" />
              <h3 className="font-bold text-base text-slate-800 dark:text-zinc-200">
                No matching listings found
              </h3>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2">
                We couldn't locate any loaded events matching your filters. Try clearing them.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => {
                    setSelectedCategories(["concerts", "broadway", "classical", "sports", "other"]);
                    setHiddenSources([]);
                    setSelectedVenues([]);
                    setSelectedBoroughs([]);
                    setMaxPrice(0);
                    setFreeOnly(false);
                    setDateFilter("all");
                    setSearchQuery("");
                    setSavedOnly(false);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-zinc-200 dark:text-slate-900 hover:opacity-90 rounded-full"
                >
                  Clear all filters
                </button>
              </div>
            </div>
          )}

          {/* --- VIEW MODE A: LIST SHOWCASE --- */}
          {viewMode === "list" && filteredEventsList.length > 0 && (
            <div className="space-y-4">
              {filteredEventsList.map((item) => {
                const isSaved = savedIds.includes(item.id);
                const eventStartDate = new Date(item.start);
                const dayLabel = eventStartDate.getDate();
                const monthLabel = eventStartDate.toLocaleDateString("en-US", { month: "short" });
                const dowLabel = eventStartDate.toLocaleDateString("en-US", { weekday: "short" });
                const timeLabel = eventStartDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                const customColor = customVenueColors[item.venue];

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedEventId(item.id)}
                    className="event-card group bg-white/60 dark:bg-zinc-950/60 backdrop-blur-md rounded-2xl p-4 pl-5 flex flex-wrap items-center gap-3 sm:gap-4 border border-slate-200/40 dark:border-zinc-800/50 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-zinc-700/80 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer relative overflow-hidden"
                  >
                    {/* Left category accent stripe */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl"
                      style={{ backgroundColor: customColor || getCategoryColor(item.cat) }}
                    />

                    {/* Date Block */}
                    <div className="w-16 flex flex-col items-center justify-center border-r border-slate-200 dark:border-zinc-800 pr-3 lg:pr-5 shrink-0 text-center select-none pl-1">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {monthLabel}
                      </div>
                      <div className="text-2xl font-extrabold text-slate-900 dark:text-zinc-100 font-display">
                        {dayLabel}
                      </div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                        {dowLabel}
                      </div>
                    </div>

                    {/* Image Block: gradient plus category fallback */}
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden shrink-0 bg-slate-100 dark:bg-zinc-900 flex-none relative">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.title}
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-3xl font-display select-none"
                          style={{ background: getEventImage(item) }}
                        >
                          {getCategoryEmoji(item.cat)}
                        </div>
                      )}
                    </div>

                    {/* Info Block */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                          style={{
                            backgroundColor: `${getCategoryColor(item.cat)}1A`,
                            color: getCategoryColor(item.cat),
                          }}
                        >
                          {item.cat}
                        </span>
                        {item.status === "cancelled" && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-500 uppercase tracking-wide">
                            Cancelled
                          </span>
                        )}
                        {item.status === "offsale" && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-500 uppercase tracking-wide">
                            Off Sale
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate pr-4 leading-tight group-hover:text-indigo-600 dark:group-hover:text-sky-400 transition-colors">
                        {item.title}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-zinc-400">
                        <span className="flex items-center gap-1">
                          <MapPin size={12} className="opacity-60" />
                          <span className="truncate max-w-[150px]">{item.venue}</span>
                        </span>
                        <span className="hidden sm:inline text-slate-300 dark:text-zinc-800">•</span>
                        <span>{timeLabel}</span>
                        {item.artist && (
                          <>
                            <span className="hidden sm:inline text-slate-300 dark:text-zinc-800">•</span>
                            <span className="truncate italic font-medium">{item.artist}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Pricing / Booking Actions Column (wraps to a full-width row on mobile) */}
                    <div className="w-full sm:w-auto order-last flex sm:flex-col items-center sm:items-end justify-between gap-2 sm:pr-2 sm:shrink-0 mt-1 pt-3 sm:mt-0 sm:pt-0 border-t border-slate-100 dark:border-zinc-800/60 sm:border-0">
                      <span className="order-1 text-emerald-600 dark:text-emerald-500 font-extrabold text-sm sm:text-base font-mono">
                        {item.price}
                      </span>

                      <div className="order-3 sm:order-2 flex items-center gap-1 sm:gap-2">
                        {/* Save Trigger heart */}
                        <button
                          onClick={(e) => toggleSave(item.id, e)}
                          className={`p-2 rounded-full transition-all ${
                            isSaved
                              ? "text-[#ff3b30] bg-[#ff3b30]/10"
                              : "text-slate-400 dark:text-zinc-600 hover:text-red-500 hover:bg-red-500/10"
                          }`}
                          title={isSaved ? "Saved" : "Pin Event"}
                        >
                          <Heart size={15} fill={isSaved ? "currentColor" : "none"} />
                        </button>

                        <a
                          href={item.ticketUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 font-bold rounded-full text-xs transition-all shadow-sm"
                        >
                          Tickets
                        </a>
                      </div>

                      <button
                        onClick={(e) => { e.stopPropagation(); setHiddenSources(activeSources.filter((s) => s !== item.source)); }}
                        className="order-2 sm:order-3 text-[9px] sm:text-[8px] font-semibold text-slate-400 dark:text-zinc-500 hover:text-indigo-500 uppercase tracking-wider font-mono truncate max-w-[120px] flex items-center gap-1"
                        title={`Show only events from ${item.source}`}
                      >
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${item.source}&sz=32`}
                          alt=""
                          className="w-3 h-3 rounded-sm"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                        From {item.source}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* --- VIEW MODE B: CALENDAR (Month / Week / Agenda) --- */}
          {viewMode === "calendar" && events.length > 0 && (
            <div className="bg-white/60 dark:bg-zinc-950/60 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-slate-200/60 dark:border-zinc-800/60 space-y-4 animate-fade-in">
              <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-zinc-800 pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {/* Period navigation */}
                  <div className="flex items-center gap-2">
                    {calendarView !== "agenda" && (
                      <button
                        onClick={() => {
                          if (calendarView === "month") {
                            setCalendarMonth((prev) => { if (prev === 0) { setCalendarYear((y) => y - 1); return 11; } return prev - 1; });
                          } else {
                            setWeekRef((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
                          }
                        }}
                        className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 rounded-lg text-slate-600 dark:text-zinc-300 font-bold"
                        title="Previous"
                      >
                        &larr;
                      </button>
                    )}
                    <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-zinc-100 font-display text-center min-w-[120px]">
                      {calendarView === "month" ? calendarData.monthLabel : calendarView === "week" ? weekData.label : "Upcoming agenda"}
                    </h3>
                    {calendarView !== "agenda" && (
                      <button
                        onClick={() => {
                          if (calendarView === "month") {
                            setCalendarMonth((prev) => { if (prev === 11) { setCalendarYear((y) => y + 1); return 0; } return prev + 1; });
                          } else {
                            setWeekRef((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
                          }
                        }}
                        className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 rounded-lg text-slate-600 dark:text-zinc-300 font-bold"
                        title="Next"
                      >
                        &rarr;
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { const now = new Date(); setCalendarYear(now.getFullYear()); setCalendarMonth(now.getMonth()); setWeekRef(now); }}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300"
                    >
                      Today
                    </button>
                    <div className="flex items-center rounded-lg border border-slate-200 dark:border-zinc-800 p-0.5 bg-slate-100 dark:bg-zinc-900 text-[11px] font-semibold">
                      {(["month", "week", "agenda"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setCalendarView(v)}
                          className={`px-2.5 py-1 rounded-md transition-all capitalize ${calendarView === v ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white" : "text-slate-500"}`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Category color legend */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {CATEGORIES.map((c) => (
                    <span key={c.id} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-zinc-400">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* MONTH GRID */}
              {calendarView === "month" && (
                <>
                  <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1.5 min-h-[300px]">
                    {calendarData.cells.map((cell, idx) => {
                      const cellKey = cell.dateNum !== null ? localDateKey(new Date(calendarYear, calendarMonth, cell.dateNum)) : null;
                      return (
                        <div
                          key={idx}
                          onClick={() => { if (cellKey && cell.events.length > 0) setDayAgendaKey(cellKey); }}
                          className={`min-h-[70px] sm:min-h-[88px] border border-slate-200/50 dark:border-zinc-850 p-1 sm:p-2 rounded-xl flex flex-col justify-between transition-all ${
                            cell.dateNum === null
                              ? "opacity-20 bg-slate-100/30 dark:bg-zinc-900/10"
                              : cell.events.length > 0
                                ? "bg-white/30 dark:bg-zinc-900/10 cursor-pointer hover:border-indigo-400 hover:shadow-sm"
                                : "bg-white/30 dark:bg-zinc-900/10"
                          } ${cell.isToday ? "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-black" : ""}`}
                        >
                          {cell.dateNum !== null ? (
                            <>
                              <div className="flex items-center justify-between">
                                <span className={`text-xs font-bold leading-none ${cell.isToday ? "bg-indigo-600 text-white w-5 h-5 rounded-full flex items-center justify-center p-0.5" : "text-slate-700 dark:text-zinc-300"}`}>
                                  {cell.dateNum}
                                </span>
                                {cell.events.length > 0 && (
                                  <span className="text-[8px] sm:text-[9px] bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-bold px-1 py-0.5 rounded font-mono">
                                    {cell.events.length}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 space-y-1">
                                {cell.events.slice(0, 3).map((e) => {
                                  const vColor = customVenueColors[e.venue] || getCategoryColor(e.cat);
                                  const t = new Date(e.start).toLocaleTimeString([], { hour: "numeric" });
                                  return (
                                    <div
                                      key={e.id}
                                      onClick={(ev) => { ev.stopPropagation(); setSelectedEventId(e.id); }}
                                      className="group flex items-center gap-1 cursor-pointer"
                                      title={`${e.title} at ${e.venue}`}
                                    >
                                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: vColor }} />
                                      <span className="hidden sm:inline text-[9px] font-semibold text-slate-700 dark:text-zinc-400 truncate max-w-[90px]">
                                        <span className="text-slate-400">{t}</span> {e.title}
                                      </span>
                                    </div>
                                  );
                                })}
                                {cell.events.length > 3 && (
                                  <button
                                    onClick={(ev) => { ev.stopPropagation(); if (cellKey) setDayAgendaKey(cellKey); }}
                                    className="text-[8px] font-semibold text-indigo-500 hover:underline leading-none"
                                  >
                                    +{cell.events.length - 3} more
                                  </button>
                                )}
                              </div>
                            </>
                          ) : (
                            <div />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* WEEK VIEW */}
              {calendarView === "week" && (
                <div className="grid grid-cols-1 sm:grid-cols-7 gap-1.5">
                  {weekData.days.map((day) => (
                    <div key={day.key} className={`border border-slate-200/50 dark:border-zinc-850 rounded-xl p-2 min-h-[120px] ${day.isToday ? "ring-2 ring-indigo-500" : ""}`}>
                      <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                        {day.date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
                      </div>
                      <div className="space-y-1">
                        {day.events.length === 0 && <div className="text-[9px] text-slate-300 dark:text-zinc-700">—</div>}
                        {day.events.map((e) => (
                          <button
                            key={e.id}
                            onClick={() => setSelectedEventId(e.id)}
                            className="w-full text-left rounded-md px-1.5 py-1 text-[10px] font-semibold truncate hover:opacity-90"
                            style={{ backgroundColor: `${customVenueColors[e.venue] || getCategoryColor(e.cat)}22`, color: customVenueColors[e.venue] || getCategoryColor(e.cat) }}
                            title={`${e.title} · ${e.venue}`}
                          >
                            {new Date(e.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} {e.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* AGENDA VIEW */}
              {calendarView === "agenda" && (
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                  {agendaGroups.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No upcoming events match your filters.</p>}
                  {agendaGroups.map((group) => (
                    <div key={group.key} className="flex gap-3">
                      <div className="w-12 shrink-0 text-center">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">{group.date.toLocaleDateString("en-US", { month: "short" })}</div>
                        <div className="text-xl font-extrabold text-slate-800 dark:text-zinc-100">{group.date.getDate()}</div>
                        <div className="text-[9px] text-slate-400">{group.date.toLocaleDateString("en-US", { weekday: "short" })}</div>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        {group.events.map((e) => (
                          <button
                            key={e.id}
                            onClick={() => setSelectedEventId(e.id)}
                            className="w-full text-left flex items-center gap-2 p-2 rounded-lg bg-white/50 dark:bg-zinc-900/30 border border-slate-200/50 dark:border-zinc-800/50 hover:border-indigo-400 transition-all"
                          >
                            <span className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: customVenueColors[e.venue] || getCategoryColor(e.cat) }} />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold truncate text-slate-800 dark:text-zinc-100">{e.title}</div>
                              <div className="text-[10px] text-slate-500 truncate">
                                {new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {e.venue}
                              </div>
                            </div>
                            <span className="text-[11px] font-mono font-bold text-emerald-600 shrink-0">{e.price}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* --- VIEW MODE C: MY PLAN (saved itinerary) --- */}
          {viewMode === "plan" && (
            <div className="space-y-5 animate-fade-in">
              {planGroups.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-white/60 dark:bg-zinc-950/60 border border-slate-200/60 dark:border-zinc-800">
                  <Heart size={32} className="text-slate-300 mx-auto mb-4" />
                  <h3 className="font-bold text-base text-slate-800 dark:text-zinc-200">Your plan is empty</h3>
                  <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2">Tap the heart on any event to build your NYC itinerary here.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-extrabold text-slate-900 dark:text-white font-display">My Plan ({savedIds.length})</h2>
                    <button
                      onClick={() => downloadMultiICS(events.filter((e) => savedIds.includes(e.id)), "orch-my-plan.ics")}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-xs font-semibold shadow-sm"
                    >
                      <CalendarPlus size={13} /> Export plan (.ics)
                    </button>
                  </div>
                  {planGroups.map((group) => (
                    <div key={group.key} className="space-y-2">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        {group.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                      </h3>
                      {group.overlaps.size > 0 && (
                        <div className="text-[11px] text-amber-600 dark:text-amber-500 flex items-center gap-1.5 font-medium">
                          <AlertCircle size={12} /> Some events on this day overlap in time.
                        </div>
                      )}
                      {group.events.map((e) => (
                        <div
                          key={e.id}
                          onClick={() => setSelectedEventId(e.id)}
                          className={`flex items-center gap-3 p-3 rounded-xl bg-white/60 dark:bg-zinc-950/60 border cursor-pointer hover:border-indigo-400 transition-all ${group.overlaps.has(e.id) ? "border-amber-400/60" : "border-slate-200/50 dark:border-zinc-800/50"}`}
                        >
                          <span className="w-1.5 h-10 rounded-full shrink-0" style={{ backgroundColor: customVenueColors[e.venue] || getCategoryColor(e.cat) }} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold truncate text-slate-800 dark:text-zinc-100">{e.title}</div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {e.venue}
                            </div>
                          </div>
                          <span className="text-xs font-mono font-bold text-emerald-600 shrink-0">{e.price}</span>
                          <button onClick={(ev) => { ev.stopPropagation(); toggleSave(e.id); }} className="text-[#ff3b30] p-1.5 shrink-0" title="Remove from plan">
                            <Heart size={15} fill="currentColor" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </main>
      </div>

      {/* --- EVENT DETAILED INSPECTOR MODAL --- */}
      {selectedEventId && activeEvent && (
        <div
          onClick={() => setSelectedEventId(null)}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-zinc-950 w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl relative border border-slate-200 dark:border-zinc-800 flex flex-col max-h-[90vh]"
          >
            {/* Image Header with Elegant Overlay */}
            <div className="h-52 w-full relative bg-slate-100 dark:bg-zinc-900 shrink-0 select-none">
              {activeEvent.image ? (
                <img
                  src={activeEvent.image}
                  alt={activeEvent.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-5xl"
                  style={{ background: getEventImage(activeEvent) }}
                >
                  {getCategoryEmoji(activeEvent.cat)}
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

              {/* Heart pin trigger inside image block */}
              <button
                onClick={() => toggleSave(activeEvent.id)}
                className={`absolute top-4 left-4 p-2.5 rounded-full transition-all ${
                  savedIds.includes(activeEvent.id)
                    ? "bg-[#ff3b30] text-white"
                    : "bg-black/45 text-white/80 hover:text-white"
                }`}
              >
                <Heart size={18} fill={savedIds.includes(activeEvent.id) ? "currentColor" : "none"} />
              </button>

              <button
                onClick={() => setSelectedEventId(null)}
                className="absolute top-4 right-4 p-2.5 rounded-full bg-black/45 text-white/80 hover:text-white"
              >
                <X size={18} />
              </button>

              {/* Title & category nested in ambient header */}
              <div className="absolute bottom-4 left-4 right-4 text-white">
                <span
                  className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                  style={{ backgroundColor: getCategoryColor(activeEvent.cat) }}
                >
                  {activeEvent.cat}
                </span>
                <h2 className="text-lg sm:text-2xl font-black mt-2 leading-tight">
                  {activeEvent.title}
                </h2>
              </div>
            </div>

            {/* Scrollable details container */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                    When
                  </span>
                  <p className="font-semibold text-slate-800 dark:text-zinc-200">
                    {new Date(activeEvent.start).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                  <p className="text-slate-500 font-medium">
                    At{" "}
                    {new Date(activeEvent.start).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                    Where
                  </span>
                  <p className="font-semibold text-slate-800 dark:text-zinc-200">{activeEvent.venue}</p>
                  <p className="text-slate-500 font-medium">{activeEvent.area}</p>
                </div>
              </div>

              {activeEvent.artist && (
                <div className="space-y-1 text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                    Performer
                  </span>
                  <p className="font-semibold text-slate-800 dark:text-zinc-200 italic">
                    {activeEvent.artist}
                  </p>
                </div>
              )}

              {activeEvent.desc && (
                <div className="space-y-1 text-xs leading-relaxed">
                  <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                    Description
                  </span>
                  <p className="text-slate-700 dark:text-zinc-350">{activeEvent.desc}</p>
                </div>
              )}

              {/* Event Tags Section (Adding, viewing, removing tags) */}
              <div className="space-y-2.5 text-xs border-t border-slate-200 dark:border-zinc-900 pt-4">
                <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px] flex items-center gap-1">
                  Custom Event Tags
                </span>
                
                {/* List of current tags */}
                <div className="flex flex-wrap gap-1.5">
                  {(activeEvent.tags && activeEvent.tags.length > 0) ? (
                    activeEvent.tags.map((tg) => (
                      <span
                        key={tg}
                        className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-[11px] font-medium text-slate-700 dark:text-zinc-350"
                      >
                        #{tg}
                        <button
                          onClick={() => handleRemoveTag(activeEvent.id, tg)}
                          className="p-0.5 rounded-full text-slate-400 hover:text-red-505 hover:bg-slate-200 dark:hover:bg-zinc-800 select-none cursor-pointer"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-400 dark:text-zinc-500 italic text-[11px] py-1">
                      No tags. Put custom tags below to help categorize this event (e.g. "wnyc", "podcast", "jazz")
                    </span>
                  )}
                </div>

                {/* Add new tag inline form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddTag(activeEvent.id, tagInput);
                  }}
                  className="flex gap-1.5"
                >
                  <input
                    type="text"
                    placeholder="Add a custom tag (e.g. free, podcast)..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    className="flex-1 p-2 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-3 bg-slate-900 dark:bg-zinc-100 hover:opacity-95 text-white dark:text-black rounded-xl text-xs font-semibold flex items-center justify-center gap-1 shadow-sm shrink-0"
                  >
                    <Plus size={11} />
                    Tag
                  </button>
                </form>
              </div>

              {/* Customizable Venue Color picker embedded in details */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/50 dark:border-zinc-800/80 flex items-center justify-between text-xs col-span-full">
                <div className="flex items-center gap-2">
                  <Palette size={14} className="text-slate-500" />
                  <span className="font-semibold text-slate-700 dark:text-zinc-300">
                    Custom color for {activeEvent.venue}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {["#0071e3", "#00a17a", "#5e5ce6", "#ff9f0a", "#e63946", "#8a2be2"].map((hex) => (
                    <button
                      key={hex}
                      onClick={() =>
                        setCustomVenueColors((prev) => ({ ...prev, [activeEvent.venue]: hex }))
                      }
                      className={`w-4.5 h-4.5 rounded-full border border-white dark:border-black transition-transform ${
                        customVenueColors[activeEvent.venue] === hex ? "scale-125 shadow-sm" : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                  {customVenueColors[activeEvent.venue] && (
                    <button
                      onClick={() => {
                        setCustomVenueColors((prev) => {
                          const updated = { ...prev };
                          delete updated[activeEvent.venue];
                          return updated;
                        });
                      }}
                      className="text-[9px] text-red-500 font-bold pl-1 hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Sharing & Calendar export action buttons */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-200 dark:border-zinc-900">
                <button
                  onClick={() => handleShareEvent(activeEvent)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-850 text-xs font-semibold hover:bg-slate-200 text-slate-700 dark:text-zinc-300 transition-all cursor-pointer"
                >
                  <Share2 size={12} />
                  Share Page
                </button>
                <a
                  href={googleCalendarUrl(activeEvent)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-850 text-xs font-semibold hover:bg-slate-200 text-slate-700 dark:text-zinc-300 transition-all"
                >
                  <CalendarPlus size={12} />
                  Google Calendar
                </a>
                <button
                  onClick={() => handleDownloadICS(activeEvent)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-850 text-xs font-semibold hover:bg-slate-200 text-slate-700 dark:text-zinc-300 transition-all"
                >
                  <Calendar size={12} />
                  Download .iCs File
                </button>
              </div>
            </div>

            {/* Sticky Actions Footer */}
            <div className="p-4 bg-slate-50 dark:bg-zinc-900/60 border-t border-slate-200 dark:border-zinc-900 flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 px-1 font-mono">
                <span>{resolvedTicketTarget?.label}</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-500">{activeEvent.price}</span>
              </div>
              <a
                href={resolvedTicketTarget?.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg hover:shadow-indigo-600/10 transition-all cursor-pointer text-center"
              >
                Buy Tickets
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* --- DAY AGENDA POPOVER (click a calendar day) --- */}
      {dayAgendaKey && (
        <div
          onClick={() => setDayAgendaKey(null)}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="bg-white dark:bg-zinc-950 w-full max-w-md rounded-3xl p-6 border border-slate-200 dark:border-zinc-850 shadow-2xl space-y-3 max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <h3 className="font-extrabold text-base text-slate-800 dark:text-zinc-100 font-display">
                {new Date(`${dayAgendaKey}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </h3>
              <button onClick={() => setDayAgendaKey(null)} aria-label="Close" className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-full">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2">
              {(eventsByLocalDate[dayAgendaKey] || []).map((e) => (
                <button
                  key={e.id}
                  onClick={() => { setSelectedEventId(e.id); setDayAgendaKey(null); }}
                  className="w-full text-left flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900/40 border border-slate-200/50 dark:border-zinc-800/50 hover:border-indigo-400 transition-all"
                >
                  <span className="w-1.5 h-9 rounded-full shrink-0" style={{ backgroundColor: customVenueColors[e.venue] || getCategoryColor(e.cat) }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate text-slate-800 dark:text-zinc-100">{e.title}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {e.venue}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-emerald-600 shrink-0">{e.price}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- MANUAL ADD-EVENT MODAL --- */}
      {addEventOpen && (
        <ManualEventModal onClose={() => setAddEventOpen(false)} onAdd={addManualEvent} />
      )}

      {/* --- STICKY FOOTER --- */}
      <footer className="mt-auto h-12 bg-white/70 dark:bg-black/70 backdrop-blur-xl border-t border-black/10 dark:border-zinc-800/60 flex items-center px-6 justify-between text-[11px] text-slate-400 dark:text-zinc-500 select-none">
        <div className="font-bold uppercase tracking-wider font-mono">
          Orch • Real Time Sync
        </div>
        <div>
          {lastUpdated ? (
            <span className="font-medium animate-fade-in font-mono">
              Last synced: {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : (
            <span className="font-mono">Syncing streams...</span>
          )}
        </div>
      </footer>
    </div>
  );
}

// --- MANUAL ADD-EVENT MODAL (isolated form state) ---
function ManualEventModal({
  onAdd,
  onClose,
}: {
  onAdd: (d: { title: string; venue: string; date: string; time: string; price: string; cat: EventCategory; ticketUrl: string; desc: string; artist: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [price, setPrice] = useState("");
  const [cat, setCat] = useState<EventCategory>("other");
  const [ticketUrl, setTicketUrl] = useState("");
  const [artist, setArtist] = useState("");
  const [desc, setDesc] = useState("");

  const inputCls = "w-full p-2 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div onClick={onClose} className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add an event manually"
        className="bg-white dark:bg-zinc-950 w-full max-w-md rounded-3xl p-6 border border-slate-200 dark:border-zinc-850 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
          <h3 className="font-extrabold text-base text-slate-800 dark:text-zinc-100 flex items-center gap-2">
            <CalendarPlus size={18} className="text-indigo-600" /> Add an event
          </h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-full">
            <X size={18} />
          </button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onAdd({ title, venue, date, time, price, cat, ticketUrl, desc, artist }); }}
          className="space-y-3"
        >
          <input className={inputCls} placeholder="Event title *" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <input className={inputCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <input className={inputCls} placeholder="Venue (e.g. Blue Note)" value={venue} onChange={(e) => setVenue(e.target.value)} />
          <input className={inputCls} placeholder="Artist / performer / team" value={artist} onChange={(e) => setArtist(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Price (e.g. $25, Free)" value={price} onChange={(e) => setPrice(e.target.value)} />
            <select className={inputCls} value={cat} onChange={(e) => setCat(e.target.value as EventCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
              ))}
            </select>
          </div>
          <input className={inputCls} type="url" placeholder="Ticket / info URL (optional)" value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} />
          <textarea className={inputCls} rows={2} placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <button type="submit" className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 shadow-sm">
            <Plus size={14} /> Add to calendar
          </button>
        </form>
      </div>
    </div>
  );
}
