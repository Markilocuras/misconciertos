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
