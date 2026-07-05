export type Concert = {
  id: string;
  title: string;
  artist: string;
  venue: string;
  date: string; // ISO yyyy-mm-dd
  time: string;
  price: string;
  description: string;
  image: string;
  lat: number;
  lng: number;
  buyUrl: string;
  source?: string;
};

// Mock concerts in Buenos Aires. Replace with API data when ready.
export const concerts: Concert[] = [
  {
    id: "1",
    title: "Noche Eléctrica",
    artist: "Los Cósmicos",
    venue: "Niceto Club",
    date: "2026-05-22",
    time: "21:00",
    price: "ARS 15.000",
    description: "Indie rock porteño con visuales en vivo.",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800",
    lat: -34.5862,
    lng: -58.4378,
    buyUrl: "https://example.com/tickets/1",
  },
  {
    id: "2",
    title: "Tango Reimaginado",
    artist: "Quinteto Astor",
    venue: "Usina del Arte",
    date: "2026-05-24",
    time: "20:30",
    price: "ARS 12.000",
    description: "Tango contemporáneo en La Boca.",
    image: "https://images.unsplash.com/photo-1535930891776-0c2dfb7fda1a?w=800",
    lat: -34.6345,
    lng: -58.3597,
    buyUrl: "https://example.com/tickets/2",
  },
  {
    id: "3",
    title: "Festival Electrónico",
    artist: "DJ Mendoza",
    venue: "Mandarine Park",
    date: "2026-05-30",
    time: "23:00",
    price: "ARS 25.000",
    description: "Open air toda la noche junto al río.",
    image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800",
    lat: -34.5453,
    lng: -58.4361,
    buyUrl: "https://example.com/tickets/3",
  },
  {
    id: "4",
    title: "Rock Nacional",
    artist: "Las Pampas",
    venue: "Teatro Vorterix",
    date: "2026-06-05",
    time: "21:30",
    price: "ARS 18.000",
    description: "Clásicos del rock argentino en vivo.",
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800",
    lat: -34.5733,
    lng: -58.4503,
    buyUrl: "https://example.com/tickets/4",
  },
  {
    id: "5",
    title: "Jazz en Palermo",
    artist: "Trío Bohemio",
    venue: "Bebop Club",
    date: "2026-05-22",
    time: "22:00",
    price: "ARS 10.000",
    description: "Jazz íntimo con tragos de autor.",
    image: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=800",
    lat: -34.5889,
    lng: -58.4298,
    buyUrl: "https://example.com/tickets/5",
  },
  {
    id: "6",
    title: "Cumbia Total",
    artist: "Los del Barrio",
    venue: "Estadio Obras",
    date: "2026-06-12",
    time: "22:00",
    price: "ARS 14.000",
    description: "La mejor cumbia para bailar toda la noche.",
    image: "https://images.unsplash.com/photo-1574391884720-bbc049ec09ad?w=800",
    lat: -34.5456,
    lng: -58.4495,
    buyUrl: "https://example.com/tickets/6",
  },
];
