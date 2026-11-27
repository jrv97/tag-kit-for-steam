import { describe, expect, it } from "vitest";
import { fake } from "../../tests/helpers/fakes";
import { framePhases } from "./dom";

describe("framePhases", () => {
  it("runs the reads queued for a frame before any write they return", () => {
    const frames = fake.queue();
    const phases = framePhases(frames.frame);
    const steps: unknown[] = [];
    const passes = Array.from({ length: 2 }, () => {
      const write = () => steps.push(write);
      const read = () => {
        steps.push(read);
        return write;
      };
      return { read, write };
    });
    for (const { read } of passes) {
      phases.read(read);
    }
    expect(frames.size).toBe(1);
    frames.run();
    expect(steps).toStrictEqual([
      ...passes.map((each) => each.read),
      ...passes.map((each) => each.write),
    ]);
  });

  it("leaves a read queued during a pass for the next frame", () => {
    const frames = fake.queue();
    const phases = framePhases(frames.frame);
    const later = fake.spy(() => undefined);
    phases.read(() => () => {
      phases.read(later);
    });
    frames.run();
    expect(later).not.toHaveBeenCalled();
    frames.run();
    expect(later).toHaveBeenCalledTimes(1);
  });
});
