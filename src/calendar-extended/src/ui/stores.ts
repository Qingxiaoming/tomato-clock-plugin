// @ts-nocheck
import type { TFile } from "obsidian";
import { normalizePath, Vault, TFile as ObsidianTFile } from "obsidian";
import { getAllDailyNotes } from "obsidian-daily-notes-interface";
import { get, writable } from "svelte/store";

import { defaultSettings, ISettings } from "../settings";

import { getDateUIDFromFile } from "./utils";

function getDateFromFile(file: TFile, format: string): moment.Moment | null {
  const filenameFormat = format.split("/").pop() || format;
  let noteDate = window.moment(file.basename, filenameFormat, true);
  if (!noteDate.isValid()) {
    const cleanFormat = filenameFormat.replace(/\[[^\]]*\]/g, "");
    if (
      /w{1,2}/i.test(cleanFormat) &&
      (/M{1,4}/.test(cleanFormat) || /D{1,4}/.test(cleanFormat))
    ) {
      const strippedFormat = filenameFormat
        .replace(/M{1,4}/g, "")
        .replace(/D{1,4}/g, "");
      noteDate = window.moment(file.basename, strippedFormat, false);
    }
  }
  if (!noteDate.isValid()) return null;
  return noteDate;
}

function getDateUID(date: moment.Moment, granularity: string): string {
  return `${granularity}-${date.clone().startOf(granularity).format()}`;
}

export function getAllWeeklyNotes(): Record<string, TFile> {
  const { vault } = window.app;
  const { weeklyNoteFolder, weeklyNoteFormat } = get(settings);
  if (!weeklyNoteFolder) return {};
  const folderPath = normalizePath(weeklyNoteFolder);
  const folder = vault.getAbstractFileByPath(folderPath);
  if (!folder) return {};
  const notes: Record<string, TFile> = {};
  Vault.recurseChildren(folder, (note) => {
    if (note instanceof ObsidianTFile) {
      const date = getDateFromFile(note, weeklyNoteFormat);
      if (date) {
        notes[getDateUID(date, "week")] = note;
      }
    }
  });
  return notes;
}

export function getWeeklyNote(
  date: moment.Moment,
  weeklyNotes: Record<string, TFile>
): TFile | null {
  return weeklyNotes[getDateUID(date, "week")] ?? null;
}

export function getAllMonthlyNotes(): Record<string, TFile> {
  const { vault } = window.app;
  const { monthlyNoteFolder, monthlyNoteFormat } = get(settings);
  if (!monthlyNoteFolder) return {};
  const folderPath = normalizePath(monthlyNoteFolder);
  const folder = vault.getAbstractFileByPath(folderPath);
  if (!folder) return {};
  const notes: Record<string, TFile> = {};
  Vault.recurseChildren(folder, (note) => {
    if (note instanceof ObsidianTFile) {
      const date = getDateFromFile(note, monthlyNoteFormat);
      if (date) {
        notes[getDateUID(date, "month")] = note;
      }
    }
  });
  return notes;
}

export function getMonthlyNote(
  date: moment.Moment,
  monthlyNotes: Record<string, TFile>
): TFile | null {
  return monthlyNotes[getDateUID(date, "month")] ?? null;
}

export function getAllQuarterlyNotes(): Record<string, TFile> {
  const { vault } = window.app;
  const { quarterlyNoteFolder, quarterlyNoteFormat } = get(settings);
  if (!quarterlyNoteFolder) return {};
  const folderPath = normalizePath(quarterlyNoteFolder);
  const folder = vault.getAbstractFileByPath(folderPath);
  if (!folder) return {};
  const notes: Record<string, TFile> = {};
  Vault.recurseChildren(folder, (note) => {
    if (note instanceof ObsidianTFile) {
      const date = getDateFromFile(note, quarterlyNoteFormat);
      if (date) {
        const year = date.year();
        const quarter = date.quarter();
        notes[`quarter-${year}-${quarter}`] = note;
      }
    }
  });
  return notes;
}

