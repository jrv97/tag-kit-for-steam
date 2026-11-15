import { type Mock, vi } from "vitest";
import type { Banner, BannerActions, BannerView } from "../../src/core/ui/banner";

/** One action call the test settles by hand. */
interface PendingAction {
  resolve(): void;
  reject(): void;
}

type Action<K extends keyof BannerActions> = Mock<BannerActions[K]>;

export interface ManualBannerActions {
  readonly actions: BannerActions;
  readonly ignore: Action<"ignore">;
  readonly restore: Action<"restore">;
  readonly ignoreCreator: Action<"ignoreCreator">;
  readonly restoreCreator: Action<"restoreCreator">;
  /** One entry per call, in order. */
  readonly calls: readonly PendingAction[];
  /** What the owner shows once the next action settles. */
  readonly thenShow: (next: BannerView) => void;
  /** The banner a resolved action redraws. */
  readonly attach: (created: Banner) => void;
}

/** Banner actions whose promises the test settles by hand. A resolved action shows `thenShow`. */
export function manualBannerActions(): ManualBannerActions {
  const calls: PendingAction[] = [];
  let banner: Banner | undefined;
  let owner: BannerView | undefined;
  const settle = () =>
    new Promise<void>((resolve, reject) => {
      calls.push({
        resolve: () => {
          if (banner !== undefined && owner !== undefined) {
            banner.show(owner);
          }
          resolve();
        },
        reject: () => {
          reject(new Error());
        },
      });
    });
  const ignore = vi.fn<BannerActions["ignore"]>(settle);
  const restore = vi.fn<BannerActions["restore"]>(settle);
  const ignoreCreator = vi.fn<BannerActions["ignoreCreator"]>(settle);
  const restoreCreator = vi.fn<BannerActions["restoreCreator"]>(settle);
  const actions: BannerActions = { ignore, restore, ignoreCreator, restoreCreator };
  return {
    actions,
    ignore,
    restore,
    ignoreCreator,
    restoreCreator,
    calls,
    thenShow: (next) => {
      owner = next;
    },
    attach: (created) => {
      banner = created;
    },
  };
}
