/** What a topic on the map stands for. */
export type MapNodeKind = "vault" | "folder" | "note" | "heading";

/** One topic on the map. The map is our own tree, so no renderer type leaks outside the renderer. */
export interface MapNode {
    /** Stable for a given vault: the file or folder path, plus `#<index>` for a heading. */
    id: string;
    kind: MapNodeKind;
    /** The text shown on the card. */
    label: string;
    /** A short prefix shown apart from the text: "Unit 03" for "Unit 03 - Workpapers", "3a" for "3a. Scope". */
    tag?: string;
    /** The folder or note the topic opens. */
    path: string;
    /** The heading to open the note at, for heading topics. */
    heading?: string;
    /** The heading's line in the note (0-based). Opening by line finds the right one of two same-named headings. */
    line?: number;
    children: MapNode[];
}

/** A heading as Obsidian's metadata cache reports it. */
export interface SnapshotHeading {
    level: number;
    text: string;
    /** 0-based line of the heading in the note. */
    line: number;
}

export interface SnapshotNote {
    kind: "note";
    /** The file name without `.md`. */
    name: string;
    path: string;
    headings: SnapshotHeading[];
}

export interface SnapshotFolder {
    kind: "folder";
    name: string;
    path: string;
    children: SnapshotEntry[];
}

/** The part of the vault a map is built from, read from Obsidian by `obsidian-source.ts`. */
export type SnapshotEntry = SnapshotNote | SnapshotFolder;
