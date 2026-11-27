/** Boxes in viewport pixels as `getBoundingClientRect` reads them: x, y, width and height. */
const BOXES = {
  /** An image box with no size yet, or one in a hidden tab. */
  none: [0, 0, 0, 0],
  /** An image too small for a badge. */
  small: [0, 0, 120, 45],
  /** An image of the compact text tier. */
  textTier: [0, 0, 231, 87],
  /** A store deal label in the text tier image's top-left corner. */
  labelOnImage: [6, 6, 120.4, 19],
  /** The same label after a font swap made it wider. */
  labelWide: [6, 6, 150.6, 19],
  /** The same label in the image's top-right corner, as on a right-to-left page. */
  labelOnImageEnd: [104.6, 6, 120.4, 19],
  /** A label under the image. */
  labelBelow: [6, 90, 120, 19],
  /** A label beside the image, past its inline start. */
  labelBeside: [-130, 6, 120, 19],
} as const;

/** A fresh `DOMRect` of the named box. */
export function box(name: keyof typeof BOXES): DOMRect {
  const [x, y, width, height] = BOXES[name];
  return new DOMRect(x, y, width, height);
}
