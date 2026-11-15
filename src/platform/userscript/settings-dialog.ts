import type { Catalogs } from "../../core/i18n/catalog";
import type { I18n } from "../../core/i18n/t";
import type { IgnoreLists } from "../../core/ignored";
import type { Clock, KeyValueStore } from "../../core/ports";
import type { ProgressSource } from "../../core/progress";
import type { StoredSettings } from "../../core/settings/settings-source";
import { cardButton } from "../../core/ui/card-parts";
import { elementFactory } from "../../core/ui/element";
import { mountSettingsForm } from "../../core/ui/settings-form";
import { adoptStyles, DIALOG_CSS } from "../../core/ui/styles";
import type { UiState } from "../../core/ui/ui-state";
import { createFileTransfer } from "../shared/file-transfer";

export interface SettingsDialogDeps {
  readonly document: Document;
  readonly i18n: I18n;
  readonly catalogs: Catalogs;
  readonly settings: StoredSettings;
  readonly lists: IgnoreLists;
  /** The tab last shown, kept in the manager's storage. */
  readonly uiState: UiState;
  /** The manager's storage, for the Lookup results and Reset cards. */
  readonly store: KeyValueStore;
  /** Dates a backup. */
  readonly clock: Clock;
  /** False when the manager cannot tell other tabs about a change, so it applies on reload. */
  readonly live: boolean;
  /** The running app's load progress, which the dialog shows live above the tabs. */
  readonly progress: ProgressSource;
}

const HOST_CLASS = "tks-dialog-host";
const CLOSE_ATTRIBUTE = "data-tks-close";

/**
 * Opens the settings in a modal `dialog` inside a shadow root, so store CSS cannot reach it and
 * its CSS cannot leak. Escape, the close button and a click on the backdrop close it; focus goes
 * back to where it was. Opening it twice does nothing.
 */
export async function openSettingsDialog(deps: SettingsDialogDeps): Promise<void> {
  const { document: doc, i18n } = deps;
  if (doc.querySelector(`.${HOST_CLASS}`) !== null) {
    return;
  }
  const opener = doc.activeElement;

  const element = elementFactory(doc);
  const host = element("div", HOST_CLASS);
  const shadow = host.attachShadow({ mode: "open" });
  adoptStyles(shadow, DIALOG_CSS);

  const dialog = element("dialog");
  const title = element("h1", "tks-dialog-title", i18n.t("ext_name"));
  title.id = "tks-dialog-title";
  dialog.setAttribute("aria-labelledby", title.id);

  const close = cardButton(doc, i18n.t("userscript_close"));
  close.setAttribute(CLOSE_ATTRIBUTE, "");

  const head = element("div", "tks-dialog-head");
  head.append(title, close);

  const formRoot = element("div");
  const body = element("div", "tks-dialog-body");
  body.append(formRoot);
  dialog.append(head, body);
  if (!deps.live) {
    dialog.append(element("p", "tks-dialog-note", i18n.t("userscript_reload_note")));
  }
  shadow.append(dialog);
  doc.body.append(host);

  const form = await mountSettingsForm(formRoot, {
    i18n,
    settings: deps.settings,
    lists: deps.lists,
    uiState: deps.uiState,
    context: "popup",
    layout: "tabs",
    colors: true,
    locales: Object.keys(deps.catalogs),
    // The page around a modal dialog is inert, so the file input lives inside it
    backup: { files: createFileTransfer(dialog), clock: deps.clock },
    store: deps.store,
    progress: deps.progress,
  });

  // The close button and the backdrop (a click on the dialog itself) share one listener
  dialog.addEventListener("click", (event) => {
    const target = event.target;
    const onClose = target instanceof Element && target.closest(`[${CLOSE_ATTRIBUTE}]`) !== null;
    if (onClose || target === dialog) {
      dialog.close();
    }
  });
  dialog.addEventListener("close", () => {
    form.destroy();
    host.remove();
    if (opener instanceof HTMLElement) {
      opener.focus();
    }
  });
  dialog.showModal();
  close.focus();
}
