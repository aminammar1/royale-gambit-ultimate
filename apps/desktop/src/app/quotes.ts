import { CHAMPIONS, type Champion } from "./champions";

/**
 * Quotations from the world champions, as they are commonly attributed in chess literature.
 * `no` is the champion's number in the Hall (champions.ts). Keep each one short enough to set
 * in two or three lines; add only quotes with a known attribution, never invented ones.
 */
const QUOTES: ReadonlyArray<{ no: number; text: string }> = [
  { no: 1, text: "The king is a fighting piece. Use it!" },
  { no: 2, text: "When you see a good move, look for a better one." },
  { no: 2, text: "On the chessboard, lies and hypocrisy do not survive long." },
  { no: 3, text: "In order to improve your game, you must study the endgame before everything else." },
  { no: 3, text: "You may learn much more from a game you lose than from a game you win." },
  { no: 4, text: "During a chess competition a chess master should be a combination of a beast of prey and a monk." },
  { no: 5, text: "Strategy requires thought, tactics require observation." },
  { no: 6, text: "Chess is the art of analysis." },
  {
    no: 8,
    text: "You must take your opponent into a deep dark forest where 2 + 2 = 5, and the path leading out is only wide enough for one.",
  },
  { no: 11, text: "I don’t believe in psychology. I believe in good moves." },
  { no: 11, text: "Chess is life." },
  { no: 12, text: "Chess is everything: art, science and sport." },
  { no: 13, text: "Chess is mental torture." },
  {
    no: 16,
    text: "Some people think that if their opponent plays a beautiful game, it’s OK to lose. I don’t. You have to be merciless.",
  },
];

export type Quote = { text: string; champion: Champion };

export const CHAMPION_QUOTES: readonly Quote[] = QUOTES.map(({ no, text }) => ({
  text,
  champion: CHAMPIONS[no - 1],
}));
