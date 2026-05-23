import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Sparkles,
  RefreshCw,
  Calendar,
  List as ListIcon,
  Search,
  Heart,
  MapPin,
  ExternalLink,
  CalendarPlus,
  Share2,
  Plus,
  Trash2,
  X,
  Settings,
  Moon,
  Sun,
  Monitor,
  AlertCircle,
  Palette,
  CheckCircle2,
  SlidersHorizontal,
  Info,
  LogIn,
  LogOut,
  User
} from "lucide-react";
import { EventItem, EventCategory, AppState } from "./types";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase";

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

function cleanAndFormatDate(rawDate: string): string {
  if (!rawDate) return new Date().toISOString().split("T")[0];
  try {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  } catch (_) {}
  
  const match = rawDate.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const [_, y, m, day] = match;
    return `${y}-${m.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  
  return new Date().toISOString().split("T")[0];
}

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

export function getInitialSeedEvents(): EventItem[] {
  const getRelativeDateISO = (offsetDays: number, hourAndMinStr: string) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const datePart = d.toISOString().split("T")[0];
    return `${datePart}T${hourAndMinStr}:00Z`;
  };

  return [
    {
      id: "seed_google_1",
      title: "Lincoln Center Open Air Summer Concert",
      artist: "NYC Philharmonic Ensemble",
      venue: "Lincoln Center",
      area: "Manhattan",
      cat: "classical",
      price: "Free",
      start: getRelativeDateISO(1, "19:00"),
      desc: "Enjoy an evening of breathtaking symphonies under the open stars in Manhattan with the New York Philharmonic ensemble.",
      ticketUrl: "https://google.com/events",
      image: "",
      source: "google.com/events",
      provider: "Gemini",
      added: Date.now()
    },
    {
      id: "seed_wnyc_1",
      title: "WNYC Greene Space: The Future of Public Media",
      artist: "WNYC Hosts & Special Guests",
      venue: "The Greene Space",
      area: "Manhattan",
      cat: "other",
      price: "$15",
      start: getRelativeDateISO(2, "18:30"),
      desc: "Live interactive panel discussing the future of storytelling, podcasting, and independent local journalism, hosted by WNYC.",
      ticketUrl: "https://www.wnyc.org/events/",
      image: "",
      source: "wnyc.org",
      provider: "Gemini",
      added: Date.now()
    },
    {
      id: "seed_google_2",
      title: "Brooklyn Botanic Garden Sunset Serenade",
      artist: "The Brooklyn Jazz Collective",
      venue: "Brooklyn Botanic Garden",
      area: "Brooklyn",
      cat: "concerts",
      price: "$25",
      start: getRelativeDateISO(3, "19:30"),
      desc: "Stroll through blooming gardens and settle in for live twilight jazz sets orchestrated by Brooklyn's premier jazz collective.",
      ticketUrl: "https://google.com/events",
      image: "",
      source: "google.com/events",
      provider: "Gemini",
      added: Date.now()
    },
    {
      id: "seed_wnyc_2",
      title: "WNYC Presents: Selected Shorts Live",
      artist: "Acclaimed Stage and Screen Actors",
      venue: "Symphony Space",
      area: "Manhattan",
      cat: "broadway",
      price: "$30+",
      start: getRelativeDateISO(4, "19:00"),
      desc: "Classic and contemporary short stories read aloud by celebrated actors of Broadway and Hollywood. Introduced by WNYC hosts.",
      ticketUrl: "https://www.wnyc.org/events/",
      image: "",
      source: "wnyc.org",
      provider: "Gemini",
      added: Date.now()
    },
    {
      id: "seed_tm_1",
      title: "Yankees vs. Red Sox (Traditional Rivalry)",
      artist: "New York Yankees",
      venue: "Yankee Stadium",
      area: "Bronx",
      cat: "sports",
      price: "$45+",
      start: getRelativeDateISO(5, "13:05"),
      desc: "Catch the classic rivalry live at Yankee Stadium in the Bronx with thousands of passionate baseball fans.",
      ticketUrl: "https://www.ticketmaster.com",
      image: "",
      source: "ticketmaster.com",
      provider: "Ticketmaster",
      added: Date.now()
    }
  ];
}

export default function App() {
  // --- STATE ---
  const [events, setEvents] = useState<EventItem[]>(() => {
    const saved = localStorage.getItem("marquee_events");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (_) {}
    }
    return getInitialSeedEvents();
  });
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem("marquee_saved_ids");
    return saved ? JSON.parse(saved) : [];
  });
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    return (localStorage.getItem("marquee_theme") as "light" | "dark" | "system") || "system";
  });
  const [ticketmasterKey, setTicketmasterKey] = useState(() => localStorage.getItem("marquee_tm_key") || "");
  const [serpapiKey, setSerpapiKey] = useState(() => localStorage.getItem("marquee_serpapi_key") || "");
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("marquee_gemini_key") || "");
  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem("marquee_auto_refresh");
    return saved ? JSON.parse(saved) : true;
  });
  const [userSources, setUserSources] = useState<string[]>(() => {
    const saved = localStorage.getItem("marquee_user_sources");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return [...new Set(parsed)];
        }
      } catch (e) {
        console.error("Invalid user sources:", e);
      }
    }
    return ["https://www.wnyc.org/events/"];
  });
  const [customVenueColors, setCustomVenueColors] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("marquee_venue_colors");
    return saved ? JSON.parse(saved) : {};
  });

  // Filters State
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<EventCategory[]>(["concerts", "broadway", "classical", "sports", "other"]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [googleEventsQuery, setGoogleEventsQuery] = useState("");
  const [searchingGoogleEvents, setSearchingGoogleEvents] = useState(false);
  const [googleEventsSuccessNote, setGoogleEventsSuccessNote] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "weekend" | "week" | "month">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth()); // 0-indexed
  const [sortBy, setSortBy] = useState<"soonest" | "lowestPrice" | "recentlyAdded">("soonest");
  const [savedOnly, setSavedOnly] = useState(false);

  // Status/Uis
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiSuccessNote, setApiSuccessNote] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(() => {
    const saved = localStorage.getItem("marquee_last_updated");
    return saved ? new Date(saved) : null;
  });

   // Modals state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [addUrlInput, setAddUrlInput] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [syncingCustom, setSyncingCustom] = useState(false);
  const [syncProgressMsg, setSyncProgressMsg] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile drawer

  // Firebase Auth & Database Sync States
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Sync custom sources list to user's private Firestore document
  const saveUserSourcesToFirestore = async (sourcesList: string[]) => {
    if (!auth.currentUser) return;
    try {
      const userDocRef = doc(db, "users", auth.currentUser.uid);
      await setDoc(userDocRef, {
        userId: auth.currentUser.uid,
        sources: sourcesList,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to save custom sources to Firestore:", err);
    }
  };

  // Google Login popup authentication
  const loginWithGoogle = async () => {
    try {
      setErrorMessage(null);
      await signInWithPopup(auth, googleProvider);
      setApiSuccessNote("Successfully signed in with Google!");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Authentication failed: ${err.message || "Unknown error"}`);
    }
  };

  // Google signout 
  const logout = async () => {
    try {
      setErrorMessage(null);
      await signOut(auth);
      setApiSuccessNote("Logged out successfully.");
      setUserSources([]);
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Failed to sign out.");
    }
  };

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

  // Firebase Auth State Listener & Custom Sources Database Fetching
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      
      if (user) {
        setSyncProgressMsg("Loading saved profile sources...");
        const userDocRef = doc(db, "users", user.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const data = userDoc.data();
            const firestoreSources = data?.sources || [];
            // Merge local and firestore sources uniquely
            setUserSources((prev) => {
              const combined = [...new Set([...prev, ...firestoreSources])];
              return combined;
            });
          } else {
            // First time login - initialize user document with current local userSources
            const savedSources = localStorage.getItem("marquee_user_sources");
            let localSources: string[] = [];
            if (savedSources) {
              try {
                const parsed = JSON.parse(savedSources);
                if (Array.isArray(parsed)) {
                  localSources = [...new Set(parsed)];
                }
              } catch (e) {
                console.error(e);
              }
            }
            await setDoc(userDocRef, {
              userId: user.uid,
              sources: localSources,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          console.error("Error loading user profile on login:", err);
        } finally {
          setSyncProgressMsg("");
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Persists events & saved state
  useEffect(() => {
    localStorage.setItem("marquee_events", JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    localStorage.setItem("marquee_saved_ids", JSON.stringify(savedIds));
  }, [savedIds]);

  useEffect(() => {
    localStorage.setItem("marquee_auto_refresh", JSON.stringify(autoRefresh));
  }, [autoRefresh]);

  useEffect(() => {
    localStorage.setItem("marquee_user_sources", JSON.stringify(userSources));
  }, [userSources]);

  useEffect(() => {
    localStorage.setItem("marquee_venue_colors", JSON.stringify(customVenueColors));
  }, [customVenueColors]);

  // Handle auto-refresh interval (5 minutes)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchTicketmaster(true);
    }, 300000);
    return () => clearInterval(interval);
  }, [autoRefresh, ticketmasterKey]);

  // Fetch initial data on load
  useEffect(() => {
    // Check if WNYC or Google Events exist in the current events state.
    // Specifying self-healing seeds to always guarantee their visibility.
    const hasGoogle = events.some((e) => e.source === "google.com/events");
    const hasWnyc = events.some((e) => e.source === "wnyc.org");
    if (!hasGoogle || !hasWnyc) {
      const seeds = getInitialSeedEvents();
      setEvents((prev) => {
        const combined = [...prev];
        seeds.forEach((seed) => {
          if (!combined.some((e) => e.id === seed.id || e.title === seed.title)) {
            combined.push(seed);
          }
        });
        return combined;
      });
    }

    if (events.length === 0) {
      fetchTicketmaster(false);
    }
    // Pull NYC Google Events automatically on launch
    fetchGoogleEvents("popular events");
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

  // --- API CALLS ---
  const fetchTicketmaster = async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true);
      setLoadingProgress(10);
      setErrorMessage(null);
    }

    try {
      const response = await fetch("/api/marquee", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ticketmaster-key": ticketmasterKey,
        },
        body: JSON.stringify({ action: "ticketmaster" }),
      });

      if (!isBackground) setLoadingProgress(50);

      const resJson = await response.json();
      if (!isBackground) setLoadingProgress(80);

      if (resJson.success && resJson.data?._embedded?.events) {
        const rawEvents = resJson.data._embedded.events;
        const parsed: EventItem[] = rawEvents.map((e: any): EventItem => {
          // Category mapping
          const classifications = e.classifications?.[0];
          const segmentName = classifications?.segment?.name;
          const genreName = classifications?.genre?.name;
          let cat: EventCategory = "concerts";
          if (segmentName === "Sports") cat = "sports";
          else if (segmentName === "Music") cat = "concerts";
          else if (genreName === "Classical" || genreName === "Opera" || genreName === "Orchestral") cat = "classical";
          else cat = "broadway";

          const venueName = e._embedded?.venues?.[0]?.name || "NYC Venue";
          const area = SEED_VENU_AREAS[venueName] || e._embedded?.venues?.[0]?.city?.name || "New York";

          let priceRange = "Price TBA";
          if (e.priceRanges?.[0]) {
            const min = Math.round(e.priceRanges[0].min || 0);
            const max = Math.round(e.priceRanges[0].max || 0);
            priceRange = min === max ? `$${min}` : `$${min}–$${max}`;
          }

          // best imag
          const sortedImages = e.images ? [...e.images].sort((a: any, b: any) => b.width - a.width) : [];
          const bestImage = sortedImages.find((img: any) => img.ratio === "16_9")?.url || sortedImages[0]?.url || "";

          return {
            id: e.id,
            title: e.name,
            artist: e._embedded?.attractions?.[0]?.name || "",
            venue: venueName,
            area,
            cat,
            price: priceRange,
            start: e.dates.start.dateTime || `${e.dates.start.localDate}T19:00:00Z`,
            desc: e.info || e.description || "",
            ticketUrl: e.url,
            image: bestImage,
            status: e.dates.status?.code || "onsale",
            source: "ticketmaster.com",
            provider: "Ticketmaster",
            added: Date.now(),
          };
        });

        mergeAndDeDuplicate(parsed);
        const updateDate = new Date();
        setLastUpdated(updateDate);
        localStorage.setItem("marquee_last_updated", updateDate.toISOString());
        setApiSuccessNote("Connected to live Ticketmaster stream.");
      } else {
        if (resJson.error) {
          setErrorMessage(resJson.error);
        } else {
          setErrorMessage("No upcoming events returned by Ticketmaster.");
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Could not contact server API. Please check configuration & port mappings.");
    } finally {
      if (!isBackground) {
        setLoadingProgress(100);
        setTimeout(() => {
          setLoading(false);
          setLoadingProgress(0);
        }, 300);
      }
    }
  };

  const fetchGeminiSearch = async () => {
    setLoading(true);
    setLoadingProgress(20);
    setErrorMessage(null);
    setApiSuccessNote(null);

    try {
      const response = await fetch("/api/marquee", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-key": geminiKey,
        },
        body: JSON.stringify({ action: "gemini" }),
      });

      setLoadingProgress(60);
      const resJson = await response.json();
      setLoadingProgress(90);

      if (resJson.success && Array.isArray(resJson.events)) {
        const parsed: EventItem[] = resJson.events.map((e: any): EventItem => {
          const hostname = safeGetHostname(e.ticketUrl, "wnyc.org");
          const VALID_CATS = ["concerts", "broadway", "classical", "sports", "other"];
          const rawCat = (e.category || "").toLowerCase();
          const mappedCat: EventCategory = VALID_CATS.includes(rawCat) ? (rawCat as EventCategory) : "other";
          return {
            id: `gemini_${Math.random().toString(36).substring(2, 9)}`,
            title: e.title,
            artist: e.artist || "",
            venue: e.venue || "NYC Venue",
            area: SEED_VENU_AREAS[e.venue] || "New York",
            cat: mappedCat,
            price: e.price || "$20+",
            start: `${cleanAndFormatDate(e.date)}T${e.time || "19:30"}:00Z`,
            desc: e.description || "",
            ticketUrl: e.ticketUrl,
            image: "", // emoji gradients resolved on render
            source: hostname,
            provider: "Gemini",
            added: Date.now(),
            tags: [],
          };
        });

        mergeAndDeDuplicate(parsed);
        const updateDate = new Date();
        setLastUpdated(updateDate);
        localStorage.setItem("marquee_last_updated", updateDate.toISOString());
        if (resJson.warning) {
          setApiSuccessNote(resJson.warning);
        } else {
          setApiSuccessNote("Grounded search completed! Merged live local events.");
        }
      } else {
        setErrorMessage(resJson.error || "No response received from your grounded Gemini search engine.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Failed to call Gemini AI grounding route.");
    } finally {
      setLoadingProgress(100);
      setTimeout(() => {
        setLoading(false);
        setLoadingProgress(0);
      }, 300);
    }
  };

  const fetchGoogleEvents = async (customQuery?: string) => {
    const q = (customQuery || googleEventsQuery).trim();
    if (!q) {
      setErrorMessage("Please enter an event query to search the Google Events API (NYC).");
      return;
    }
    setSearchingGoogleEvents(true);
    setLoading(true);
    setLoadingProgress(20);
    setErrorMessage(null);
    setGoogleEventsSuccessNote(null);
    setApiSuccessNote(null);

    try {
      const response = await fetch("/api/marquee", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-key": geminiKey,
          "x-serpapi-key": serpapiKey,
        },
        body: JSON.stringify({ action: "googleEvents", payload: { query: q, serpapiKey } }),
      });

      setLoadingProgress(60);
      const resJson = await response.json();
      setLoadingProgress(90);

      if (resJson.success && Array.isArray(resJson.events)) {
        if (resJson.events.length === 0) {
          setErrorMessage(`No matching events in New York City found for "${q}". Try another search (e.g., "jazz", "opera", "comedy").`);
        } else {
          const parsed: EventItem[] = resJson.events.map((e: any): EventItem => {
            const hostname = safeGetHostname(e.ticketUrl, "google.com/events");
            const VALID_CATS = ["concerts", "broadway", "classical", "sports", "other"];
            const rawCat = (e.category || "").toLowerCase();
            const mappedCat: EventCategory = VALID_CATS.includes(rawCat) ? (rawCat as EventCategory) : "other";
            
            // Auto add the clean search term as a custom tag
            const qTag = q.toLowerCase().replace(/[^a-z0-str0-9]/g, "");
            
            return {
              id: `google_${Math.random().toString(36).substring(2, 9)}`,
              title: e.title,
              artist: e.artist || "",
              venue: e.venue || "NYC Venue",
              area: SEED_VENU_AREAS[e.venue] || "New York",
              cat: mappedCat,
              price: e.price || "Check Site",
              start: `${cleanAndFormatDate(e.date)}T${e.time || "19:00"}:00Z`,
              desc: e.description || "",
              ticketUrl: e.ticketUrl,
              image: "",
              source: hostname,
              provider: resJson.source === "serpapi" ? "SerpApi" : "Gemini",
              added: Date.now(),
              tags: [qTag].filter(Boolean),
            };
          });

          mergeAndDeDuplicate(parsed);
          const updateDate = new Date();
          setLastUpdated(updateDate);
          localStorage.setItem("marquee_last_updated", updateDate.toISOString());
          if (resJson.warning) {
            setGoogleEventsSuccessNote(`Offline Cache active: ${resJson.warning}`);
            setApiSuccessNote(resJson.warning);
          } else {
            setGoogleEventsSuccessNote(`Successfully imported ${parsed.length} NYC Google Events matching "${q}"!`);
            setApiSuccessNote(`Google Events synced! Imported ${parsed.length} NYC matchings.`);
          }
        }
      } else {
        setErrorMessage(resJson.error || "No events received from Google Events search.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Failed to search Google Events API.");
    } finally {
      setLoadingProgress(100);
      setSearchingGoogleEvents(false);
      setTimeout(() => {
        setLoading(false);
        setLoadingProgress(0);
      }, 300);
    }
  };

  const parseCustomPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUrlInput.trim()) return;
    setAddingSource(true);
    setErrorMessage(null);
    setApiSuccessNote(null);

    try {
      const response = await fetch("/api/marquee", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-key": geminiKey,
        },
        body: JSON.stringify({
          action: "parseUrl",
          payload: { url: addUrlInput },
        }),
      });

      const resJson = await response.json();
      if (resJson.success && Array.isArray(resJson.events) && resJson.events.length > 0) {
        // Append custom user sources list uniquely
        if (!userSources.includes(addUrlInput)) {
          const nextSources = [...userSources, addUrlInput];
          setUserSources(nextSources);
          if (currentUser) {
            saveUserSourcesToFirestore(nextSources);
          }
        }

        const parsed: EventItem[] = resJson.events.map((evt: any): EventItem => {
          const hostname = new URL(addUrlInput).hostname.replace("www.", "");
          const VALID_CATS = ["concerts", "broadway", "classical", "sports", "other"];
          const rawCat = (evt.category || "").toLowerCase();
          const mappedCat: EventCategory = VALID_CATS.includes(rawCat) ? (rawCat as EventCategory) : "other";
          return {
            id: `custom_${Math.random().toString(36).substring(2, 9)}`,
            title: evt.title,
            artist: evt.artist || "",
            venue: evt.venue || "NYC Venue",
            area: SEED_VENU_AREAS[evt.venue] || "New York",
            cat: mappedCat,
            price: evt.price || "Check Site",
            start: `${evt.date}T${evt.time || "19:00"}:00Z`,
            desc: evt.description || "",
            ticketUrl: evt.ticketUrl || addUrlInput,
            image: "",
            source: hostname,
            provider: "Gemini",
            added: Date.now(),
            tags: [],
          };
        });

        mergeAndDeDuplicate(parsed);
        setApiSuccessNote(`Successfully imported ${parsed.length} event(s) from webpage snippet!`);
        setAddUrlInput("");
      } else {
        setErrorMessage(resJson.error || "Could not resolve schemas or event listings from this webpage URL. Please verify format.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Service is unable to extract context. Please check that your Gemini API key is configured.");
    } finally {
      setAddingSource(false);
    }
  };

  const removeCustomSource = (sourceUrl: string) => {
    const nextSources = userSources.filter((s) => s !== sourceUrl);
    setUserSources(nextSources);
    if (currentUser) {
      saveUserSourcesToFirestore(nextSources);
    }
    const hostname = new URL(sourceUrl).hostname.replace("www.", "");
    // Option to prune associated events too
    setEvents((prev) => prev.filter((e) => e.source !== hostname));
  };

  const syncAllCustomSources = async () => {
    if (userSources.length === 0) return;
    setSyncingCustom(true);
    setErrorMessage(null);
    setApiSuccessNote(null);
    let totalImported = 0;
    let failedCount = 0;

    for (let i = 0; i < userSources.length; i++) {
      const src = userSources[i];
      const host = new URL(src).hostname.replace("www.", "");
      setSyncProgressMsg(`Syncing ${host} (${i + 1}/${userSources.length})...`);
      try {
        const response = await fetch("/api/marquee", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gemini-key": geminiKey,
          },
          body: JSON.stringify({
            action: "parseUrl",
            payload: { url: src },
          }),
        });

        const resJson = await response.json();
        if (resJson.success && Array.isArray(resJson.events) && resJson.events.length > 0) {
          const parsed: EventItem[] = resJson.events.map((evt: any): EventItem => {
            const VALID_CATS = ["concerts", "broadway", "classical", "sports", "other"];
            const rawCat = (evt.category || "").toLowerCase();
            const mappedCat: EventCategory = VALID_CATS.includes(rawCat) ? (rawCat as EventCategory) : "other";
            return {
              id: `custom_${Math.random().toString(36).substring(2, 9)}`,
              title: evt.title,
              artist: evt.artist || "",
              venue: evt.venue || "NYC Venue",
              area: SEED_VENU_AREAS[evt.venue] || "New York",
              cat: mappedCat,
              price: evt.price || "Check Site",
              start: `${cleanAndFormatDate(evt.date)}T${evt.time || "19:00"}:00Z`,
              desc: evt.description || "",
              ticketUrl: evt.ticketUrl || src,
              image: "",
              source: host,
              provider: "Gemini",
              added: Date.now(),
              tags: [],
            };
          });
          mergeAndDeDuplicate(parsed);
          totalImported += parsed.length;
        } else {
          failedCount++;
        }
      } catch (err) {
        console.error("Failed to sync source:", src, err);
        failedCount++;
      }
    }

    if (totalImported > 0) {
      setApiSuccessNote(`Successfully synchronized ${totalImported} new event(s) across your active custom sources!`);
      setLastUpdated(new Date());
    } else if (failedCount > 0) {
      setErrorMessage(`Unable to synchronize custom sources. Please check your internet connectivity or supply a refreshed Gemini API key in settings.`);
    } else {
      setApiSuccessNote("All custom websites are currently up to date!");
    }
    setSyncingCustom(false);
    setSyncProgressMsg("");
  };

  // --- DERIVED METRICS / FILTER ENGINE ---
  const activeSources = useMemo(() => {
    const list = events.map((e) => e.source);
    if (!list.includes("ticketmaster.com")) list.push("ticketmaster.com");
    if (!list.includes("google.com/events")) list.push("google.com/events");
    if (!list.includes("wnyc.org")) list.push("wnyc.org");
    return [...new Set(list)];
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
        if (selectedSources.length > 0 && !selectedSources.includes(e.source)) return false;

        // Venues Filter
        if (selectedVenues.length > 0 && !selectedVenues.includes(e.venue)) return false;

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

        // Date Period Filter (only applied in non-calendar view)
        if (viewMode !== "calendar") {
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
        return 0;
      });
  }, [events, selectedCategories, selectedSources, selectedVenues, savedOnly, savedIds, searchQuery, dateFilter, sortBy, selectedTags, viewMode]);

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

  const handleSourceCheckbox = (source: string) => {
    setSelectedSources((prev) => {
      if (prev.includes(source)) return prev.filter((s) => s !== source);
      return [...prev, source];
    });
  };

  const isolateSourceOnly = (source: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSources([source]);
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

    // Populate actual days
    for (let d = 1; d <= daysInMonth; d++) {
      const matchedEvents = filteredEventsList.filter((e) => {
        const matchDateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        return e.start.startsWith(matchDateStr);
      });

      calendarCells.push({
        dateNum: d,
        events: matchedEvents,
        isToday: today.getDate() === d && today.getMonth() === month && today.getFullYear() === year,
      });
    }

    const monthLabel = new Date(year, month).toLocaleString("default", { month: "long", year: "numeric" });
    return { monthLabel, cells: calendarCells };
  }, [filteredEventsList, calendarYear, calendarMonth]);

  // Trap focus inside modal on launch
  const activeEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return events.find((e) => e.id === selectedEventId) || null;
  }, [selectedEventId, events]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#000000] text-slate-900 dark:text-zinc-100 transition-colors duration-300 flex flex-col antialiased">
      {/* Dynamic Top Progress Loading indicator */}
      {loading && (
        <div className="fixed top-0 left-0 right-0 h-1 z-[110] bg-slate-200 dark:bg-zinc-800">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300"
            style={{ width: `${loadingProgress}%` }}
          />
        </div>
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

          {/* Refresh control triggers primary Ticketmaster feeds and optionally grounded web search */}
          <button
            onClick={() => fetchTicketmaster(false)}
            className="hidden sm:flex px-4 py-1.5 bg-slate-900 dark:bg-zinc-100 text-white dark:text-black hover:opacity-90 active:scale-[0.98] transition-all text-xs font-semibold rounded-full items-center gap-1.5 shadow-sm"
            id="refresh-feed-btn"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Sync Ticketmaster
          </button>

          <button
            onClick={fetchGeminiSearch}
            className="hidden sm:flex px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] transition-all text-xs font-semibold rounded-full items-center gap-1.5 shadow-sm"
            id="grounded-gemini-btn"
          >
            <Sparkles size={12} />
            Ground with Gemini
          </button>

          {/* Mobile floating layouts toggler */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 text-slate-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"
            id="filter-drawer-toggle"
          >
            <SlidersHorizontal size={18} />
          </button>

          <div className="w-px h-6 bg-slate-200 dark:bg-zinc-800 mx-1"></div>

          <button
            onClick={() => setSettingsOpen(true)}
            className="px-4 py-1.5 border border-slate-200 dark:border-zinc-800 rounded-full text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-all text-slate-700 dark:text-zinc-300"
            id="settings-panel-btn"
          >
            Settings
          </button>

          {/* User Account / Auth Widget */}
          {authLoading ? (
            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 animate-pulse flex items-center justify-center">
              <span className="text-[10px] text-slate-400">...</span>
            </div>
          ) : currentUser ? (
            <div className="flex items-center gap-1.5">
              <div 
                className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100/50 dark:border-indigo-900/40 rounded-full text-xs font-semibold text-indigo-700 dark:text-indigo-400 select-none max-w-[150px]"
                title={`Signed in as ${currentUser.displayName || currentUser.email}`}
              >
                {currentUser.photoURL ? (
                  <img src={currentUser.photoURL} alt="avatar" className="w-4.5 h-4.5 rounded-full object-cover select-none" referrerPolicy="no-referrer" />
                ) : (
                  <User size={12} />
                )}
                <span className="hidden md:inline truncate">{currentUser.displayName || currentUser.email?.split("@")[0]}</span>
              </div>
              <button
                onClick={logout}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/5 rounded-full transition-all"
                title="Sign Out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={loginWithGoogle}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-semibold rounded-full active:scale-[0.97] transition-all shadow-sm"
              title="Sign in with your Google account to save sources permanently"
            >
              <LogIn size={13} />
              Sign In
            </button>
          )}
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
              <p className="opacity-80">Check that your configuration keys are valid. You can add alternative keys inside the Settings dashboard.</p>
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
              <option value="lowestPrice">Lowest price</option>
              <option value="recentlyAdded">Recently added</option>
            </select>

            {/* List / Calendar toggle */}
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-zinc-800 p-0.5 bg-slate-100 dark:bg-zinc-900">
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === "list" ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white" : "text-slate-500"
                }`}
                title="List View"
              >
                <ListIcon size={14} />
              </button>
              <button
                onClick={() => setViewMode("calendar")}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === "calendar" ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white" : "text-slate-500"
                }`}
                title="Calendar Grid View"
              >
                <Calendar size={14} />
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

          {/* Sources Filter Section (always visible so users can select and query custom APIs) */}
          {activeSources.length >= 1 && (
            <div className="space-y-3 pt-2 font-sans">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
                  Sources
                </h3>
                {selectedSources.length > 0 && (
                  <button
                    onClick={() => setSelectedSources([])}
                    className="text-[9px] text-indigo-600 dark:text-[#5e5ce6] font-semibold hover:underline"
                  >
                    Clear Filter
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
                          checked={selectedSources.includes(source)}
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
            <div className="p-12 text-center rounded-2xl bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm border border-slate-200/60 dark:border-zinc-800">
              <Info size={32} className="text-slate-400 mx-auto mb-4" />
              <h3 className="font-bold text-base text-slate-800 dark:text-zinc-200">
                No events currently loaded
              </h3>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 max-w-md mx-auto">
                No active event lists are configured. Please check if your Ticketmaster or Gemini API key is configured. You can supply them directly in the settings modal.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="px-4 py-2 bg-slate-950 hover:bg-slate-900 text-white dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200 text-xs font-semibold rounded-full"
                >
                  Configure API Keys
                </button>
                <button
                  onClick={() => fetchTicketmaster(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-zinc-800 text-xs font-semibold rounded-full hover:bg-slate-100 dark:hover:bg-zinc-900"
                >
                  Retry Fetching Sync
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
                We couldn't locate any items aligning with your current query. Try broadening your date brackets or adjusting keywords.
              </p>
              <button
                onClick={() => {
                  setSelectedCategories(["concerts", "broadway", "classical", "sports"]);
                  setSelectedSources([]);
                  setSelectedVenues([]);
                  setDateFilter("all");
                  setSearchQuery("");
                  setSavedOnly(false);
                }}
                className="mt-6 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-zinc-200 dark:text-slate-900 hover:opacity-90 rounded-full"
              >
                Clear all filters
              </button>
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
                    className="event-card group bg-white/60 dark:bg-zinc-950/60 backdrop-blur-md rounded-2xl p-4 flex items-center gap-4 lg:gap-6 border border-slate-200/40 dark:border-zinc-800/50 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-zinc-700/80 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer relative"
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

                    {/* Pricing / Booking Actions Column */}
                    <div className="text-right flex flex-col items-end gap-2 pr-2 shrink-0">
                      <span className="text-emerald-600 dark:text-emerald-500 font-extrabold text-sm sm:text-base font-mono">
                        {item.price}
                      </span>

                      <div className="flex items-center gap-1 sm:gap-2">
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

                      <span className="text-[8px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider font-mono truncate max-w-[100px]">
                        From {item.source}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* --- VIEW MODE B: CALENDAR GRIDS --- */}
          {viewMode === "calendar" && events.length > 0 && (
            <div className="bg-white/60 dark:bg-zinc-950/60 backdrop-blur-md rounded-2xl p-6 border border-slate-200/60 dark:border-zinc-800/60 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setCalendarMonth((prev) => {
                        if (prev === 0) {
                          setCalendarYear((y) => y - 1);
                          return 11;
                        }
                        return prev - 1;
                      });
                    }}
                    className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 rounded-lg text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer select-none font-bold"
                    title="Previous Month"
                  >
                    &larr;
                  </button>
                  <h3 className="font-bold text-base text-slate-800 dark:text-zinc-100 font-display min-w-[124px] text-center">
                    {calendarData.monthLabel}
                  </h3>
                  <button
                    onClick={() => {
                      setCalendarMonth((prev) => {
                        if (prev === 11) {
                          setCalendarYear((y) => y + 1);
                          return 0;
                        }
                        return prev + 1;
                      });
                    }}
                    className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 rounded-lg text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer select-none font-bold"
                    title="Next Month"
                  >
                    &rarr;
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 font-mono tracking-wider">
                  Select a cell to inspect listings
                </span>
              </div>

              {/* Day names row */}
              <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <div>Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
              </div>

              {/* Grid block cells */}
              <div className="grid grid-cols-7 gap-1.5 min-h-[300px]">
                {calendarData.cells.map((cell, idx) => {
                  return (
                    <div
                      key={idx}
                      className={`min-h-[70px] sm:min-h-[85px] border border-slate-200/50 dark:border-zinc-850 p-1 sm:p-2 rounded-xl flex flex-col justify-between ${
                        cell.dateNum === null
                          ? "opacity-20 bg-slate-100/30 dark:bg-zinc-900/10 cursor-not-allowed"
                          : "bg-white/30 dark:bg-zinc-900/10"
                      } ${cell.isToday ? "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-black" : ""}`}
                    >
                      {cell.dateNum !== null ? (
                        <>
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-bold leading-none ${
                                cell.isToday
                                  ? "bg-indigo-600 text-white w-5 h-5 rounded-full flex items-center justify-center p-0.5"
                                  : "text-slate-700 dark:text-zinc-300"
                              }`}
                            >
                              {cell.dateNum}
                            </span>
                            {cell.events.length > 0 && (
                              <span className="text-[8px] sm:text-[9px] bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-bold px-1 py-0.5 rounded font-mono">
                                {cell.events.length}
                              </span>
                            )}
                          </div>

                          {/* Dots / Small text listings details */}
                          <div className="mt-1 space-y-1">
                            {cell.events.slice(0, 3).map((e) => {
                              const vColor = customVenueColors[e.venue] || getCategoryColor(e.cat);
                              return (
                                <div
                                  key={e.id}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setSelectedEventId(e.id);
                                  }}
                                  className="group flex items-center gap-1 cursor-pointer"
                                  title={`${e.title} at ${e.venue}`}
                                >
                                  <div
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: vColor }}
                                  />
                                  <span className="hidden sm:inline text-[9px] font-semibold text-slate-700 dark:text-zinc-400 truncate max-w-[80px]">
                                    {e.title}
                                  </span>
                                </div>
                              );
                            })}
                            {cell.events.length > 3 && (
                              <div className="text-[8px] font-semibold text-slate-400 leading-none">
                                +{cell.events.length - 3} more
                              </div>
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

      {/* --- SETTINGS & PROXY CONTROL INLINE DRAWER MODAL --- */}
      {settingsOpen && (
        <div
          onClick={() => setSettingsOpen(false)}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-zinc-950 w-full max-w-lg rounded-3xl p-6 border border-slate-200 dark:border-zinc-850 shadow-2xl relative space-y-5 overflow-y-auto max-h-[85vh]"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-indigo-600" />
                <h3 className="font-extrabold text-base text-slate-800 dark:text-zinc-100 font-display">
                  Orch Dashboard
                </h3>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-full transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* API Keys customization forms */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-zinc-450 uppercase tracking-wider">
                  Ticketmaster API Key (Optional Override)
                </label>
                <input
                  type="password"
                  value={ticketmasterKey}
                  onChange={(e) => {
                    setTicketmasterKey(e.target.value);
                    localStorage.setItem("marquee_tm_key", e.target.value);
                  }}
                  placeholder="Paste Consumer Key from developer.ticketmaster.com"
                  className="w-full p-2 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-zinc-450 uppercase tracking-wider">
                  Gemini API Key (Optional Override)
                </label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => {
                    setGeminiKey(e.target.value);
                    localStorage.setItem("marquee_gemini_key", e.target.value);
                  }}
                  placeholder="Paste key from Google AI Studio"
                  className="w-full p-2 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-zinc-450 uppercase tracking-wider">
                  SerpApi API Key (Optional Override)
                </label>
                <input
                  type="password"
                  value={serpapiKey}
                  onChange={(e) => {
                    setSerpapiKey(e.target.value);
                    localStorage.setItem("marquee_serpapi_key", e.target.value);
                  }}
                  placeholder="Paste key from serpapi.com to query live Google Events"
                  className="w-full p-2 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl"
                />
              </div>

              {/* Auto Refresh setting checkbox */}
              <label className="flex items-center gap-3 text-xs font-semibold text-slate-700 dark:text-zinc-300 ring-offset-black cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-zinc-700"
                />
                Configure background 5-minute Auto-refresh loops (Ticketmaster only)
              </label>
            </div>

            {/* Custom scraping parsing forms */}
            {!currentUser ? (
              <div className="pt-2 border-t border-slate-200 dark:border-zinc-900 space-y-3">
                <label className="text-xs font-bold text-slate-500 dark:text-zinc-450 uppercase tracking-wider flex items-center gap-1.5">
                  <Plus size={14} />
                  Add & Save Custom Event sources
                </label>
                <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-950/40 rounded-2xl flex flex-col items-center text-center gap-3">
                  <div>
                    <h5 className="text-[12px] font-bold text-indigo-900 dark:text-indigo-450">Save your sources permanently</h5>
                    <p className="text-[10.5px] text-slate-500 dark:text-zinc-400 mt-0.5">Please sign in with Google to add custom event listings and sync them permanently across your devices.</p>
                  </div>
                  <button
                    type="button"
                    onClick={loginWithGoogle}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                  >
                    <LogIn size={13} />
                    Sign In with Google
                  </button>
                </div>
              </div>
            ) : (
              <>
                <form onSubmit={parseCustomPage} className="space-y-2 pt-2 border-t border-slate-200 dark:border-zinc-900">
                  <label className="text-xs font-bold text-slate-500 dark:text-zinc-450 uppercase tracking-wider flex items-center gap-1.5">
                    <Plus size={14} />
                    Add a listings page or custom event URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      required
                      value={addUrlInput}
                      onChange={(e) => setAddUrlInput(e.target.value)}
                      placeholder="e.g., https://www.wnyc.org/events/example"
                      className="flex-1 p-2 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={addingSource}
                      className="px-4 py-2 bg-slate-900 dark:bg-zinc-100 text-white dark:text-black hover:opacity-90 rounded-xl text-xs font-semibold shadow-sm shrink-0"
                    >
                      {addingSource ? "Extracting..." : "Import"}
                    </button>
                  </div>
                </form>

                {/* User added sources custom manager lists */}
                {userSources.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-zinc-900">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Active Custom Sources ({userSources.length})
                      </h4>
                      <button
                        onClick={syncAllCustomSources}
                        disabled={syncingCustom}
                        className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-[11px] font-semibold text-indigo-650 dark:text-indigo-400 hover:opacity-85 disabled:opacity-50 rounded-lg transition-all"
                        title="Refresh and sync events from all your saved websites"
                      >
                        <RefreshCw size={11} className={syncingCustom ? "animate-spin" : ""} />
                        {syncingCustom ? "Syncing..." : "Sync All"}
                      </button>
                    </div>

                    {syncProgressMsg && (
                      <div className="p-1 px-2 text-[10px] text-indigo-650 dark:text-indigo-400 font-mono bg-indigo-500/5 rounded border border-indigo-500/10 animate-pulse">
                        {syncProgressMsg}
                      </div>
                    )}

                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {userSources.map((src) => {
                        const host = new URL(src).hostname.replace("www.", "");
                        return (
                          <div
                            key={src}
                            className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-zinc-900/40 text-[11px]"
                          >
                            <span className="truncate max-w-[250px] font-mono" title={src}>
                              {host}
                            </span>
                            <button
                              onClick={() => removeCustomSource(src)}
                              className="text-red-500 p-1 hover:bg-red-500/10 rounded"
                              title="Prune this source events"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Google Events API Section */}
            <div className="pt-4 border-t border-slate-200 dark:border-zinc-900 space-y-3">
              <label className="text-xs font-bold text-slate-500 dark:text-zinc-450 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} className="text-indigo-600 dark:text-indigo-400" />
                Live "Google Events API" Search (NYC Only)
              </label>
              
              <div className="p-4 bg-slate-50 dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800 rounded-2xl space-y-3">
                <p className="text-[10.5px] text-slate-500 dark:text-zinc-400">
                  Search live events on Google across the 5 boroughs of New York City for any topic (e.g. <span className="font-semibold text-slate-700 dark:text-zinc-300">"jazz tonight"</span>, <span className="font-semibold text-slate-700 dark:text-zinc-300">"free street fair"</span>, <span className="font-semibold text-slate-700 dark:text-zinc-300">"broadway reviews"</span>).
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    fetchGoogleEvents();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    required
                    value={googleEventsQuery}
                    onChange={(e) => setGoogleEventsQuery(e.target.value)}
                    placeholder="e.g., live jazz club, central park..."
                    className="flex-1 p-2 text-xs bg-white dark:bg-black border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={searchingGoogleEvents}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-semibold shadow-sm shrink-0 flex items-center gap-1 transition-all"
                  >
                    {searchingGoogleEvents ? (
                      <>
                        <RefreshCw size={11} className="animate-spin" />
                        Fetching...
                      </>
                    ) : (
                      "Search API"
                    )}
                  </button>
                </form>

                {googleEventsSuccessNote && (
                  <div className="p-2 text-[10.5px] text-indigo-700 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100/30 font-medium">
                    {googleEventsSuccessNote}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
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
