// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { START_FEN } from "../../chess/game";
import { ThemedBoard } from "./ThemedBoard";

// An 800px board at the window's corner: each square is 100px, a1's centre at (50, 750).
const at = (square: string) => ({
  clientX: (square.charCodeAt(0) - 97) * 100 + 50,
  clientY: (8 - Number(square[1])) * 100 + 50,
});

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 800,
    height: 800,
    right: 800,
    bottom: 800,
    toJSON: () => ({}),
  });
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const board = () => screen.getByRole("group", { name: "Board" });
const down = (square: string) => fireEvent.pointerDown(board(), { ...at(square), button: 0, pointerId: 1 });
const move = (square: string) => fireEvent.pointerMove(board(), { ...at(square), pointerId: 1 });
const up = (square: string) => fireEvent.pointerUp(board(), { ...at(square), button: 0, pointerId: 1 });

describe("the board", () => {
  it("draws the thirty-two pieces of the start", () => {
    const { container } = render(
      <ThemedBoard fen={START_FEN} orientation="white" onMove={() => false} label="Board" />,
    );
    expect(container.querySelectorAll("[data-piece]")).toHaveLength(32);
  });

  it("pressing a piece of the side to move picks it at once", () => {
    const onPick = vi.fn();
    render(<ThemedBoard fen={START_FEN} orientation="white" onMove={() => false} onPick={onPick} label="Board" />);
    down("e2");
    expect(onPick).toHaveBeenLastCalledWith("e2");
  });

  it("a piece of the other side, or an empty square, drops the pick", () => {
    const onPick = vi.fn();
    render(<ThemedBoard fen={START_FEN} orientation="white" onMove={() => false} onPick={onPick} label="Board" />);
    down("e7");
    expect(onPick).toHaveBeenLastCalledWith(undefined);
  });

  it("with a piece picked, pressing one of its squares plays there", () => {
    const onMove = vi.fn(() => true);
    render(
      <ThemedBoard
        fen={START_FEN}
        orientation="white"
        onMove={onMove}
        selected="e2"
        targets={[{ square: "e4", capture: false }]}
        label="Board"
      />,
    );
    down("e4");
    expect(onMove).toHaveBeenCalledWith("e2", "e4", "click");
  });

  it("pressing the picked piece again puts it down", () => {
    const onPick = vi.fn();
    render(
      <ThemedBoard
        fen={START_FEN}
        orientation="white"
        onMove={() => false}
        onPick={onPick}
        selected="e2"
        label="Board"
      />,
    );
    down("e2");
    up("e2");
    expect(onPick).toHaveBeenLastCalledWith(undefined);
  });

  it("dragging a piece to a square plays the move as a drop", () => {
    const onMove = vi.fn(() => true);
    render(<ThemedBoard fen={START_FEN} orientation="white" onMove={onMove} onPick={() => {}} label="Board" />);
    down("e2");
    act(() => void move("e3"));
    act(() => void move("e4"));
    up("e4");
    expect(onMove).toHaveBeenCalledWith("e2", "e4", "drop");
  });

  it("a flipped board reads squares from Black's side", () => {
    const onPick = vi.fn();
    const black = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    render(<ThemedBoard fen={black} orientation="black" onMove={() => false} onPick={onPick} label="Board" />);
    // On a flipped board, Black's e7 pawn sits where White's d2 would be.
    down("d2");
    expect(onPick).toHaveBeenLastCalledWith("e7");
  });

  it("a preview board does not pick anything up", () => {
    const onPick = vi.fn();
    render(
      <ThemedBoard
        fen={START_FEN}
        orientation="white"
        onMove={() => false}
        onPick={onPick}
        interactive={false}
        label="Board"
      />,
    );
    down("e2");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("the right button draws an arrow; drawing it again takes it away; a left press wipes them", () => {
    const { container } = render(
      <ThemedBoard fen={START_FEN} orientation="white" onMove={() => false} onPick={() => {}} label="Board" />,
    );
    const right = (kind: "pointerDown" | "pointerMove" | "pointerUp", square: string) =>
      fireEvent[kind](board(), { ...at(square), button: 2, pointerId: 2 });
    const arrows = () => container.querySelectorAll("[data-drawings] polyline").length;
    right("pointerDown", "g1");
    right("pointerMove", "f3");
    right("pointerUp", "f3");
    // A knight's arrow: an ink shaft over its paper casing, bent once.
    expect(arrows()).toBe(2);
    expect(container.querySelector("[data-drawings] polyline")?.getAttribute("points")?.split(" ")).toHaveLength(3);
    right("pointerDown", "g1");
    right("pointerUp", "f3");
    expect(arrows()).toBe(0);
    // A right click on one square fills it with the marking colour.
    right("pointerDown", "e4");
    right("pointerUp", "e4");
    const marked = () => [...container.querySelectorAll("[data-marked]")].map((e) => e.getAttribute("data-square"));
    expect(marked()).toEqual(["e4"]);
    down("a3");
    expect(marked()).toEqual([]);
  });
});
