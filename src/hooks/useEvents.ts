import { useCallback, useEffect, useState } from "react";
import { EventItem, EventCategory } from "../types";
import { SEED_VENUE_AREAS } from "../lib/constants";
import { rollStartForward, hostOf, normalizeUrl } from "../lib/events";

// Shared events are produced by the scheduled scraper (GitHub Actions) and
// published to the `data` branch as events.json. Override with VITE_EVENTS_URL.
const EVENTS_URL =
  (import.meta as any).env?.VITE_EVENTS_URL ||
  "https://raw.githubusercontent.com/pharmers961/Orch-NYC/data/events.json";

const dedupeTitle = (title: string) =>
  title
    .toLowerCase()
    .replace(/\b(the|a|an|presents|tour|live|vs|at|nyc|show|concert)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 18);

export function useEvents() {
  const [events, setEvents] = useState<EventItem[]>(() => {
    const saved = localStorage.getItem("marquee_events");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter((e) => !String(e?.id).startsWith("seed_"));
      } catch (_) {}
    }
    return [];
  });
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem("marquee_saved_ids");
    return saved ? JSON.parse(saved) : [];
  });
  const [customVenueColors, setCustomVenueColors] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("marquee_venue_colors");
    return saved ? JSON.parse(saved) : {};
  });

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiSuccessNote, setApiSuccessNote] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(() => {
    const saved = localStorage.getItem("marquee_last_updated");
    return saved ? new Date(saved) : null;
  });

  // Persistence
  useEffect(() => {
    localStorage.setItem("marquee_events", JSON.stringify(events));
  }, [events]);
  useEffect(() => {
    localStorage.setItem("marquee_saved_ids", JSON.stringify(savedIds));
  }, [savedIds]);
  useEffect(() => {
    localStorage.setItem("marquee_venue_colors", JSON.stringify(customVenueColors));
  }, [customVenueColors]);
  useEffect(() => {
    if (lastUpdated) localStorage.setItem("marquee_last_updated", lastUpdated.toISOString());
  }, [lastUpdated]);

  // Merge + de-duplicate engine: dedupe key = (normalized title) + (YYYY-MM-DD).
  const mergeAndDeDuplicate = useCallback((newEvents: EventItem[]) => {
    setEvents((prevEvents) => {
      const allEvents = [...prevEvents];
      newEvents.forEach((newEvent) => {
        const dateStr = newEvent.start.split("T")[0];
        const dupKey = `${dedupeTitle(newEvent.title)}_${dateStr}`;
        const existingIdx = allEvents.findIndex((e) => {
          const eDate = e.start.split("T")[0];
          return `${dedupeTitle(e.title)}_${eDate}` === dupKey || e.id === newEvent.id;
        });
        if (existingIdx > -1) {
          const existing = allEvents[existingIdx];
          const mergedTags = [...new Set([...(existing.tags || []), ...(newEvent.tags || [])])];
          if (existing.id === newEvent.id) {
            // Same event re-published by the feed: the feed is authoritative for
            // cat/price/status/etc., so refresh it (keeping user tags + original added time).
            allEvents[existingIdx] = { ...newEvent, tags: mergedTags, added: existing.added };
          } else {
            // Cross-source duplicate (matched on title+date): keep the richer record.
            const existingScore =
              (existing.provider === "Ticketmaster" ? 2 : 0) + (existing.desc ? 1 : 0) + (existing.image ? 1 : 0);
            const newScore =
              (newEvent.provider === "Ticketmaster" ? 2 : 0) + (newEvent.desc ? 1 : 0) + (newEvent.image ? 1 : 0);
            if (newScore > existingScore) allEvents[existingIdx] = { ...existing, ...newEvent, tags: mergedTags };
          }
        } else {
          allEvents.push(newEvent);
        }
      });
      return allEvents;
    });
  }, []);

  // Primary data path: fetch the shared events.json published by the scraper.
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
          price: x.price || "Check site",
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
        if (!cancelled) setErrorMessage("Couldn't load the events feed. It refreshes a few times a day — please try again shortly.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mergeAndDeDuplicate]);

  const addManualEvent = useCallback(
    (data: {
      title: string; venue: string; date: string; time: string; price: string;
      cat: EventCategory; ticketUrl: string; desc: string; artist: string;
    }) => {
      if (!data.title.trim() || !data.date) {
        setErrorMessage("A manual event needs at least a title and a date.");
        return false;
      }
      const ticket = normalizeUrl(data.ticketUrl) || "";
      const ev: EventItem = {
        id: `manual_${Math.random().toString(36).substring(2, 9)}`,
        title: data.title.trim(),
        artist: data.artist.trim(),
        venue: data.venue.trim() || "NYC Venue",
        area: SEED_VENUE_AREAS[data.venue.trim()] || "New York",
        cat: data.cat,
        price: data.price.trim() || "Check site",
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
      return true;
    },
    [mergeAndDeDuplicate]
  );

  const toggleSave = useCallback((id: string) => {
    setSavedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const addTag = useCallback((eventId: string, newTag: string) => {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const currentTags = e.tags || [];
        if (currentTags.includes(trimmed)) return e;
        return { ...e, tags: [...currentTags, trimmed] };
      })
    );
  }, []);

  const removeTag = useCallback((eventId: string, tagToRemove: string) => {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId ? { ...e, tags: (e.tags || []).filter((t) => t !== tagToRemove) } : e
      )
    );
  }, []);

  return {
    events,
    savedIds,
    customVenueColors,
    setCustomVenueColors,
    loading,
    errorMessage,
    setErrorMessage,
    apiSuccessNote,
    setApiSuccessNote,
    lastUpdated,
    mergeAndDeDuplicate,
    addManualEvent,
    toggleSave,
    addTag,
    removeTag,
  };
}
