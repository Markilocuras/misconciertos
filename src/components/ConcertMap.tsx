import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatConcertDate, type Concert } from "@/data/concerts";
import { isKnownVenue } from "@/lib/venues";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Varios conciertos comparten venue (y por lo tanto coordenada exacta, que sale
// de la tabla VENUE_COORDS del ingest): sin agrupar, los pines se tapan entre sí.
type Group = {
  key: string;
  lat: number;
  lng: number;
  concerts: Concert[];
};

function groupByLocation(concerts: Concert[]): Group[] {
  const groups = new Map<string, Group>();
  for (const c of concerts) {
    const key = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
    const existing = groups.get(key);
    if (existing) existing.concerts.push(c);
    else groups.set(key, { key, lat: c.lat, lng: c.lng, concerts: [c] });
  }
  for (const g of groups.values()) {
    g.concerts.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  }
  return [...groups.values()];
}

// Los venues vienen de datos scrapeados: siempre escapados antes de inyectar
// en el HTML del DivIcon.
function groupIcon(group: Group, active: boolean): L.DivIcon {
  const venue = group.concerts[0].venue;
  const label = isKnownVenue(venue)
    ? `<div class="concert-pin-label">${escapeHtml(venue)}</div>`
    : "";
  // Todos los pines se ven igual, agrupen uno o veinte conciertos: cuántos hay
  // lo dice el mini menú al abrirlo.
  const size = active ? 36 : 28;
  const cls = `concert-pin${active ? " concert-pin--active" : ""}`;
  return new L.DivIcon({
    className: "",
    html: `<div class="concert-pin-wrap" style="--pin-half:${size / 2}px"><div class="${cls}"><span></span></div>${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const DEFAULT_CENTER: [number, number] = [-34.6037, -58.3816];
const DEFAULT_ZOOM = 12;
const FOCUS_ZOOM = 14;

// Centra el mapa dejando el punto `offsetY` píxeles por debajo del centro, para
// hacerle lugar arriba a lo que se abra anclado al pin.
function flyToPin(map: L.Map, lat: number, lng: number, zoom: number, offsetY = 0) {
  const point = map.project([lat, lng], zoom).subtract([0, offsetY]);
  map.flyTo(map.unproject(point, zoom), zoom, { duration: 0.6 });
}

function FlyTo({ concert }: { concert: Concert | null }) {
  const map = useMap();

  useEffect(() => {
    // Al abrirse el panel de la derecha el contenedor se achica, pero Leaflet
    // cachea su tamaño: sin refrescarlo centra contra el ancho viejo y el pin
    // termina corrido, medio tapado por el panel.
    map.invalidateSize({ animate: false, pan: false });
    if (concert) {
      flyToPin(map, concert.lat, concert.lng, FOCUS_ZOOM);
    } else {
      map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.8 });
    }
  }, [concert, map]);

  // Redimensionar la ventana también invalida el tamaño cacheado.
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  return null;
}

function GroupList({ group, onSelect }: { group: Group; onSelect: (c: Concert) => void }) {
  const map = useMap();
  return (
    <div className="max-h-72 w-60 overflow-y-auto p-1">
      <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {group.concerts.length} conciertos acá
      </p>
      {group.concerts.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => {
            map.closePopup();
            onSelect(c);
          }}
          className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-left transition hover:bg-accent"
        >
          <span className="text-sm font-medium text-foreground">{c.artist || c.title}</span>
          <span className="text-xs capitalize text-muted-foreground">
            {formatConcertDate(c.date)}
            {c.time ? ` · ${c.time}` : ""}
          </span>
        </button>
      ))}
    </div>
  );
}

function GroupMarkers({
  groups,
  selectedId,
  onSelect,
}: {
  groups: Group[];
  selectedId: string | null;
  onSelect: (c: Concert) => void;
}) {
  const map = useMap();

  return (
    <>
      {groups.map((g) => {
        const active = g.concerts.some((c) => c.id === selectedId);
        const icon = groupIcon(g, active);
        // Con un solo concierto el pin abre la ficha derecho; con varios abre el
        // mini menú (el Popup de Leaflet se abre solo al clickear el marker).
        if (g.concerts.length === 1) {
          const c = g.concerts[0];
          return (
            <Marker
              key={g.key}
              position={[g.lat, g.lng]}
              icon={icon}
              eventHandlers={{ click: () => onSelect(c) }}
            />
          );
        }
        return (
          <Marker
            key={g.key}
            position={[g.lat, g.lng]}
            icon={icon}
            eventHandlers={{
              // El globo crece hacia arriba del pin, así que centramos el pin
              // algo por debajo del medio; si no, en los pines de la mitad
              // superior el menú se abre fuera de la pantalla y queda cortado.
              click: () =>
                flyToPin(map, g.lat, g.lng, map.getZoom(), Math.min(140, map.getSize().y * 0.22)),
            }}
          >
            <Popup
              className="concert-popup"
              closeButton={false}
              autoPan={false}
              minWidth={240}
              maxWidth={240}
            >
              <GroupList group={g} onSelect={onSelect} />
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

type Props = {
  concerts: Concert[];
  selectedId: string | null;
  onSelect: (c: Concert) => void;
};

export function ConcertMap({ concerts, selectedId, onSelect }: Props) {
  const selected = concerts.find((c) => c.id === selectedId) ?? null;
  const groups = useMemo(() => groupByLocation(concerts), [concerts]);

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
      className="z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <GroupMarkers groups={groups} selectedId={selectedId} onSelect={onSelect} />
      <FlyTo concert={selected} />
    </MapContainer>
  );
}
