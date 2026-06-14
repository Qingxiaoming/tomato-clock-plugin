// @ts-nocheck
import type { Moment } from "moment";
import type { TFile } from "obsidian";

import type { ISettings } from "../settings";
import { createConfirmationDialog } from "../ui/modal";
import { createPeriodicNote } from "./periodicNotes";
import { getAllWeeklyNotes, getWeeklyNote } from "../ui/stores";
import { get } from "svelte/store";
import { settings } from "../ui/stores";

export async function openOrCreateWeeklyNote(
  date: Moment,
  inNewSplit: boolean,
  settingsObj: ISettings,
  cb?: (file: TFile) => void
): Promise<void> {
  const { workspace } = window.app;
  const allWeeklyNotes = getAllWeeklyNotes();
  const existingFile = getWeeklyNote(date, allWeeklyNotes);

  if (existingFile) {
    const leaf = inNewSplit
      ? workspace.splitActiveLeaf()
      : workspace.getUnpinnedLeaf();
    await leaf.openFile(existingFile, { active: true });
    cb?.(existingFile);
    return;
  }

  await tryToCreateWeeklyNote(date, inNewSplit, settingsObj, cb);
}

export async function tryToCreateWeeklyNote(
  date: Moment,
  inNewSplit: boolean,
  settingsObj: ISettings,
  cb?: (file: TFile) => void
): Promise<void> {
  const { workspace } = window.app;
  const { weeklyNoteFormat, weeklyNoteFolder } = get(settings);
  const filename = date.format(weeklyNoteFormat);

  const createFile = async () => {
    const note = await createPeriodicNote(
      date,
      weeklyNoteFormat,
      weeklyNoteFolder,
      get(settings).weeklyNoteTemplate
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
      title: "New Weekly Note",
    });
  } else {
    await createFile();
  }
}
