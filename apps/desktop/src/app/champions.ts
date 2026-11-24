/** The Hall of Champions: undisputed and classical world champions, numbered in order. */
export type Champion = { no: number; name: string; since: number; portrait?: string };

const NAMES: ReadonlyArray<[string, number]> = [
  ["Wilhelm Steinitz", 1886],
  ["Emanuel Lasker", 1894],
  ["José Raúl Capablanca", 1921],
  ["Alexander Alekhine", 1927],
  ["Max Euwe", 1935],
  ["Mikhail Botvinnik", 1948],
  ["Vasily Smyslov", 1957],
  ["Mikhail Tal", 1960],
  ["Tigran Petrosian", 1963],
  ["Boris Spassky", 1969],
  ["Bobby Fischer", 1972],
  ["Anatoly Karpov", 1975],
  ["Garry Kasparov", 1985],
  ["Vladimir Kramnik", 2000],
  ["Viswanathan Anand", 2007],
  ["Magnus Carlsen", 2013],
  ["Ding Liren", 2023],
  ["Gukesh Dommaraju", 2024],
];

// Halftone portraits are made offline by scripts/halftone.py as src/assets/champions/NN.webp.
const portraits = import.meta.glob<string>("../assets/champions/*.webp", {
  eager: true,
  import: "default",
});

export const CHAMPIONS: readonly Champion[] = NAMES.map(([name, since], i) => {
  const no = i + 1;
  const file = `../assets/champions/${String(no).padStart(2, "0")}.webp`;
  return { no, name, since, portrait: portraits[file] };
});
