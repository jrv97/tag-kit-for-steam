import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { readKey } from "../../../tests/helpers/store-read";
import { RELEASE_KEY } from "../storage-keys";
import { checkRelease } from "./release-notice";

describe("the popup's one-time release notice", () => {
  it.each(
    [
      ["no stored release", () => fake.store(), "intro"],
      [
        "an earlier release",
        () => fake.store(new Map([[RELEASE_KEY, make.text.version()]])),
        "updated",
      ],
      [
        "a stored value that is no version",
        () => fake.store(new Map([[RELEASE_KEY, make.time()]])),
        "updated",
      ],
    ] as const,
  )(
    "gives %s the %s notice and stores the release once recorded",
    async (_name, seeded, notice) => {
      const store = seeded();
      const version = make.text.version();
      const check = await checkRelease(store, version);
      await check.record();
      expect([check.notice, await readKey(store, RELEASE_KEY)]).toEqual([notice, version]);
    },
  );

  it("gives nothing and writes nothing for the release stored now", async () => {
    const version = make.text.version();
    const store = fake.countingStore(fake.store(new Map([[RELEASE_KEY, version]])));
    const check = await checkRelease(store, version);
    await check.record();
    expect(check.notice).toBeUndefined();
    expect(store.calls.set).toBe(0);
  });

  it("gives nothing when the store cannot be read", async () => {
    const store = fake.countingStore(fake.store());
    store.break();
    expect((await checkRelease(store, make.text.version())).notice).toBeUndefined();
  });

  it("shows the notice again on the next open when the write failed", async () => {
    const store = fake.countingStore(fake.store());
    const version = make.text.version();
    store.breakWrites();
    await (await checkRelease(store, version)).record();
    store.heal();
    expect((await checkRelease(store, version)).notice).toBe("intro");
  });
});
