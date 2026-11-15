import { describe, expect, it } from "vitest";
import { make } from "../../tests/helpers/factory";
import { fake } from "../../tests/helpers/fakes";
import type { AiVerdict } from "./kinds/ai";
import { KINDS } from "./kinds/registry";
import { type KindVerdicts, UNKNOWN_KINDS, withRelations } from "./kinds/verdicts";
import { mergeVerdicts, translatedVerdicts } from "./page-verdicts";

const ID = make.appId();
const ARC_RAIDERS = make.fixture.app.arcRaiders;
// What an open English page says about itself: only the AI kind can be read from it.
const DISCLOSING = make.fixture.pageVerdicts(
  "5072580-ai-first.html",
  make.fixture.app.aiWithService,
);
const QUIET = make.fixture.pageVerdicts("413150-no-block.html", make.fixture.app.noBlock);
const aiOnly = (ai: AiVerdict) => make.verdicts({ ai });
const pageAi = (page: KindVerdicts) => page.ai;
const dataAi = (_page: KindVerdicts, data: KindVerdicts) => data.ai;

const none = () => undefined;

describe("mergeVerdicts", () => {
  it("takes every kind from Steam's data when both disclose", () => {
    const data = make.fixture.verdicts(ARC_RAIDERS);
    const disagree = fake.spy();
    const merged = mergeVerdicts(DISCLOSING, data, disagree);
    for (const kind of KINDS) {
      expect(merged[kind.id]).toBe(data[kind.id]);
    }
    expect(disagree).not.toHaveBeenCalled();
  });

  it("prefers a disclosure from Steam's data, which also names the AI service", () => {
    const service = make.text.service();
    const named = aiOnly(make.verdict.disclosed("ai", { service }));
    const merged = mergeVerdicts(DISCLOSING, named, none);
    expect(merged.ai).toMatchObject({ source: "api", service });
  });

  it.each([
    [
      "the page's disclosure when Steam's data has none",
      DISCLOSING,
      () => aiOnly(make.verdict.notDisclosed()),
      pageAi,
    ],
    [
      "Steam's disclosure when the page shows none",
      QUIET,
      () => aiOnly(make.verdict.disclosed("ai")),
      dataAi,
    ],
    [
      "Steam's disclosure when the page hid the store",
      UNKNOWN_KINDS.gated,
      () => aiOnly(make.verdict.disclosed("ai")),
      dataAi,
    ],
  ])("keeps %s, and reports the disagreement", (_name, page, dataFor, kept) => {
    const disagree = fake.spy();
    const data = dataFor();
    expect(mergeVerdicts(page, data, disagree).ai).toBe(kept(page, data));
    expect(disagree).toHaveBeenCalledExactlyOnceWith("ai", page.ai, data.ai);
  });

  it("uses Steam's answer when the page's is unknown, without a report", () => {
    const disagree = fake.spy();
    const data = aiOnly(make.verdict.disclosed("ai"));
    expect(mergeVerdicts(UNKNOWN_KINDS.missing, data, disagree).ai).toBe(data.ai);
    expect(disagree).not.toHaveBeenCalled();
  });

  it.each(
    [
      ["disclosure", DISCLOSING, "error"],
      ["not disclosed", QUIET, "missing"],
      ["not disclosed", QUIET, "malformed"],
      ["not disclosed", QUIET, "error"],
      ["not disclosed", QUIET, "rate-limited"],
    ] as const,
  )(
    "keeps the page's %s when Steam's data is unknown %s, without a report",
    (_name, page, reason) => {
      const disagree = fake.spy();
      expect(mergeVerdicts(page, UNKNOWN_KINDS[reason], disagree).ai).toBe(page.ai);
      expect(disagree).not.toHaveBeenCalled();
    },
  );

  it("settles a page that shows none and data that has none as not disclosed", () => {
    const data = aiOnly(make.verdict.notDisclosed());
    expect(mergeVerdicts(QUIET, data, none).ai).toBe(make.verdict.notDisclosed());
  });

  it("never lets the page speak for a kind that cannot be read from it", () => {
    const data = make.fixture.verdicts(make.fixture.app.noKind);
    const page = make.verdicts({ kernel: make.fixture.verdicts(ARC_RAIDERS).kernel });
    expect(mergeVerdicts(page, data, none).kernel).toBe(data.kernel);
  });

  it("takes the base game and the creators from Steam's data, not the page", () => {
    const related = {
      parent: make.appId(),
      creators: make.creator.forItem({ developers: [make.text.creator()] }),
    };
    const data = withRelations(make.fixture.verdicts(ARC_RAIDERS), related);
    expect(mergeVerdicts(DISCLOSING, data, none)).toMatchObject(related);
    expect(mergeVerdicts(QUIET, data, none)).toMatchObject(related);
    const alone = mergeVerdicts(QUIET, make.fixture.verdicts(make.fixture.app.noKind), none);
    expect(alone).not.toHaveProperty("parent");
    expect(alone).not.toHaveProperty("creators");
  });

  it.each([
    ["shows none", QUIET, dataAi],
    ["shows its own", DISCLOSING, pageAi],
  ])("takes a full game's AI on a demo page that %s, unless it is the page's", (
    _name,
    page,
    kept,
  ) => {
    const disagree = fake.spy();
    const data = aiOnly(make.verdict.lent(make.verdict.disclosed("ai")));
    expect(mergeVerdicts(page, data, disagree).ai).toBe(kept(page, data));
    expect(disagree).not.toHaveBeenCalled();
  });

  it("holds a verdict for every kind", () => {
    const merged = mergeVerdicts(UNKNOWN_KINDS.missing, UNKNOWN_KINDS.error, none);
    expect(Object.keys(merged)).toStrictEqual(KINDS.map((kind) => kind.id));
  });
});

