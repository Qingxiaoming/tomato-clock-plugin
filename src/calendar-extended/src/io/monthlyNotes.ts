// @ts-nocheck
import type { Moment } from "moment";
import type { TFile } from "obsidian";

import type { ISettings } from "../settings";
import { tryCreateNote } from "./periodicNotes";
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
  const { monthlyNoteFormat, monthlyNoteFolder } = get(settings);
  await tryCreateNote(
    date,
    inNewSplit,
    settingsObj,
    monthlyNoteFormat,
    monthlyNoteFolder,
    get(settings).monthlyNoteTemplate,
    "New Monthly Note",
    cb
  );
}
