/** A fit check for compact chips whose room a test sets, as the badge renderer's `overflows`. */
export interface FakeFit {
  /** Whether the group holds more kind chips than fit whole. */
  readonly overflows: (group: Element) => boolean;
  /** Lets `count` kind chips fit whole; every count fits until a test calls it. */
  room(count: number): void;
}

export function fakeFit(): FakeFit {
  let room = Number.POSITIVE_INFINITY;
  return {
    overflows: (group) => group.querySelectorAll("[data-tks-kind]").length > room,
    room(count) {
      room = count;
    },
  };
}
