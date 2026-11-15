---
title: "Report failed lookups in the list notice and the load strip"
status: done
issue: 144
updated: 2026-11-15
---

# Report failed lookups in the list notice and the load strip

Issue 144 (refine Dim and Hide), failed-check half. The owned and wishlisted half was dropped on 2026-11-15: no related tool or user request backs it.

## Decision

A game whose check failed is neither dimmed nor hidden; the list filter keeps leaving unknown kinds out of `data-tks-kinds`. The failure is reported in two places:

1. On a `LIST_PLACEMENTS` list with a kind on Dim or Hide, the hidden results notice adds `notice_list_failed` ("2 titles could not be checked."), even with nothing hidden.
2. The load strip in the popup and the userscript dialog gains a Check again button that asks the page's failed games again.

A failure is an unknown with the reason `error` or `rate-limited` after the last retry round, or `malformed`. `gated`, `missing` and `unrequested` are not failures. No capsule marker. ADR 0028 records the choice and the rejected options (dim unknown, hide unknown with the mode, a new setting, a capsule marker).

Accepted trade-offs:

- Games past the HTML budget answer `rate-limited` for the page view (`detect/budget.ts`). They count as failed, and Check again spends one GetItems batch on them.
- `forget` trades a `malformed` entry's 6 h cache life for one request.
- A game with one malformed kind among known ones shows Check again beside "Tags loaded for N games".

## Current state

- `isStoredReason` and `isTransient` classify reasons (`cache/ttl.ts`). Transient answers live 60 s in page memory, `malformed` 6 h in storage. `VerdictCache` cannot evict.
- What `retry.offer` returns reaches progress only (`ui/capsules.ts`). `HostView` has no retry state.
- `createHostKindsRenderer` writes the host marks (`ui/list-filter.ts`). The notice queries once per frame and hides at zero (`ui/hidden-notice.ts`).
- `LoadProgress` has no failure count (`progress.ts`). The popup hears progress over the `tks-progress` port (`src/platform/extension/progress-port.ts`); nothing flows back. The dialog uses `followProgress` (`src/platform/userscript/userscript.ts`).
- The options card Check unknown games again (issue 146) scans every stored key (`cache/maintenance.ts`). Only `isStoredReason` carries over.

## Steps

1. `isFailed(verdict)` and `hasFailed(verdicts)` beside `isTransient` in `cache/ttl.ts`.
2. `retry.reset(item)` in `detect/retry.ts`; `HostRecord.retrying` from `retry.offer`, cleared by `giveUp`.
3. The renderer writes `HOST_FAILED = "data-tks-failed"` (`scan/marks.ts`) with `setAttributeOnce`: failed kinds that are not ignored, none while retrying. No CSS reads it.
4. Notice: a second query over hosts failed for a kind on Dim or Hide; show while either count is above zero; the failed sentence in its own span. At zero hidden, the hidden sentence and button get `hidden` and the reveal ends. Keys `notice_list_failed_one` and `_other`.
5. Progress: a `Set` of failed IDs in the snapshot and `sameProgress`; port schema checks `failed <= answered`.
6. `VerdictCache.forget(ids)`. `CapsuleUi.recheck()` forgets hosts with a final failure plus a demo's parent, resets their rounds and detects. `AppPage.recheck()` does this for its game; `App.recheck()` runs both.
7. `RECHECK_MESSAGE = "tks-recheck"` on the progress port; `serveProgress` calls `source.recheck()`.
8. Strip: in `done` with `failed > 0`, a quiet button `options_progress_recheck` ("Check again") outside `role="status"`, in the count's place, sized to the 16 px line (rule 18).
9. Docs: `docs/design/components.mdx` sections 5, 6 and 16 and the catalog tables, `src/core/AGENTS.md` marks table, ADR 0028, a changie fragment.

## Testing

Unit tests beside each module through `make` and `fake`: reasons table in `ttl.test.ts`, renderer table in `list-filter.test.ts`, `hidden-notice.test.ts`, `progress.test.ts`, `tab-progress.test.ts`, `verdict-cache.test.ts`, `load-strip.test.ts`, one click case in `settings-dialog.test.ts`. One `app.test.ts` case: a row fails its rounds, the notice counts it, `app.recheck()` sends one GetItems call, the row gets its tags.

## Coordination

PR 190 (shared element factory) moves the `[hidden]` rule into `ui/shared.css` and adds `quietButton`. Whichever lands second rebases and uses the factory. PR 192 edits `app-page.ts`.

## Outcome

Built as planned, with these changes after the review round:

- A host whose ID no answer reached, because the lookup rejected or a detector dropped it, now holds unknown `error` instead of no verdicts, so it draws as failed and a recheck finds it.
- `App.recheck` owns the cache step. Each surface hands over a `Recheck` (its games, the IDs to forget, a lookup), the tracker's `recheck` counts those games as waiting and drops failed games no host shows, `forgetQuietly` drops the failed cache entries once, and each surface looks its games up in one batch.
- No retry round is reset, so one press costs one GetItems batch. The cache keeps a demo's own entry when only its full game failed.
- The strip takes one press per progress it hears, and a surface skips hosts whose lookup is pending. Neither draws after `stop` or `pagehide`.
- The strip's done line names the failed games (`options_progress_done_failed`), Spanish reads "Reintentar", and Check again has a 24px hit area on its 16px line. When it hides under focus, focus moves to the bar, outside the live status.
- The notice puts the failed sentence first, so the bar ends on its button, and moves focus to the bar when the button hides under it.
- `ProgressSource` has a contract suite that runs over `followProgress`, `tabProgress` and the fake.
