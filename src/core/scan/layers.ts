// Store layers: elements that open a layer of their own over the page, such as the React hover
// card. A host inside a layer never joins a host or an image around it, and the reverse (ADR
// 0031). A new layer is a new entry in `LAYER_ATTRIBUTES`, never a scanner edit (rule 11).

/** The attributes that mark a layer's root. React hover cards mount a `div[popover]` per hover. */
const LAYER_ATTRIBUTES: readonly string[] = ["popover"];

/** Whether `element` is a layer's root: one attribute read per layer. */
export function opensLayer(element: Element): boolean {
  for (const attribute of LAYER_ATTRIBUTES) {
    if (element.hasAttribute(attribute)) {
      return true;
    }
  }
  return false;
}

/** The parent of `element` inside its layer: none above a layer's root. */
export function layerParent(element: Element): Element | null {
  return opensLayer(element) ? null : element.parentElement;
}

/** Whether `inner` sits in the layer of `outer`, its ancestor or itself. */
export function sameLayer(inner: Element, outer: Element): boolean {
  for (let node: Element | null = inner; node !== null; node = layerParent(node)) {
    if (node === outer) {
      return true;
    }
  }
  return false;
}
