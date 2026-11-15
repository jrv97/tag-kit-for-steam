# Contributing

Open an issue with one of the [issue forms](https://github.com/jrv97/tag-kit-for-steam/issues/new/choose) before you write a change, so we can agree on it. [AGENTS.md](AGENTS.md) holds the project's hard rules; a change that breaks one needs an ADR in `docs/adr/` first.

## Set up

Follow the README's [Development](README.md#development) section. It covers mise, `mise run setup`, the tasks and loading a build in your browser.

## Translate

Each language is one catalog: `src/locales/<locale>/messages.json`. English (`src/locales/en/messages.json`) is the source, and Spanish (`es`) is the only other catalog.

To add a language:

1. Pick the locale code from the table in `src/core/i18n/locale.ts`. Its third column is the catalog code Steam's language maps to (`de`, `pt_BR` or `zh_CN`, for example).
2. Copy the English catalog to `src/locales/<code>/messages.json` and translate each `message`. Keep every key and every `$name$` placeholder; leave the `description` in English, since it tells the next translator where the text appears and how long it may be.
3. A message whose key ends in `_one` or `_other` is a plural. Add the categories your language needs (`_few` or `_many`, for example) next to them.
4. Add the locale to `src/core/i18n/shipped.test.ts`: its list of shipped locales, and its resolve cases, where a store page in that language now resolves to the new catalog.
5. Run `mise run check` and `mise run test`. The build picks up every catalog under `src/locales/` on its own.

To fix a translation, edit the message in that language's catalog and run the same checks.

### Use Steam's own words

A tag names its kind in Steam's words (AGENTS.md rule 4). For a message whose description asks for the word or wording Steam shows (most `kind_..._heading` keys, the rating words and some chips), open the Steam store in your language and copy the heading or label Steam shows there, letter for letter. Say in the pull request where you found it. When you could only find it in Steam's client strings, say that in the message's description, as the Spanish `kind_family_heading` does.

Most chips, the short names (`kind_..._key`) and the plain descriptions are our own words; where a description asks for Steam's wording, follow it. Keep them short, describe the tag and never claim more about a game than Steam's data says. Our copy never says a game "uses AI", is "AI-free" or has "no AI", in any language.

### The i18n check

`scripts/check_i18n.py` runs in `mise run check`, in the pre-commit hook and in CI. It fails when:

- a locale is missing a key or a placeholder that English has;
- a message has no description, or its placeholders do not match;
- a catalog says "uses AI", "AI-free" or "no AI";
- code under `src/` or `tests/` types catalog text as a string literal (AGENTS.md rule 9). Code and tests read copy through the catalog.

Non-English catalogs may use any characters. The rest of the repo is ASCII.

## Changelog fragment

A pull request that changes `src/` adds a changelog fragment: run `mise run change-new`, pick Added, Changed, Fixed or Removed, and write one sentence about what a person using the extension notices. A new or fixed translation counts. A pull request with nothing to note carries the `no-changelog-fragment` label instead. Never edit the `package.json` version; the release pipeline sets it.

## Branches, commits and pull requests

- Branch from `main` as `<type>/<slug>` (`feat/german-catalog`, `fix/deck-chip-width`). `mise run check-branch` checks the name, and the pre-push hook runs it.
- Commit messages follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) with one of these types: `feat`, `fix`, `refactor`, `perf`, `style`, `test`, `docs`, `build`, `ops`, `chore`. CI changes are `build`. No trailers such as `Co-authored-by` or `Signed-off-by`.
- The hooks from `mise run setup` format staged files on commit and run `mise run prepush` before a push. CI runs `mise run ci`.
- Every change reaches `main` through a pull request. Its title is a Conventional Commit header, because the pull request is squash-merged with the title as the commit message. Link the issue it closes.
- I review each pull request before it merges. List in its description the review findings you applied and the ones you dropped, with a reason for each.
- Tests follow AGENTS.md rule 17: test data comes from `make` in `tests/helpers/factory.ts`, test doubles from `fake` in `tests/helpers/fakes.ts`, and near-duplicate cases fold into one `it.each`.

## Text in the repo

Repo text is ASCII with normal capitalization, and uses no em dash, en dash or `--` in their place (AGENTS.md rule 8). Write plain sentences in the active voice and describe what the code does.