export function getQuarterlyNote(
  date: moment.Moment,
  quarterlyNotes: Record<string, TFile>
): TFile | null {
  const year = date.year();
  const quarter = date.quarter();
  return quarterlyNotes[`quarter-${year}-${quarter}`] ?? null;
}

export function getAllYearlyNotes(): Record<string, TFile> {
  const { vault } = window.app;
  const { yearlyNoteFolder, yearlyNoteFormat } = get(settings);
  if (!yearlyNoteFolder) return {};
  const folderPath = normalizePath(yearlyNoteFolder);
  const folder = vault.getAbstractFileByPath(folderPath);
  if (!folder) return {};
  const notes: Record<string, TFile> = {};
  Vault.recurseChildren(folder, (note) => {
    if (note instanceof ObsidianTFile) {
      const date = getDateFromFile(note, yearlyNoteFormat);
      if (date) {
        notes[`year-${date.year()}`] = note;
      }
    }
  });
  return notes;
}

export function getYearlyNote(
  date: moment.Moment,
  yearlyNotes: Record<string, TFile>
): TFile | null {
  return yearlyNotes[`year-${date.year()}`] ?? null;
}

function createDailyNotesStore() {
  let hasError = false;
  const store = writable<Record<string, TFile>>(null);
  return {
    reindex: () => {
      try {
        const dailyNotes = getAllDailyNotes();
        store.set(dailyNotes);
        hasError = false;
      } catch (err) {
        if (!hasError) {
          console.log("[Calendar] Failed to find daily notes folder", err);
        }
        store.set({});
        hasError = true;
      }
    },
    ...store,
  };
}

function createWeeklyNotesStore() {
  let hasError = false;
  const store = writable<Record<string, TFile>>(null);
  return {
    reindex: () => {
      try {
        store.set(getAllWeeklyNotes());
        hasError = false;
      } catch (err) {
        if (!hasError) {
          console.log("[Calendar] Failed to find weekly notes folder", err);
        }
        store.set({});
        hasError = true;
      }
    },
    ...store,
  };
}

function createMonthlyNotesStore() {
  let hasError = false;
  const store = writable<Record<string, TFile>>(null);
  return {
    reindex: () => {
      try {
        store.set(getAllMonthlyNotes());
        hasError = false;
      } catch (err) {
        if (!hasError) {
          console.log("[Calendar] Failed to find monthly notes folder", err);
        }
        store.set({});
        hasError = true;
      }
    },
    ...store,
  };
}

function createQuarterlyNotesStore() {
  let hasError = false;
  const store = writable<Record<string, TFile>>(null);
  return {
    reindex: () => {
      try {
        store.set(getAllQuarterlyNotes());
        hasError = false;
      } catch (err) {
        if (!hasError) {
          console.log(
            "[Calendar] Failed to find quarterly notes folder",
            err
          );
        }
        store.set({});
        hasError = true;
      }
    },
    ...store,
  };
}

function createYearlyNotesStore() {
  let hasError = false;
  const store = writable<Record<string, TFile>>(null);
  return {
    reindex: () => {
      try {
        store.set(getAllYearlyNotes());
        hasError = false;
      } catch (err) {
        if (!hasError) {
          console.log("[Calendar] Failed to find yearly notes folder", err);
        }
        store.set({});
        hasError = true;
      }
    },
    ...store,
  };
}

export const settings = writable<ISettings>(defaultSettings);
export const dailyNotes = createDailyNotesStore();
export const weeklyNotes = createWeeklyNotesStore();
export const monthlyNotes = createMonthlyNotesStore();
export const quarterlyNotes = createQuarterlyNotesStore();
export const yearlyNotes = createYearlyNotesStore();

function createSelectedFileStore() {
  const store = writable<string>(null);

  return {
    setFile: (file: TFile) => {
      const id = getDateUIDFromFile(file);
      store.set(id);
    },
    ...store,
  };
}

export const activeFile = createSelectedFileStore();
