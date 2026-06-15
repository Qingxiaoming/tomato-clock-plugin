// @ts-nocheck
import type { Moment } from "moment";
import type { TFile } from "obsidian";

import type { ISettings } from "../settings";
import { tryCreateNote } from "./periodicNotes";
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
  const { yearlyNoteFormat, yearlyNoteFolder } = get(settings);
  await tryCreateNote(
    date,
    inNewSplit,
    settingsObj,
    yearlyNoteFormat,
    yearlyNoteFolder,
    get(settings).yearlyNoteTemplate,
    "New Yearly Note",
    cb
  );
}
