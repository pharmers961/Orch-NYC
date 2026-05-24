import { EventCategory } from "../types";

export const CATEGORIES: { id: EventCategory; label: string; emoji: string; color: string }[] = [
  { id: "concerts", label: "Concerts", emoji: "🎤", color: "#0071e3" },
  { id: "broadway", label: "Broadway & Theater", emoji: "🎭", color: "#00a17a" },
  { id: "classical", label: "Classical & Opera", emoji: "🎻", color: "#5e5ce6" },
  { id: "sports", label: "Sports", emoji: "🏟️", color: "#ff9f0a" },
  { id: "arts", label: "Arts & Exhibits", emoji: "🖼️", color: "#d4358b" },
  { id: "dance", label: "Dance", emoji: "🩰", color: "#ff6482" },
  { id: "talks", label: "Talks & Ideas", emoji: "🎙️", color: "#30b0c7" },
  { id: "other", label: "Other & Custom", emoji: "✨", color: "#8e8e93" },
];

// All category ids — single source of truth for "everything selected".
export const ALL_CATEGORY_IDS: EventCategory[] = CATEGORIES.map((c) => c.id);

export const NYC_BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

export const SEED_VENUE_AREAS: Record<string, string> = {
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
