/** The Hall of Champions: undisputed and classical world champions, numbered in order. */
export type Champion = {
  no: number;
  name: string;
  /** The name chess players use: "Capablanca", "Ding", "Gukesh". */
  short: string;
  since: number;
  portrait?: string;
};

const NAMES: ReadonlyArray<[string, string, number]> = [
  ["Wilhelm Steinitz", "Steinitz", 1886],
  ["Emanuel Lasker", "Lasker", 1894],
  ["José Raúl Capablanca", "Capablanca", 1921],
  ["Alexander Alekhine", "Alekhine", 1927],
  ["Max Euwe", "Euwe", 1935],
  ["Mikhail Botvinnik", "Botvinnik", 1948],
  ["Vasily Smyslov", "Smyslov", 1957],
  ["Mikhail Tal", "Tal", 1960],
  ["Tigran Petrosian", "Petrosian", 1963],
  ["Boris Spassky", "Spassky", 1969],
  ["Bobby Fischer", "Fischer", 1972],
  ["Anatoly Karpov", "Karpov", 1975],
  ["Garry Kasparov", "Kasparov", 1985],
  ["Vladimir Kramnik", "Kramnik", 2000],
  ["Viswanathan Anand", "Anand", 2007],
  ["Magnus Carlsen", "Carlsen", 2013],
  ["Ding Liren", "Ding", 2023],
  ["Gukesh Dommaraju", "Gukesh", 2024],
];

// Halftone portraits are made offline by scripts/halftone.py as src/assets/champions/NN.webp.
const portraits = import.meta.glob<string>("../assets/champions/*.webp", {
  eager: true,
  import: "default",
});

export const CHAMPIONS: readonly Champion[] = NAMES.map(([name, short, since], i) => {
  const no = i + 1;
  const file = `../assets/champions/${String(no).padStart(2, "0")}.webp`;
  return { no, name, short, since, portrait: portraits[file] };
});

/** `count` champions in order, starting from one that changes each day: the front page's photo row. */
export function championsOfTheDay(date: Date, count: number): Champion[] {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return Array.from({ length: count }, (_, i) => CHAMPIONS[(day + i) % CHAMPIONS.length]);
}
