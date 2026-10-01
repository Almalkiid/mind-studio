import { MapNode, SnapshotEntry, SnapshotFolder, SnapshotHeading, SnapshotNote } from "src/tree/types";

/** Maps with more topics than this open with only their first ring unfolded. */
export const LARGE_MAP = 60;

const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** "Unit 03 - Workpapers" and "Part 2: Engagement": a short prefix with a number, a dash or colon, then the text. */
const NAMED_PREFIX = /^(\S.{0,18}?\d+)(?:\s+[-–—]|\s*:)\s+(.+)$/;
/** "3a. Scope", "4) Reporting", "2.1 Sampling". */
const NUMBERED_PREFIX = /^(\d+(?:\.\d+)*[a-z]?)[.)]\s+(.+)$|^(\d+(?:\.\d+)+)\s+(.+)$/i;

/** Splits a numbered prefix ("Unit 03", "3a") from the rest of a name or heading. */
export function splitLabel(text: string): { tag?: string; label: string } {
    const named = NAMED_PREFIX.exec(text);
    if (named) return { tag: named[1], label: named[2] };
    const numbered = NUMBERED_PREFIX.exec(text);
    if (numbered) return { tag: numbered[1] ?? numbered[3], label: numbered[2] ?? numbered[4] };
    return { label: text };
}

/** Heading text without markdown marks: link text stays, emphasis, code and highlight marks go. */
export function plainText(text: string): string {
    return text
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/(\*\*|__|==|`)/g, "")
        .trim();
}

function isHidden(entry: SnapshotEntry): boolean {
    return entry.name.startsWith(".");
}

function labelled(text: string): { tag?: string; label: string } {
    const { tag, label } = splitLabel(plainText(text));
    return tag === undefined ? { label } : { tag, label };
}

/** A note's single leading H1 is its title: it names the note and is not a topic of its own. */
function titleHeading(headings: SnapshotHeading[]): SnapshotHeading | null {
    const titleIsFirst = headings.length > 0 && headings[0].level === 1;
    const oneH1 = headings.filter((heading) => heading.level === 1).length === 1;
    return titleIsFirst && oneH1 ? headings[0] : null;
}

function topicHeadings(headings: SnapshotHeading[]): { heading: SnapshotHeading; index: number }[] {
    const indexed = headings.map((heading, index) => ({ heading, index }));
    return titleHeading(headings) === null ? indexed : indexed.slice(1);
}

function headingNodes(note: SnapshotNote): MapNode[] {
    const top: MapNode[] = [];
    const stack: { level: number; node: MapNode }[] = [];
    for (const { heading, index } of topicHeadings(note.headings)) {
        const node: MapNode = {
            id: `${note.path}#${index}`,
            kind: "heading",
            ...labelled(heading.text),
            path: note.path,
            heading: heading.text,
            line: heading.line,
            children: [],
        };
        while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) stack.pop();
        if (stack.length === 0) top.push(node);
        else stack[stack.length - 1].node.children.push(node);
        stack.push({ level: heading.level, node });
    }
    return top;
}

function noteNode(note: SnapshotNote, name: string): MapNode {
    const title = titleHeading(note.headings)?.text ?? name;
    return { id: note.path, kind: "note", ...labelled(title), path: note.path, children: headingNodes(note) };
}

function sorted(entries: SnapshotEntry[]): SnapshotEntry[] {
    const visible = entries.filter((entry) => !isHidden(entry));
    const byName = (a: SnapshotEntry, b: SnapshotEntry) => naturalOrder.compare(a.name, b.name);
    return [
        ...visible.filter((entry) => entry.kind === "folder").sort(byName),
        ...visible.filter((entry) => entry.kind === "note").sort(byName),
    ];
}

function folderNode(folder: SnapshotFolder): MapNode {
    const children = sorted(folder.children);
    // A folder that only wraps one note (CIA/Part2/Unit 03 - …/Unit 03.md) is that note, under the folder's name
    if (children.length === 1 && children[0].kind === "note") return noteNode(children[0], folder.name);
    return {
        id: folder.path,
        kind: "folder",
        ...labelled(folder.name),
        path: folder.path,
        children: children.map((child) => entryNode(child)),
    };
}

function entryNode(entry: SnapshotEntry): MapNode {
    return entry.kind === "note" ? noteNode(entry, entry.name) : folderNode(entry);
}

/**
 * The map of a folder or a note. The vault's root folder (path "/") is named after the vault and is never merged into
 * a single note, so the centre of a vault map is always the vault.
 */
export function buildMap(entry: SnapshotEntry, vaultName?: string): MapNode {
    if (entry.kind === "folder" && entry.path === "/") {
        return {
            id: "/",
            kind: "vault",
            label: vaultName ?? entry.name,
            path: "/",
            children: sorted(entry.children).map((child) => entryNode(child)),
        };
    }
    return entryNode(entry);
}

export function countNodes(node: MapNode): number {
    return node.children.reduce((total, child) => total + countNodes(child), 1);
}

/** How many rings open unfolded: everything for a small map on a desktop, the first ring otherwise. */
export function initialDepth(map: MapNode, isPhone: boolean): number {
    return isPhone || countNodes(map) > LARGE_MAP ? 1 : Infinity;
}
