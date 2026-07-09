import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Concert } from "@/data/concerts";
import { isKnownVenue } from "@/lib/venues";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Los venues vienen de datos scrapeados: siempre escapados antes de inyectar
// en el HTML del DivIcon.
function concertIcon(concert: Concert, active: boolean): L.DivIcon {
  const showVenue = isKnownVenue(concert.venue);
  const label = showVenue
    ? `<div class="concert-pin-label">${escapeHtml(concert.venue)}</div>`
    : "";
  const size = active ? 36 : 28;
  return new L.DivIcon({
    className: "",
    html: `<div class="concert-pin-wrap" style="--pin-half:${size / 2}px"><div class="concert-pin${active ? " concert-pin--active" : ""}"><span></span></div>${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const DEFAULT_CENTER: [number, number] = [-34.6037, -58.3816];
const DEFAULT_ZOOM = 12;

function FlyTo({ concert }: { concert: Concert | null }) {
  const map = useMap();
  useEffect(() => {
    if (concert) {
      map.flyTo([concert.lat, concert.lng], 14, { duration: 0.8 });
    } else {
      map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.8 });
    }
  }, [concert, map]);
  return null;
}

type Props = {
  concerts: Concert[];
  selectedId: string | null;
  onSelect: (c: Concert) => void;
};

export function ConcertMap({ concerts, selectedId, onSelect }: Props) {
  const selected = concerts.find((c) => c.id === selectedId) ?? null;

  return (
    <MapContainer
      center={[-34.6037, -58.3816]}
      zoom={12}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
      className="z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {concerts.map((c) => (
        <Marker
          key={c.id}
          position={[c.lat, c.lng]}
          icon={concertIcon(c, c.id === selectedId)}
          eventHandlers={{ click: () => onSelect(c) }}
        />
      ))}
      <FlyTo concert={selected} />
    </MapContainer>
  );
}
