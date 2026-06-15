// @ts-nocheck
import type { Moment } from "moment";
import { Notice, normalizePath, TFile } from "obsidian";
import type { ISettings } from "../settings";
import { createConfirmationDialog } from "../ui/modal";

export async function ensureFolderExists(path: string): Promise<void> {
  const dirs = path.replace(/\\/g, "/").split("/");
  dirs.pop();
  if (dirs.length) {
    const dir = normalizePath(dirs.join("/"));
    if (!window.app.vault.getAbstractFileByPath(dir)) {
      await window.app.vault.createFolder(dir);
    }
  }
}

export async function getNotePath(
  directory: string,
  filename: string
): Promise<string> {
  if (!filename.endsWith(".md")) filename += ".md";
  const path = normalizePath(directory + "/" + filename);
  await ensureFolderExists(path);
  return path;
}

export async function getTemplateInfo(
  template: string
): Promise<[string, any]> {
  const { metadataCache, vault } = window.app;
  const templatePath = normalizePath(template);
  if (templatePath === "/" || !templatePath) return ["", null];
  try {
    const templateFile = metadataCache.getFirstLinkpathDest(templatePath, "");
    if (!templateFile) return ["", null];
    return [
      await vault.cachedRead(templateFile),
      window.app.foldManager.load(templateFile),
    ];
  } catch (err) {
    console.error(`Failed to read template '${templatePath}'`, err);
    return ["", null];
  }
}

export function processTemplate(
  templateContents: string,
  filename: string,
  format: string,
  date: moment.Moment
): string {
  const moment = window.moment;
  return templateContents
    .replace(/{{\s*date\s*}}/gi, filename)
    .replace(/{{\s*time\s*}}/gi, moment().format("HH:mm"))
    .replace(/{{\s*title\s*}}/gi, filename)
    .replace(
      /{{\s*(date|time)\s*(([+\-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi,
      (_, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
        const now = moment();
        const currentDate = date.clone().set({
          hour: now.get("hour"),
          minute: now.get("minute"),
          second: now.get("second"),
        });
        if (calc) currentDate.add(parseInt(timeDelta, 10), unit);
        if (momentFormat)
          return currentDate.format(momentFormat.substring(1).trim());
        return currentDate.format(format);
      }
    )
    .replace(
      /{{\s*yesterday\s*}}/gi,
      date.clone().subtract(1, "day").format(format)
    )
    .replace(
      /{{\s*tomorrow\s*}}/gi,
      date.clone().add(1, "day").format(format)
    );
}

export async function createPeriodicNote(
  date: moment.Moment,
  format: string,
  folder: string,
  template: string
): Promise<TFile> {
  const { vault } = window.app;
  const [templateContents, IFoldInfo] = await getTemplateInfo(template);
  const filename = date.format(format);
  const normalizedPath = await getNotePath(folder, filename);

  try {
    const fileContent = processTemplate(templateContents, filename, format, date);
    const createdFile = await vault.create(normalizedPath, fileContent);
    if (IFoldInfo) {
      (window.app as any).foldManager.save(createdFile, IFoldInfo);
    }
    return createdFile;
  } catch (err) {
    console.error(`Failed to create file: '${normalizedPath}'`, err);
    new Notice("Unable to create new file.");
    throw err;
  }
}

export async function tryCreateNote(
  date: Moment,
  inNewSplit: boolean,
  settingsObj: ISettings,
  format: string,
  folder: string,
  template: string,
  title: string,
  cb?: (file: TFile) => void
): Promise<void> {
  const { workspace } = window.app;
  const filename = date.format(format);

  const createFile = async () => {
    const note = await createPeriodicNote(date, format, folder, template);
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
      title,
    });
  } else {
    await createFile();
  }
}
