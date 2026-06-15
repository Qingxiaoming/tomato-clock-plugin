// @ts-nocheck
import type { Moment } from "moment";
import type { TFile } from "obsidian";

import type { ISettings } from "../settings";
import { tryCreateNote } from "./periodicNotes";
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
  const { quarterlyNoteFormat, quarterlyNoteFolder } = get(settings);
  await tryCreateNote(
    date,
    inNewSplit,
    settingsObj,
    quarterlyNoteFormat,
    quarterlyNoteFolder,
    get(settings).quarterlyNoteTemplate,
    "New Quarterly Note",
    cb
  );
}
