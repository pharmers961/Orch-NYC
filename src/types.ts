/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type EventCategory = "classical" | "broadway" | "concerts" | "sports" | "other";

export interface EventItem {
  id: string; // unique ID
  title: string;
  artist: string;
  venue: string;
  area: string;
  cat: EventCategory;
  price: string;
  start: string; // ISO String (or date string)
  end?: string;  // Optional end ISO String
  desc?: string; // Optional description
  ticketUrl: string;
  image: string;
  status?: string; // e.g. 'onsale', 'cancelled', 'offsale', etc.
  source: string; // Source portal or site URL (e.g., Ticketmaster, wnyc.org, carnegiehall.org)
  provider: "Ticketmaster" | "Gemini" | "SerpApi" | "Manual";
  added: number; // timestamp
  tags?: string[]; // Optional user/parsing tags
}

export interface AppState {
  events: EventItem[];
  savedIds: string[];
  theme: "light" | "dark" | "system";
  ticketmasterKey: string;
  geminiKey: string;
  autoRefresh: boolean;
  selectedSources: string[];
  selectedVenues: string[];
  selectedCategories: EventCategory[];
  dateFilter: "all" | "today" | "weekend" | "week" | "month";
  searchQuery: string;
  savedOnly: boolean;
  viewMode: "list" | "calendar";
  sortBy: "soonest" | "lowestPrice" | "recentlyAdded";
  userSources: string[]; // List of user added URLs
  customVenueColors: Record<string, string>; // venue name -> hex color
}
