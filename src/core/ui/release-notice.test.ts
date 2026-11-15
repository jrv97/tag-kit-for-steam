import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { readKey } from "../../../tests/helpers/store-read";
import { ALLOW_KEY, SETTINGS_KEY, UI_STATE_KEY, VERSION_KEY } from "../storage-keys";
import { takeReleaseNotice } from "./release-notice";

describe("the popup's one-time release notice", () => {
  it.each(
    [
      ["an empty store", [], "intro"],
      ["settings from before the record", [SETTINGS_KEY], "updated"],
      ["an ignore list from before the record", [ALLOW_KEY], "updated"],
      ["a remembered tab from before the record", [UI_STATE_KEY], "updated"],
      ["an earlier release", [VERSION_KEY], "updated"],
    ] as const,
  )("gives %s the %s notice and stores the release", async (_name, keys, notice) => {
    const store = fake.store(new Map(keys.map((key) => [key, make.text.version()])));
    const version = make.text.version();
    expect(await takeReleaseNotice(store, version)).toBe(notice);
    expect(await readKey(store, VERSION_KEY)).toBe(version);
  });

  it("gives nothing and writes nothing for the release stored now", async () => {
    const version = make.text.version();
    const store = fake.countingStore(fake.store(new Map([[VERSION_KEY, version]])));
    expect(await takeReleaseNotice(store, version)).toBeUndefined();
    expect(store.calls.set).toBe(0);
  });

  it("gives nothing when the store cannot be read", async () => {
    const store = fake.countingStore(fake.store());
    store.break();
    expect(await takeReleaseNotice(store, make.text.version())).toBeUndefined();
    expect(store.calls.set).toBe(0);
  });

  it("still gives the notice when the write fails, and once more after it", async () => {
    const store = fake.countingStore(fake.store());
    const version = make.text.version();
    store.breakWrites();
    expect(await takeReleaseNotice(store, version)).toBe("intro");
    store.heal();
    expect(await takeReleaseNotice(store, version)).toBe("intro");
    expect(await takeReleaseNotice(store, version)).toBeUndefined();
  });
});
