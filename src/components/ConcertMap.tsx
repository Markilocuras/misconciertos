import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Concert } from "@/data/concerts";

// Fix default icon paths for bundlers
const icon = new L.DivIcon({
  className: "",
  html: `<div class="concert-pin"><span></span></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const activeIcon = new L.DivIcon({
  className: "",
  html: `<div class="concert-pin concert-pin--active"><span></span></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

function FlyTo({ concert }: { concert: Concert | null }) {
  const map = useMap();
  useEffect(() => {
    if (concert) map.flyTo([concert.lat, concert.lng], 14, { duration: 0.8 });
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
          icon={c.id === selectedId ? activeIcon : icon}
          eventHandlers={{ click: () => onSelect(c) }}
        />
      ))}
      <FlyTo concert={selected} />
    </MapContainer>
  );
}
