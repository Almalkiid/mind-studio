import { browser, expect } from "@wdio/globals";
import * as fs from "fs";
import { beforeEach, describe, it } from "mocha";
import * as path from "path";

// Runs once per capability in wdio.conf.mts: desktop, and an emulated phone.

const pluginId = "mind-studio";
const UNIT_03 = "CIA/Part2/Unit 03 - Assessing Key Risks/Unit 03.md";
const ARTIFACTS = path.resolve(".e2e-artifacts");

interface AppWithPlugins {
    plugins: { plugins: Record<string, { openMap: (path: string) => Promise<void> } | undefined> };
}

function isPhone(): boolean {
    const options = (browser.requestedCapabilities as Record<string, { emulateMobile?: boolean }>)[
        "wdio:obsidianOptions"
    ];
    return options.emulateMobile === true;
}

async function screenshot(name: string): Promise<void> {
    fs.mkdirSync(ARTIFACTS, { recursive: true });
    await browser.saveScreenshot(path.join(ARTIFACTS, `${isPhone() ? "phone" : "desktop"}-${name}.png`));
}

async function openMap(mapPath: string): Promise<void> {
    await browser.executeObsidian(async ({ app }, id, target) => {
        const plugin = (app as unknown as AppWithPlugins).plugins.plugins[id];
        if (plugin === undefined) throw new Error("the plugin is not loaded");
        await plugin.openMap(target);
    }, pluginId, mapPath);
}

/** The text of every card that is on screen, folded-away cards left out. */
async function visibleTexts(): Promise<string[]> {
    return browser.execute(() =>
        Array.from(document.querySelectorAll<HTMLElement>(".ms-map .ms-card .ms-text"))
            .filter((el) => el.offsetParent !== null)
            .map((el) => el.textContent ?? ""),
    );
}

async function rootText(): Promise<string> {
    return browser.execute(() => document.querySelector(".ms-map .ms-root .ms-text")?.textContent ?? "");
}

async function waitForRoot(text: string): Promise<void> {
    await browser.waitUntil(async () => (await rootText()) === text, {
        timeoutMsg: `the map's centre never became "${text}"`,
    });
}

function topic(label: string) {
    return browser.$(`//me-tpc[.//span[@class="ms-text" and normalize-space()="${label}"]]`);
}

function foldButton(label: string) {
    return browser.$(`//me-parent[me-tpc//span[@class="ms-text" and normalize-space()="${label}"]]/me-epd`);
}

async function tapTwice(label: string): Promise<void> {
    const el = topic(label);
    await el.waitForDisplayed();
    await el.click();
    await el.click();
}

/** Clicks the up button in the map's header. */
async function goUp(): Promise<void> {
    await browser.execute(() => {
        const button = document.querySelector<HTMLElement>(
            '.workspace-leaf.mod-active .view-action[aria-label="Map of the parent folder"]',
        );
        if (!button) throw new Error("no up button in the map's header");
        button.click();
    });
}

/** Presses on an element, moves the pointer by (dx, dy) while pressed, and lets go. */
async function pressAndMove(el: ReturnType<typeof browser.$>, dx: number, dy: number): Promise<void> {
    await browser
        .action("pointer")
        .move({ origin: await el.getElement() })
        .down()
        .move({ origin: "pointer", x: dx, y: dy, duration: 50 })
        .up()
        .perform();
}

async function markdownLeaves(): Promise<number> {
    return browser.executeObsidian(({ app }) => app.workspace.getLeavesOfType("markdown").length);
}

async function activeFile(): Promise<string | null> {
    return browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path ?? null);
}

