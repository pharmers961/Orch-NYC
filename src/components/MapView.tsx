import { useEffect, useRef } from "react";
import L from "leaflet";
import { EventItem } from "../types";
import { CITY_COORDS, VENUE_COORDS } from "../lib/constants";
import { getCity, getCategoryEmoji, localDateKey } from "../lib/events";

// Resolve an event to map coordinates: exact venue match first, then a
// stable jittered spot around its city centroid so co-located venues fan out
// instead of stacking.
function coordsFor(venue: string, area: string): [number, number] {
  const exact = VENUE_COORDS[venue];
  if (exact) return exact;
  const partial = Object.keys(VENUE_COORDS).find((k) => venue && (k.includes(venue) || venue.includes(k.split(",")[0])));
  if (partial) return VENUE_COORDS[partial];
  const city = getCity(area, venue);
  const [lat, lng] = CITY_COORDS[city] || CITY_COORDS["Walnut Creek"];
  // Deterministic jitter from the venue name (±~400m) so pins don't overlap.
  let h = 0;
  for (const ch of venue || "x") h = (h * 31 + ch.charCodeAt(0)) % 997;
  return [lat + ((h % 21) - 10) * 0.0004, lng + ((Math.floor(h / 21) % 21) - 10) * 0.0005];
}

export function MapView({
  events,
  onSelectEvent,
}: {
  events: EventItem[];
  onSelectEvent: (id: string) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { scrollWheelZoom: true }).setView([37.9, -122.03], 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    // One pin per venue, listing that venue's upcoming events.
    const byVenue = new Map<string, EventItem[]>();
    events.forEach((e) => {
      const k = e.venue || "Venue TBD";
      if (!byVenue.has(k)) byVenue.set(k, []);
      byVenue.get(k)!.push(e);
    });

    byVenue.forEach((list, venue) => {
      list.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      const [lat, lng] = coordsFor(venue, list[0].area);
      const emoji = getCategoryEmoji(list[0].cat);
      const icon = L.divIcon({
        className: "",
        html: `<div class="ss-pin">${emoji}${list.length > 1 ? `<span class="ss-pin-count">${list.length}</span>` : ""}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 30],
      });
      const items = list
        .slice(0, 6)
        .map((e) => {
          const d = new Date(e.start);
          const when = `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
          return `<button class="ss-popup-item" data-evid="${e.id}">${getCategoryEmoji(e.cat)} <b>${e.title.replace(/</g, "&lt;")}</b><br/><span>${when}${/free/i.test(e.price) ? " · Free" : ""}</span></button>`;
        })
        .join("");
      const more = list.length > 6 ? `<div class="ss-popup-more">+${list.length - 6} more here</div>` : "";
      const marker = L.marker([lat, lng], { icon }).bindPopup(
        `<div class="ss-popup"><div class="ss-popup-venue">${venue.replace(/</g, "&lt;")}</div>${items}${more}</div>`,
        { maxWidth: 280 }
      );
      marker.on("popupopen", (ev: any) => {
        ev.popup.getElement()?.querySelectorAll("[data-evid]").forEach((el: Element) => {
          el.addEventListener("click", () => onSelectEvent((el as HTMLElement).dataset.evid!));
        });
      });
      layer.addLayer(marker);
    });

    // Refresh sizing when the view becomes visible (grid layout mounts hidden).
    setTimeout(() => map.invalidateSize(), 50);
  }, [events, onSelectEvent]);

  const todayCount = events.filter((e) => localDateKey(new Date(e.start)) === localDateKey(new Date())).length;

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200/60 dark:border-zinc-800 shadow-sm relative">
      <div ref={divRef} className="h-[65vh] min-h-[420px] w-full z-0" />
      <div className="absolute top-3 right-3 z-[400] bg-white/90 dark:bg-zinc-950/90 backdrop-blur px-3 py-1.5 rounded-full text-xs font-semibold text-slate-700 dark:text-zinc-300 border border-slate-200/60 dark:border-zinc-800 shadow-sm">
        {events.length} events · {todayCount} today
      </div>
    </div>
  );
}
