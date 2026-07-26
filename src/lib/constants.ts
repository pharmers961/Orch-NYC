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

// Central Contra Costa cities covered by the feed (Alamo rolls up under Danville).
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
  "Other",
];

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
