/**
 * Takes `node` out of its parent, and does nothing for a detached node or none.
 * Prototype.js on Steam's store pages makes `Element#remove` throw on a detached element.
 * The userscript and the dev bundle run beside it in the page's own world.
 */
export function detach(node: ChildNode | undefined): void {
  node?.parentNode?.removeChild(node);
}
