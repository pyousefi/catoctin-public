export const albums = [
  {
    year: 2026,
    label: "One more summer to remember",
    dates: "September 4–7, 2026",
  },
  {
    year: 2025,
    label: "Back together in the mountains",
  },
  {
    year: 2024,
    label: "Good company. Great memories.",
  },
  {
    year: 2010,
    label: "A little trip down memory lane",
  },
] as const;
export type CampYear = (typeof albums)[number]["year"];
export const years = albums.map((album) => album.year);
