import { describe, expect, it } from "vitest";
import {
  START_FEN,
  fenAt,
  inCheck,
  isPromotion,
  kingSquare,
  load,
  moveNumberLabel,
  newGame,
  numberedLine,
  play,
  pvToSan,
  toPgn,
  ucisUpTo,
  type Game,
} from "./game";
import { formatScore, whiteWinPercent } from "./score";
import operaGame from "../../../../contracts/fixtures/pgn/opera-game.pgn?raw";
import rulesTour from "../../../../contracts/fixtures/pgn/rules-tour.pgn?raw";


const fixtures: Record<string, string> = { "opera-game.pgn": operaGame, "rules-tour.pgn": rulesTour };
const fixture = (name: string) => fixtures[name];

function playAll(game: Game, ucis: string[]): Game {
  return ucis.reduce<Game>((g, u) => {
    const next = play(g, g.plies.length, u.slice(0, 2), u.slice(2, 4), u[4]);
    if (!next) throw new Error(`illegal ${u}`);
    return next;
  }, game);
}

describe("the shared PGN fixtures", () => {
  it.each([
    ["opera-game.pgn", "1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17"],
    ["rules-tour.pgn", "r1br2k1/5pp1/p1nb1n1p/4p3/2p5/2NPBN2/PPPQ1PPP/2KR3R b - - 1 12"],
  ])("%s ends where its README says, and survives a PGN round trip", (file, finalFen) => {
    const loaded = load(fixture(file));
    if (!loaded.ok) throw new Error(loaded.error);
    const g = loaded.game;
    expect(fenAt(g, g.plies.length)).toBe(finalFen);
    const again = load(toPgn(g));
    if (!again.ok) throw new Error(again.error);
    expect(again.game.plies.map((p) => p.san)).toEqual(g.plies.map((p) => p.san));
    expect(again.game.headers.White).toBe(g.headers.White);
  });
});

describe("play", () => {
  it("speaks UCI and SAN for every special move", () => {
    const castle = playAll(newGame("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), ["e1g1", "e8c8"]);
    expect(castle.plies.map((p) => [p.san, p.uci])).toEqual([
      ["O-O", "e1g1"],
      ["O-O-O", "e8c8"],
    ]);
    const ep = playAll(newGame("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"), ["e5d6"]);
    expect(ep.plies[0].san).toBe("exd6");
    const promo = playAll(newGame("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1"), ["b7b8n"]);
    expect(promo.plies[0]).toMatchObject({ san: "b8=N", uci: "b7b8n" });
  });

  it("refuses an illegal move and leaves the game as it was", () => {
    const g = newGame();
    expect(play(g, 0, "e2", "e5")).toBeUndefined();
    expect(g.plies).toHaveLength(0);
  });

  it("replaces what came after the cursor, like crossing out on a score sheet", () => {
    const g = playAll(newGame(), ["e2e4", "e7e5", "g1f3"]);
    const changed = play(g, 1, "c7", "c5");
    expect(changed?.plies.map((p) => p.san)).toEqual(["e4", "c5"]);
    expect(ucisUpTo(g, 2)).toEqual(["e2e4", "e7e5"]);
  });

  it("knows a promotion when it sees one", () => {
    expect(isPromotion("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1", "b7", "b8")).toBe(true);
    expect(isPromotion(START_FEN, "e2", "e4")).toBe(false);
  });
});

describe("load", () => {
  it("reads a FEN, refuses nonsense, and reads a PGN that starts from a FEN", () => {
    const fen = load("4k3/8/8/8/8/8/8/R3K3 w - - 0 1");
    expect(fen.ok && fen.game.startFen).toBe("4k3/8/8/8/8/8/8/R3K3 w - - 0 1");
    expect(load("").ok).toBe(false);
    expect(load("hello there").ok).toBe(false);
    expect(load("4k3/8/8/8/8/8/8/R3K3 w - - 0").ok).toBe(false);
    const setUp = load('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/R3K3 w - - 0 1"]\n\n1. Ra8+ *');
    if (!setUp.ok) throw new Error(setUp.error);
    expect(setUp.game.startFen).toBe("4k3/8/8/8/8/8/8/R3K3 w - - 0 1");
    expect(setUp.game.plies[0].san).toBe("Ra8+");
    expect(toPgn(setUp.game)).toContain('[FEN "4k3/8/8/8/8/8/8/R3K3 w - - 0 1"]');
  });
});

describe("engine lines", () => {
  it("turns UCI into SAN, castling included, and stops at the first illegal move", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
    expect(pvToSan(fen, ["e1g1", "g8f6", "d2d3"])).toEqual(["O-O", "Nf6", "d3"]);
    expect(pvToSan(fen, ["e1g1", "e1g1"])).toEqual(["O-O"]);
  });

  it("numbers a line from White or from Black", () => {
    expect(numberedLine("8 w - - 0 20", ["Nxe4", "Rxe4", "Bxe4"])).toBe("20. Nxe4 Rxe4 21. Bxe4");
    expect(numberedLine("8 b - - 0 19", ["Nxe4", "Qd2", "Nf6"])).toBe("19… Nxe4 20. Qd2 Nf6");
    expect(moveNumberLabel(START_FEN)).toBe("1.");
    expect(moveNumberLabel("8 b - - 0 19")).toBe("19…");
  });

  it("finds check and the king in check", () => {
    const mated = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
    expect(inCheck(mated)).toBe(true);
    expect(kingSquare(mated, "w")).toBe("e1");
    expect(inCheck(START_FEN)).toBe(false);
  });
});

describe("scores", () => {
  it("print as the design says, with a true minus sign", () => {
    expect(formatScore({ cp: 124 })).toBe("+1.24");
    expect(formatScore({ cp: -80 })).toBe("−0.80");
    expect(formatScore({ cp: 0 })).toBe("0.00");
    expect(formatScore({ mate: 5 })).toBe("#5");
    expect(formatScore({ mate: -3 })).toBe("#−3");
  });

  it("fill the bar from White's chances", () => {
    expect(whiteWinPercent({ cp: 0 })).toBe(50);
    expect(whiteWinPercent({ cp: 300 })).toBeGreaterThan(75);
    expect(whiteWinPercent({ cp: -300 })).toBeLessThan(25);
    expect(whiteWinPercent({ cp: 5000 })).toBe(whiteWinPercent({ cp: 1000 }));
    expect(whiteWinPercent({ mate: 2 })).toBe(100);
    expect(whiteWinPercent({ mate: -2 })).toBe(0);
  });
});
