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

function getAllPeriodicNotes(
  folderKey: keyof ISettings,
  formatKey: keyof ISettings,
  getUid: (date: moment.Moment) => string
): Record<string, TFile> {
  const { vault } = window.app;
  const s = get(settings);
  const folder = s[folderKey] as string;
  const format = s[formatKey] as string;
  if (!folder) return {};
  const folderPath = normalizePath(folder);
  const folderObj = vault.getAbstractFileByPath(folderPath);
  if (!folderObj) return {};
  const notes: Record<string, TFile> = {};
  Vault.recurseChildren(folderObj, (note) => {
    if (note instanceof ObsidianTFile) {
      const date = getDateFromFile(note, format);
      if (date) {
        notes[getUid(date)] = note;
      }
    }
  });
  return notes;
}

export function getAllWeeklyNotes(): Record<string, TFile> {
  return getAllPeriodicNotes('weeklyNoteFolder', 'weeklyNoteFormat', d => getDateUID(d, 'week'));
}
export function getWeeklyNote(date: moment.Moment, weeklyNotes: Record<string, TFile>): TFile | null {
  return weeklyNotes[getDateUID(date, 'week')] ?? null;
}

export function getAllMonthlyNotes(): Record<string, TFile> {
  return getAllPeriodicNotes('monthlyNoteFolder', 'monthlyNoteFormat', d => getDateUID(d, 'month'));
}
export function getMonthlyNote(date: moment.Moment, monthlyNotes: Record<string, TFile>): TFile | null {
  return monthlyNotes[getDateUID(date, 'month')] ?? null;
}

export function getAllQuarterlyNotes(): Record<string, TFile> {
  return getAllPeriodicNotes('quarterlyNoteFolder', 'quarterlyNoteFormat', d => `quarter-${d.year()}-${d.quarter()}`);
}
export function getQuarterlyNote(date: moment.Moment, quarterlyNotes: Record<string, TFile>): TFile | null {
  return quarterlyNotes[`quarter-${date.year()}-${date.quarter()}`] ?? null;
}

export function getAllYearlyNotes(): Record<string, TFile> {
  return getAllPeriodicNotes('yearlyNoteFolder', 'yearlyNoteFormat', d => `year-${d.year()}`);
}
export function getYearlyNote(date: moment.Moment, yearlyNotes: Record<string, TFile>): TFile | null {
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

function createPeriodicNotesStore(getter: () => Record<string, TFile>, label: string) {
  let hasError = false;
  const store = writable<Record<string, TFile>>(null);
  return {
    reindex: () => {
      try {
        store.set(getter());
        hasError = false;
      } catch (err) {
        if (!hasError) {
          console.log(`[Calendar] Failed to find ${label} notes folder`, err);
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
export const weeklyNotes = createPeriodicNotesStore(getAllWeeklyNotes, 'weekly');
export const monthlyNotes = createPeriodicNotesStore(getAllMonthlyNotes, 'monthly');
export const quarterlyNotes = createPeriodicNotesStore(getAllQuarterlyNotes, 'quarterly');
export const yearlyNotes = createPeriodicNotesStore(getAllYearlyNotes, 'yearly');

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
