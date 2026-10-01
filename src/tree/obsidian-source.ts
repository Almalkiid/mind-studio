import { App, TAbstractFile, TFile, TFolder } from "obsidian";

import { SnapshotEntry } from "src/tree/types";

function toEntry(app: App, file: TAbstractFile): SnapshotEntry | null {
    if (file instanceof TFolder) {
        return {
            kind: "folder",
            name: file.isRoot() ? app.vault.getName() : file.name,
            path: file.isRoot() ? "/" : file.path,
            children: file.children
                .map((child) => toEntry(app, child))
                .filter((entry): entry is SnapshotEntry => entry !== null),
        };
    }
    if (file instanceof TFile && file.extension === "md") {
        const headings = app.metadataCache.getFileCache(file)?.headings ?? [];
        return {
            kind: "note",
            name: file.basename,
            path: file.path,
            headings: headings.map((heading) => ({
                level: heading.level,
                text: heading.heading,
                line: heading.position.start.line,
            })),
        };
    }
    return null;
}

/** The folder or note at `path` ("/" for the whole vault) as a snapshot for `buildMap`, or null when it is gone. */
export function readSnapshot(app: App, path: string): SnapshotEntry | null {
    const file = path === "/" ? app.vault.getRoot() : app.vault.getAbstractFileByPath(path);
    return file === null ? null : toEntry(app, file);
}
