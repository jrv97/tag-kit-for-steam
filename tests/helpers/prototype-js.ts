/** A callback as Prototype.js's `Enumerable` calls it: the value and its index, no array. */
type Callback = (value: unknown, index: number) => unknown;

/** Each patch: the object, the property and the replacement Prototype.js 1.7 installs. */
const PATCHES: readonly (readonly [object, PropertyKey, unknown])[] = [
  // `Enumerable#toArray`: a copy of the values, not [index, value] pairs.
  [Array.prototype, "entries", function(this: readonly unknown[]) {
    return this.slice();
  }],
  // `Enumerable#collect` and `#all` call back with the value and its index only.
  [Array.prototype, "map", function(this: readonly unknown[], fn: Callback, self?: unknown) {
    const out: unknown[] = [];
    for (let index = 0; index < this.length; index++) {
      out.push(fn.call(self, this[index], index));
    }
    return out;
  }],
  [Array.prototype, "every", function(this: readonly unknown[], fn: Callback, self?: unknown) {
    for (let index = 0; index < this.length; index++) {
      const kept = Boolean(fn.call(self, this[index], index));
      if (!kept) {
        return false;
      }
    }
    return true;
  }],
  // `String#startsWith` and `#endsWith` take the pattern only.
  [String.prototype, "startsWith", function(this: string, pattern: string) {
    return this.lastIndexOf(pattern, 0) === 0;
  }],
  [String.prototype, "endsWith", function(this: string, pattern: string) {
    const at = this.length - pattern.length;
    return at >= 0 && this.indexOf(pattern, at) === at;
  }],
  // `Element#remove` reads the parent without a check, so a detached element throws.
  [HTMLElement.prototype, "remove", function(this: HTMLElement) {
    const parent = this.parentNode;
    if (parent === null) {
      throw new TypeError();
    }
    parent.removeChild(this);
  }],
];

/**
 * Patches the built-ins the way Prototype.js 1.7 does on Steam's store pages, as in the page's
 * own world. Returns the call that puts the originals back.
 */
export function prototypeJs(): () => void {
  const saved = PATCHES.map(([target, key, value]) => {
    const original = Reflect.getOwnPropertyDescriptor(target, key);
    Reflect.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
    return { target, key, original };
  });
  return () => {
    for (const { target, key, original } of saved) {
      if (original === undefined) {
        Reflect.deleteProperty(target, key);
      } else {
        Reflect.defineProperty(target, key, original);
      }
    }
  };
}
