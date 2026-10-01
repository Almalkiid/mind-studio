import { buildMap, countNodes, initialDepth, plainText, splitLabel } from "src/tree/build-tree";
import { MapNode, SnapshotEntry, SnapshotFolder, SnapshotNote } from "src/tree/types";

function note(path: string, headings: [number, string][] = []): SnapshotNote {
    const name = path.split("/").pop()!.replace(/\.md$/, "");
    // Each heading on its own line, two lines apart, as in a note with a blank line after each heading
    return { kind: "note", name, path, headings: headings.map(([level, text], index) => ({ level, text, line: index * 2 })) };
}

function folder(path: string, children: SnapshotEntry[]): SnapshotFolder {
    return { kind: "folder", name: path.split("/").pop() ?? path, path, children };
}

function labels(node: MapNode): string[] {
    return node.children.map((child) => child.label);
}

// Shaped like Ed's CIA vault: Part folders, one folder per unit holding one note, syllabus headings inside
const UNIT_03 = folder("CIA/Part2/Unit 03 - Assessing Key Risks", [
    note("CIA/Part2/Unit 03 - Assessing Key Risks/Unit 03.md", [
        [1, "Unit 03 - Assessing Key Risks"],
        [2, "3a. Apply Topical Requirements"],
        [2, "3b. Strategic Objectives"],
    ]),
]);
const PART_2 = folder("CIA/Part2", [
    folder("CIA/Part2/Unit 10 - Using Technology", [note("CIA/Part2/Unit 10 - Using Technology/Unit 10.md")]),
    UNIT_03,
    note("CIA/Part2/Test - basics.md"),
]);

describe("buildMap", () => {
    test("orders numbers by value, not by text: Unit 2 before Unit 10", () => {
        const map = buildMap(folder("P", [note("P/Unit 10.md"), note("P/Unit 2.md"), note("P/Unit 1.md")]));
        expect(map.children.map((child) => child.label)).toEqual(["Unit 1", "Unit 2", "Unit 10"]);
    });

    test("a folder lists its subfolders first, then its notes, each in natural order (Unit 3 before Unit 10)", () => {
        const map = buildMap(PART_2);
        expect(map.kind).toBe("folder");
        expect(map.label).toBe("Part2");
        expect(map.children.map((child) => child.tag)).toEqual(["Unit 03", "Unit 10", undefined]);
        expect(labels(map)).toEqual(["Assessing Key Risks", "Using Technology", "Test - basics"]);
    });

    test("a folder holding exactly one note becomes that note, named after the folder", () => {
        const unit = buildMap(PART_2).children[0];
        expect(unit).toMatchObject({
            kind: "note",
            id: "CIA/Part2/Unit 03 - Assessing Key Risks/Unit 03.md",
            path: "CIA/Part2/Unit 03 - Assessing Key Risks/Unit 03.md",
            tag: "Unit 03",
            label: "Assessing Key Risks",
        });
    });

    test("a note's single leading H1 is its title, so its headings start at the next level", () => {
        const unit = buildMap(PART_2).children[0];
        expect(labels(unit)).toEqual(["Apply Topical Requirements", "Strategic Objectives"]);
        expect(unit.children.map((child) => child.tag)).toEqual(["3a", "3b"]);
        expect(unit.children[0]).toMatchObject({
            kind: "heading",
            id: "CIA/Part2/Unit 03 - Assessing Key Risks/Unit 03.md#1",
            path: "CIA/Part2/Unit 03 - Assessing Key Risks/Unit 03.md",
            heading: "3a. Apply Topical Requirements",
            line: 2,
        });
    });

    test("a note is named after its single leading H1, which is its title, and after its file name without one", () => {
        const unitNote = note("CIA/Part2/Unit 03 - Assessing Key Risks/Unit 03.md", [
            [1, "Unit 03 - Assessing Key Risks"],
            [2, "3a. Scope"],
        ]);
        expect(buildMap(unitNote)).toMatchObject({ tag: "Unit 03", label: "Assessing Key Risks" });
        expect(buildMap(note("Inbox/Idea.md", [[2, "First"]]))).toMatchObject({ label: "Idea" });
    });

    test("headings nest under the nearest shallower heading, even when a level is skipped", () => {
        const map = buildMap(
            note("Notes/Risk.md", [
                [2, "Risk"],
                [4, "Inherent"],
                [3, "Residual"],
                [2, "Controls"],
                [1, "Appendix"],
            ]),
        );
        expect(labels(map)).toEqual(["Risk", "Controls", "Appendix"]);
        expect(labels(map.children[0])).toEqual(["Inherent", "Residual"]);
        expect(map.children[1].children).toEqual([]);
    });

    test("an H1 is kept as a topic when the note has more than one, or when it is not the first heading", () => {
        expect(labels(buildMap(note("a.md", [[1, "One"], [1, "Two"]])))).toEqual(["One", "Two"]);
        expect(labels(buildMap(note("b.md", [[2, "Intro"], [1, "Main"]])))).toEqual(["Intro", "Main"]);
    });

    test("an empty folder and a note without headings are single topics", () => {
        expect(buildMap(folder("Empty", []))).toMatchObject({ kind: "folder", label: "Empty", children: [] });
        expect(buildMap(note("Inbox/Idea.md"))).toMatchObject({ kind: "note", label: "Idea", children: [] });
    });

    test("a folder with one note and a subfolder stays a folder", () => {
        const map = buildMap(folder("A", [note("A/One.md"), folder("A/Sub", [])]));
        expect(map.kind).toBe("folder");
        expect(labels(map)).toEqual(["Sub", "One"]);
    });

    test("the vault root takes the vault's name and keeps its own kind", () => {
        const map = buildMap(folder("/", [note("Home.md")]), "My vault");
        expect(map).toMatchObject({ kind: "vault", label: "My vault", path: "/" });
    });

    test("hidden folders and notes are left out", () => {
        const map = buildMap(
            folder("A", [folder("A/.trash", []), note("A/.draft.md"), note("A/Kept.md"), note("A/Also kept.md")]),
        );
        expect(labels(map)).toEqual(["Also kept", "Kept"]);
    });
});

