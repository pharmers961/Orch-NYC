import { EventCategory } from "../types";

export const CATEGORIES: { id: EventCategory; label: string; emoji: string; color: string }[] = [
  { id: "storytime", label: "Storytime & Books", emoji: "📚", color: "#5e5ce6" },
  { id: "crafts", label: "Crafts & Making", emoji: "🎨", color: "#d4358b" },
  { id: "music", label: "Music & Concerts", emoji: "🎶", color: "#0071e3" },
  { id: "shows", label: "Shows & Movies", emoji: "🎭", color: "#00a17a" },
  { id: "nature", label: "Nature & Animals", emoji: "🦋", color: "#34a853" },
  { id: "play", label: "Play & Sports", emoji: "🤸", color: "#ff9f0a" },
  { id: "festivals", label: "Festivals & Fairs", emoji: "🎪", color: "#ff6482" },
  { id: "other", label: "Other & Custom", emoji: "✨", color: "#8e8e93" },
];

// All category ids — single source of truth for "everything selected".
export const ALL_CATEGORY_IDS: EventCategory[] = CATEGORIES.map((c) => c.id);

// Central Contra Costa cities covered by the feed (Alamo rolls up under
// Danville; Oakland/Berkeley attractions land in "Day Trip").
export const CITIES = [
  "Walnut Creek",
  "Concord",
  "Pleasant Hill",
  "Danville",
  "Lafayette",
  "Moraga",
  "Orinda",
  "San Ramon",
  "Martinez",
  "Clayton",
  "Day Trip",
  "Other",
];

// Age buckets for the filter chips. Events whose stated range intersects a
// selected bucket match; events with no stated ages always pass (recall over
// precision — most sources don't state ages).
export const AGE_BUCKETS: { id: string; label: string; lo: number; hi: number }[] = [
  { id: "0-2", label: "0–2", lo: 0, hi: 2 },
  { id: "3-5", label: "3–5", lo: 3, hi: 5 },
  { id: "5-7", label: "5–7", lo: 5, hi: 7 },
];

// Subscribable calendar feed published by the scraper alongside events.json.
export const FEED_ICS_URL =
  (import.meta as any).env?.VITE_ICS_URL ||
  "https://raw.githubusercontent.com/pharmers961/Orch-NYC/data/sproutscout.ics";

// City centroids for the map view (venue lookup below wins when it matches).
export const CITY_COORDS: Record<string, [number, number]> = {
  "Walnut Creek": [37.9101, -122.0652],
  "Concord": [37.9779, -122.0311],
  "Pleasant Hill": [37.948, -122.0608],
  "Danville": [37.8216, -121.9999],
  "Lafayette": [37.8858, -122.118],
  "Moraga": [37.8349, -122.1297],
  "Orinda": [37.8771, -122.1802],
  "San Ramon": [37.7799, -121.978],
  "Martinez": [38.0194, -122.1341],
  "Clayton": [37.941, -121.9358],
  "Day Trip": [37.8044, -122.2712],
  "Other": [37.9101, -122.0652],
};

export const VENUE_COORDS: Record<string, [number, number]> = {
  "Lesher Center for the Arts": [37.902, -122.0637],
  "Lindsay Wildlife Experience": [37.9089, -122.0724],
  "Civic Park": [37.9068, -122.0602],
  "Heather Farm Park": [37.9219, -122.0331],
  "Broadway Plaza": [37.8966, -122.0585],
  "Lakeshore Learning": [37.8971, -122.0619],
  "Barnes & Noble, Walnut Creek": [37.8946, -122.0616],
  "Todos Santos Plaza": [37.978, -122.0311],
  "The Veranda": [37.9713, -122.0555],
  "Pixieland Amusement Park": [37.9861, -122.055],
  "Moraga Commons Park": [37.842, -122.114],
  "Livorna Park, Alamo": [37.834, -122.03],
  "Central Park Amphitheater, San Ramon": [37.7646, -121.954],
  "Oak Hill Park": [37.802, -121.991],
  "Forest Home Farms": [37.7405, -121.944],
  "City Center Bishop Ranch": [37.7625, -121.952],
  "Orinda Community Center Park": [37.88, -122.169],
  "Pleasant Hill City Hall": [37.9439, -122.0723],
  "Pleasant Hill City Hall Lawn": [37.9439, -122.0723],
};

export const SEED_VENUE_AREAS: Record<string, string> = {
  "Lesher Center for the Arts": "Walnut Creek",
  "Lindsay Wildlife Experience": "Walnut Creek",
  "Civic Park": "Walnut Creek",
  "Heather Farm Park": "Walnut Creek",
  "Broadway Plaza": "Walnut Creek",
  "Todos Santos Plaza": "Concord",
  "The Veranda": "Concord",
  "Pixieland Amusement Park": "Concord",
  "Moraga Commons Park": "Moraga",
  "Danville Town Green": "Danville",
  "Forest Home Farms": "San Ramon",
  "City Center Bishop Ranch": "San Ramon",
};