describe("Mind map", () => {
    beforeEach(async () => {
        await browser.executeObsidian(({ app }) => {
            app.workspace.detachLeavesOfType("mind-studio-map");
            app.workspace.detachLeavesOfType("markdown");
            // The test window is 1024 px wide: with the file list open the map would get a phone's width
            app.workspace.leftSplit.collapse();
        });
    });

    it("fits the whole map on screen and names it in the header", async () => {
        await openMap("CIA/Part2");
        await waitForRoot("Part2");
        const outside = await browser.execute(() => {
            const box = document.querySelector(".workspace-leaf.mod-active .ms-map")!.getBoundingClientRect();
            return Array.from(document.querySelectorAll<HTMLElement>(".ms-map .ms-card"))
                .filter((el) => el.offsetParent !== null)
                .map((el) => ({ text: el.textContent, r: el.getBoundingClientRect() }))
                .filter(({ r }) => r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1)
                .map(({ text }) => text);
        });
        expect(outside).toEqual([]);
        const header = await browser.executeObsidian(({ app }) => {
            const leaf = app.workspace.getLeavesOfType("mind-studio-map")[0];
            return leaf.view.containerEl.querySelector(".view-header-title")?.textContent;
        });
        expect(header).toBe("Part2");
    });

    it("keeps a tall map inside the view, with its centre on screen", async () => {
        await openMap("Big");
        await waitForRoot("Big");
        const layout = await browser.execute(() => {
            const map = document.querySelector<HTMLElement>(".workspace-leaf.mod-active .ms-map")!;
            const view = map.closest<HTMLElement>(".view-content")!;
            const box = view.getBoundingClientRect();
            const root = document.querySelector(".workspace-leaf.mod-active .ms-root")!.getBoundingClientRect();
            // The first ring may run past the top and bottom of a tall map (the person pans), but not past the sides
            const cutAtSides = Array.from(document.querySelectorAll<HTMLElement>(".workspace-leaf.mod-active .ms-main"))
                .map((el) => el.getBoundingClientRect())
                .filter((r) => r.left < box.left || r.right > box.right).length;
            return {
                mapFitsView: map.offsetHeight <= view.clientHeight,
                rootOnScreen: root.top >= box.top && root.bottom <= box.bottom && root.left >= box.left && root.right <= box.right,
                cutAtSides,
            };
        });
        expect(layout).toEqual({ mapFitsView: true, rootOnScreen: true, cutAtSides: 0 });
    });

    it("opens a folder as a map of its units, with their tags, and their headings on a desktop", async () => {
        await openMap("CIA/Part2");
        await waitForRoot("Part2");
        const texts = await visibleTexts();
        expect(texts).toEqual(
            expect.arrayContaining(["Part2", "Assessing Key Risks", "Using Technology", "Test - basics"]),
        );
        const tags = await browser.execute(() =>
            Array.from(document.querySelectorAll(".ms-map .ms-main .ms-tag")).map((el) => el.textContent),
        );
        expect(tags).toEqual(expect.arrayContaining(["Unit 03", "Unit 10"]));
        // A small map opens fully on a desktop; a phone opens it one ring deep
        if (isPhone()) expect(texts).not.toContain("Apply Topical Requirements");
        else expect(texts).toEqual(expect.arrayContaining(["Apply Topical Requirements", "Risk appetite"]));
        await screenshot("part2");
    });

    it("grows on both sides on a desktop and to the right on a phone", async () => {
        await openMap("CIA/Part2");
        await waitForRoot("Part2");
        const sides = await browser.execute(() => ({
            left: document.querySelectorAll(".ms-map me-main.lhs > me-wrapper").length,
            right: document.querySelectorAll(".ms-map me-main.rhs > me-wrapper").length,
        }));
        expect(sides.right).toBeGreaterThan(0);
        if (isPhone()) expect(sides.left).toBe(0);
        else expect(sides.left).toBeGreaterThan(0);
    });

    it("folds and unfolds a unit's headings with its fold button", async () => {
        await openMap("CIA/Part2");
        await waitForRoot("Part2");
        const shownAtStart = (await visibleTexts()).includes("Apply Topical Requirements");
        await foldButton("Assessing Key Risks").click();
        await browser.waitUntil(
            async () => (await visibleTexts()).includes("Apply Topical Requirements") === !shownAtStart,
            { timeoutMsg: "the fold button did not fold or unfold the unit" },
        );
        await foldButton("Assessing Key Risks").click();
        await browser.waitUntil(
            async () => (await visibleTexts()).includes("Apply Topical Requirements") === shownAtStart,
            { timeoutMsg: "the fold button did not restore the unit" },
        );
    });

    it("shows a heading that looks like markup as plain text", async () => {
        await openMap(UNIT_03);
        await waitForRoot("Assessing Key Risks");
        expect(await visibleTexts()).toContain("<b>Bold</b> & co");
        const markup = await browser.execute(() => document.querySelectorAll(".ms-map .ms-card b").length);
        expect(markup).toBe(0);
    });

    it("opens a heading's note when its topic is tapped twice", async () => {
        await openMap(UNIT_03);
        await waitForRoot("Assessing Key Risks");
        await tapTwice("Strategic Objectives");
        await browser.waitUntil(async () => (await activeFile()) === UNIT_03, {
            timeoutMsg: "tapping the topic twice did not open its note",
        });
    });

    it("puts a folder at the centre when tapped twice, and the up button goes back to its parent", async () => {
        await openMap("CIA");
        await waitForRoot("CIA");
        await tapTwice("Part2");
        await waitForRoot("Part2");
        await goUp();
        await waitForRoot("CIA");
    });

    it("goes up from a unit's note to the folder that holds the unit", async () => {
        // The unit's own folder holds only the note, so its map is the note's map: up skips it
        await openMap(UNIT_03);
        await waitForRoot("Assessing Key Risks");
        await goUp();
        await waitForRoot("Part2");
    });

    it("goes back to the previous map with the back button", async () => {
        await openMap("CIA");
        await waitForRoot("CIA");
        await tapTwice("Part2");
        await waitForRoot("Part2");
        await browser.executeObsidianCommand("app:go-back");
        await waitForRoot("CIA");
    });

    it("opens the right one of two headings with the same name", async () => {
        await openMap("Duplicates.md");
        await waitForRoot("Duplicates");
        const second = browser.$(
            '//me-wrapper[me-parent/me-tpc//span[@class="ms-text" and normalize-space()="Second"]]//me-tpc[.//span[@class="ms-text" and normalize-space()="Examples"]]',
        );
        if (!(await second.isDisplayed())) await foldButton("Second").click();
        await second.waitForDisplayed();
        await second.click();
        await second.click();
        // The second "Examples" is on line 189 of 230; the first is on line 5
        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
                    if (!view || view.file?.path !== "Duplicates.md") return -1;
                    return (view.getEphemeralState() as { scroll?: number }).scroll ?? -1;
                })) > 100,
            { timeoutMsg: "the note did not open at the second Examples heading" },
        );
    });

    it("does not open a topic when the map is dragged from it", async () => {
        await openMap("CIA/Part2");
        await waitForRoot("Part2");
        const card = topic("Using Technology");
        await card.waitForDisplayed();
        await pressAndMove(card, 40, 30);
        await pressAndMove(card, 40, 30);
        await browser.pause(500);
        expect(await markdownLeaves()).toBe(0);
    });

    it("folds with a tap even when the finger moves a little", async () => {
        await openMap("CIA/Part2");
        await waitForRoot("Part2");
        const shownAtStart = (await visibleTexts()).includes("Apply Topical Requirements");
        await pressAndMove(foldButton("Assessing Key Risks"), 3, 2);
        await browser.waitUntil(
            async () => (await visibleTexts()).includes("Apply Topical Requirements") === !shownAtStart,
            { timeoutMsg: "a tap that moved 3 px did not fold or unfold the unit" },
        );
    });

    it("keeps the selection while a note's text changes, and redraws when its headings change", async () => {
        await openMap(UNIT_03);
        await waitForRoot("Assessing Key Risks");
        await topic("Strategic Objectives").click();
        const original = await browser.executeObsidian(async ({ app }, notePath) => {
            const file = app.vault.getFileByPath(notePath)!;
            const text = await app.vault.read(file);
            await app.vault.modify(file, text + "\nMore text, no new heading.\n");
            return text;
        }, UNIT_03);
        try {
            await browser.pause(2000);
            const selected = await browser.execute(() => document.querySelectorAll(".ms-map me-tpc.selected").length);
            expect(selected).toBe(1);
            await browser.executeObsidian(async ({ app }, notePath, text) => {
                await app.vault.modify(app.vault.getFileByPath(notePath)!, text + "\n## 3c. New Heading\n");
            }, UNIT_03, original);
            await browser.waitUntil(async () => (await visibleTexts()).includes("New Heading"), {
                timeoutMsg: "a new heading did not show on the map",
            });
        } finally {
            await browser.executeObsidian(async ({ app }, notePath, text) => {
                await app.vault.modify(app.vault.getFileByPath(notePath)!, text);
            }, UNIT_03, original);
        }
    });

    it("follows the mapped folder when it is renamed", async () => {
        await openMap("CIA/Part2");
        await waitForRoot("Part2");
        await browser.executeObsidian(async ({ app }) => {
            await app.fileManager.renameFile(app.vault.getFolderByPath("CIA/Part2")!, "CIA/Part Two");
        });
        try {
            await waitForRoot("Part Two");
        } finally {
            await browser.executeObsidian(async ({ app }) => {
                const folder = app.vault.getFolderByPath("CIA/Part Two");
                if (folder) await app.fileManager.renameFile(folder, "CIA/Part2");
            });
        }
    });

    it("switches to one side when its pane becomes narrow", async function () {
        if (isPhone()) this.skip();
        await openMap("CIA/Part2");
        await waitForRoot("Part2");
        const leftBranches = () =>
            browser.execute(() => document.querySelectorAll(".ms-map me-main.lhs > me-wrapper").length);
        expect(await leftBranches()).toBeGreaterThan(0);
        // With the file list open the 1024 px test window leaves the map less than 700 px
        await browser.executeObsidian(({ app }) => app.workspace.leftSplit.expand());
        await browser.waitUntil(async () => (await leftBranches()) === 0, {
            timeoutMsg: "the map kept both sides in a narrow pane",
        });
    });

    it("maps the whole vault from its command, named after the vault", async () => {
        await browser.executeObsidianCommand(`${pluginId}:open-vault-map`);
        const vaultName = await browser.executeObsidian(({ app }) => app.vault.getName());
        await waitForRoot(vaultName);
        expect(await visibleTexts()).toEqual(expect.arrayContaining(["CIA", "Home"]));
    });

    it("follows dark mode", async () => {
        await openMap("CIA/Part2");
        await waitForRoot("Part2");
        const cardColour = () =>
            browser.execute(() => getComputedStyle(document.querySelector(".ms-map .ms-main")!).backgroundColor);
        const setTheme = (theme: string) =>
            browser.executeObsidian(({ app }, name) => {
                (app as unknown as { changeTheme: (theme: string) => void }).changeTheme(name);
            }, theme);
        const light = await cardColour();
        try {
            await setTheme("obsidian");
            await browser.waitUntil(() => browser.execute(() => document.body.classList.contains("theme-dark")));
            expect(await cardColour()).not.toBe(light);
            await screenshot("part2-dark");
        } finally {
            await setTheme("moonstone");
        }
    });
});
