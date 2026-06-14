// @ts-nocheck
import type { Moment } from "moment";
import type { TFile } from "obsidian";

import type { ISettings } from "../settings";
import { createConfirmationDialog } from "../ui/modal";
import { createPeriodicNote } from "./periodicNotes";
import { getAllMonthlyNotes, getMonthlyNote } from "../ui/stores";
import { get } from "svelte/store";
import { settings } from "../ui/stores";

export async function openOrCreateMonthlyNote(
  date: Moment,
  inNewSplit: boolean,
  settingsObj: ISettings,
  cb?: (file: TFile) => void
): Promise<void> {
  const { workspace } = window.app;
  const allMonthlyNotes = getAllMonthlyNotes();
  const existingFile = getMonthlyNote(date, allMonthlyNotes);

  if (existingFile) {
    const leaf = inNewSplit
      ? workspace.splitActiveLeaf()
      : workspace.getUnpinnedLeaf();
    await leaf.openFile(existingFile, { active: true });
    cb?.(existingFile);
    return;
  }

  await tryToCreateMonthlyNote(date, inNewSplit, settingsObj, cb);
}

export async function tryToCreateMonthlyNote(
  date: Moment,
  inNewSplit: boolean,
  settingsObj: ISettings,
  cb?: (file: TFile) => void
): Promise<void> {
  const { workspace } = window.app;
  const { monthlyNoteFormat, monthlyNoteFolder } = get(settings);
  const filename = date.format(monthlyNoteFormat);

  const createFile = async () => {
    const note = await createPeriodicNote(
      date,
      monthlyNoteFormat,
      monthlyNoteFolder,
      get(settings).monthlyNoteTemplate
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
      title: "New Monthly Note",
    });
  } else {
    await createFile();
  }
}