describe("splitLabel", () => {
    test("splits a numbered prefix from the text", () => {
        expect(splitLabel("Unit 03 - Engagement Objectives and Scope")).toEqual({
            tag: "Unit 03",
            label: "Engagement Objectives and Scope",
        });
        expect(splitLabel("3a. Apply Topical Requirements")).toEqual({ tag: "3a", label: "Apply Topical Requirements" });
        expect(splitLabel("2.1 Sampling")).toEqual({ tag: "2.1", label: "Sampling" });
        expect(splitLabel("4) Reporting")).toEqual({ tag: "4", label: "Reporting" });
        expect(splitLabel("Part 2: Engagement")).toEqual({ tag: "Part 2", label: "Engagement" });
    });

    test("keeps text without a numbered prefix whole", () => {
        expect(splitLabel("Test - IIA basics")).toEqual({ label: "Test - IIA basics" });
        expect(splitLabel("Part1")).toEqual({ label: "Part1" });
        expect(splitLabel("2026 was a good year")).toEqual({ label: "2026 was a good year" });
    });
});

describe("plainText", () => {
    test("removes markdown marks and keeps link text", () => {
        expect(plainText("**Risk** and __controls__ with `code` and ==marks==")).toBe("Risk and controls with code and marks");
        expect(plainText("See [[COSO ERM|the framework]] and [[Fraud]]")).toBe("See the framework and Fraud");
        expect(plainText("A [web link](https://example.com) here")).toBe("A web link here");
    });
});

describe("countNodes and initialDepth", () => {
    const big = folder(
        "Big",
        Array.from({ length: 70 }, (_, i) => note(`Big/N${i}.md`)),
    );

    test("countNodes counts every topic, the root included", () => {
        expect(countNodes(buildMap(PART_2))).toBe(1 + 3 + 2);
    });

    test("small maps open fully on a desktop; large maps and every map on a phone open one ring deep", () => {
        expect(initialDepth(buildMap(PART_2), false)).toBe(Infinity);
        expect(initialDepth(buildMap(big), false)).toBe(1);
        expect(initialDepth(buildMap(PART_2), true)).toBe(1);
    });
});
