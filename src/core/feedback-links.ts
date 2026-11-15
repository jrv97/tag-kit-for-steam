import type { BareMessageKey } from "./i18n/t";
import type { LucideName } from "./ui/lucide";

// Where a person can read the FAQ or send a bug report or feedback through GitHub's issue forms.
// The settings footer links to each, and a test checks the README's Help and feedback section
// lists them too.

// Each is a plain link opened in a tab and never requested, so no app ID goes anywhere (rule 1).
// The popup's update line links to a release's notes the same way.

// Each URL stays one literal: scripts/check_bundle.py allows these exact strings.

/** The release notes of a version follow this prefix: the release pipeline tags it by version. */
const RELEASE_NOTES_URL = "https://github.com/jrv97/tag-kit-for-steam/releases/tag/";
const FAQ_URL = "https://github.com/jrv97/tag-kit-for-steam#faq";
const BUG_REPORT_URL =
  "https://github.com/jrv97/tag-kit-for-steam/issues/new?template=bug_report.yml";
const FEEDBACK_URL =
  "https://github.com/jrv97/tag-kit-for-steam/issues/new?template=feature_request.yml";

export interface FeedbackLink {
  readonly id: "faq" | "bug" | "feedback";
  readonly url: string;
  /** Decorative Lucide icon; the visible label names the link. */
  readonly icon: LucideName;
  readonly label: BareMessageKey;
}

/** In the order the footer shows them: the question, the bug, then the light bulb. */
export const FEEDBACK_LINKS = [
  { id: "faq", url: FAQ_URL, icon: "message-circle-question-mark", label: "options_feedback_faq" },
  { id: "bug", url: BUG_REPORT_URL, icon: "bug", label: "options_feedback_bug" },
  { id: "feedback", url: FEEDBACK_URL, icon: "lightbulb", label: "options_feedback_leave" },
] as const satisfies readonly FeedbackLink[];

/** The page of the release that `version` names, with what it changed. */
export function releaseNotesUrl(version: string): string {
  return `${RELEASE_NOTES_URL}${encodeURIComponent(version)}`;
}
