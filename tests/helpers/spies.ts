import { type Mock, vi } from "vitest";

/** Any callback a spy can stand in for. */
type Callback = (...args: never[]) => unknown;

/** A callback that records its calls and runs `answer`, or returns nothing without one. */
export function spy<F extends Callback = () => void>(answer?: F): Mock<F> {
  return vi.fn(answer);
}

/** A listener of one value that records each value it hears. */
export function listener(): Mock<(value: unknown) => void> {
  return spy<(value: unknown) => void>();
}