describe("translatedVerdicts", () => {
  it.each([
    [
      "the AI notes are in the page's language",
      aiOnly(make.verdict.disclosed("ai", { language: "german" })),
    ],
    [
      "they are the full game's notes that a demo shows",
      aiOnly(make.verdict.lent(make.verdict.disclosed("ai", { language: "english" }))),
    ],
  ])("takes Steam's data as it is, never asking again, when %s", async (_name, detected) => {
    const getItems = fake.detector(() => UNKNOWN_KINDS.error);
    expect(await translatedVerdicts(ID, "german", detected, getItems)).toBe(detected);
    expect(getItems.calls).toEqual([]);
  });

  it("asks GetItems again when the stored AI notes are in another language", async () => {
    const stored = make.fixture.verdicts(ARC_RAIDERS);
    const fresh = make.verdict.disclosed("ai", { language: "german", notes: make.text.note() });
    const getItems = fake.detector(() => aiOnly(fresh));

    const verdicts = await translatedVerdicts(ID, "german", stored, getItems);

    expect(verdicts.ai).toBe(fresh);
    expect(verdicts.kernel).toBe(stored.kernel);
    expect(getItems.calls).toEqual([[ID]]);
  });

  it("keeps the base game of a DLC when the notes are asked for again", async () => {
    const parent = make.appId();
    const stored = withRelations(make.fixture.verdicts(ARC_RAIDERS), { parent });
    const fresh = make.verdict.disclosed("ai", { language: "german", notes: make.text.note() });
    const getItems = fake.detector(() => aiOnly(fresh));
    expect((await translatedVerdicts(ID, "german", stored, getItems)).parent).toBe(parent);
  });

  it("keeps the stored verdicts when the second answer is no disclosure", async () => {
    const stored = make.fixture.verdicts(ARC_RAIDERS);
    const getItems = fake.detector(() => UNKNOWN_KINDS.error);
    expect(await translatedVerdicts(ID, "german", stored, getItems)).toBe(stored);
  });
});
