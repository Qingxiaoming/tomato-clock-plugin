// @ts-nocheck
import type { Moment } from "moment";
import type { TFile } from "obsidian";

import type { ISettings } from "../settings";
import { createConfirmationDialog } from "../ui/modal";
import { createPeriodicNote } from "./periodicNotes";
import { getAllYearlyNotes, getYearlyNote } from "../ui/stores";
import { get } from "svelte/store";
import { settings } from "../ui/stores";

export async function openOrCreateYearlyNote(
  date: Moment,
  inNewSplit: boolean,
  settingsObj: ISettings,
  cb?: (file: TFile) => void
): Promise<void> {
  const { workspace } = window.app;
  const allYearlyNotes = getAllYearlyNotes();
  const existingFile = getYearlyNote(date, allYearlyNotes);

  if (existingFile) {
    const leaf = inNewSplit
      ? workspace.splitActiveLeaf()
      : workspace.getUnpinnedLeaf();
    await leaf.openFile(existingFile, { active: true });
    cb?.(existingFile);
    return;
  }

  await tryToCreateYearlyNote(date, inNewSplit, settingsObj, cb);
}

export async function tryToCreateYearlyNote(
  date: Moment,
  inNewSplit: boolean,
  settingsObj: ISettings,
  cb?: (file: TFile) => void
): Promise<void> {
  const { workspace } = window.app;
  const { yearlyNoteFormat, yearlyNoteFolder } = get(settings);
  const filename = date.format(yearlyNoteFormat);

  const createFile = async () => {
    const note = await createPeriodicNote(
      date,
      yearlyNoteFormat,
      yearlyNoteFolder,
      get(settings).yearlyNoteTemplate
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
      title: "New Yearly Note",
    });
  } else {
    await createFile();
  }
}
