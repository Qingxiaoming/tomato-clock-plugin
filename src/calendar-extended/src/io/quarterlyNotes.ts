// @ts-nocheck
import type { Moment } from "moment";
import type { TFile } from "obsidian";

import type { ISettings } from "../settings";
import { createConfirmationDialog } from "../ui/modal";
import { createPeriodicNote } from "./periodicNotes";
import { getAllQuarterlyNotes, getQuarterlyNote } from "../ui/stores";
import { get } from "svelte/store";
import { settings } from "../ui/stores";

export async function openOrCreateQuarterlyNote(
  date: Moment,
  inNewSplit: boolean,
  settingsObj: ISettings,
  cb?: (file: TFile) => void
): Promise<void> {
  const { workspace } = window.app;
  const allQuarterlyNotes = getAllQuarterlyNotes();
  const existingFile = getQuarterlyNote(date, allQuarterlyNotes);

  if (existingFile) {
    const leaf = inNewSplit
      ? workspace.splitActiveLeaf()
      : workspace.getUnpinnedLeaf();
    await leaf.openFile(existingFile, { active: true });
    cb?.(existingFile);
    return;
  }

  await tryToCreateQuarterlyNote(date, inNewSplit, settingsObj, cb);
}

export async function tryToCreateQuarterlyNote(
  date: Moment,
  inNewSplit: boolean,
  settingsObj: ISettings,
  cb?: (file: TFile) => void
): Promise<void> {
  const { workspace } = window.app;
  const { quarterlyNoteFormat, quarterlyNoteFolder } = get(settings);
  const filename = date.format(quarterlyNoteFormat);

  const createFile = async () => {
    const note = await createPeriodicNote(
      date,
      quarterlyNoteFormat,
      quarterlyNoteFolder,
      get(settings).quarterlyNoteTemplate
    );
    const leaf = inNewSplit
      ? workspace.splitActiveLeaf()
      : workspace.getUnpinnedLeaf();
    await leaf.openFile(note, { active: true });
    cb?.(note);
  };

  if (settingsObj.shouldConfirmBeforeCreate) {
    createConfirmationDialog({
      cta: "Create",
      onAccept: createFile,
      text: `File ${filename} does not exist. Would you like to create it?`,
      title: "New Quarterly Note",
    });
  } else {
    await createFile();
  }
}
