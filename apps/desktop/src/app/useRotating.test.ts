// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRotating } from "./useRotating";

describe("useRotating", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("steps on its own and wraps around", () => {
    const { result } = renderHook(() => useRotating(3, 1000));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.index).toBe(1);
    act(() => vi.advanceTimersByTime(1000));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.index).toBe(0);
  });

  it("holds while hovered and stops when paused", () => {
    const { result } = renderHook(() => useRotating(3, 1000));
    act(() => result.current.hold.onMouseEnter());
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.index).toBe(0);
    act(() => result.current.hold.onMouseLeave());
    act(() => result.current.togglePaused());
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.index).toBe(0);
  });

  it("restarts the clock after a manual step", () => {
    const { result } = renderHook(() => useRotating(5, 1000));
    act(() => vi.advanceTimersByTime(900));
    act(() => result.current.step(-1));
    expect(result.current.index).toBe(4);
    act(() => vi.advanceTimersByTime(900));
    expect(result.current.index).toBe(4);
  });
});
