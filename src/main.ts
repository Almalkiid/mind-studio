import "src/styles.css";

import { Plugin, TFile, TFolder } from "obsidian";

import { MapView, VIEW_TYPE_MAP } from "src/view/map-view";

export default class MindStudioPlugin extends Plugin {
    async onload(): Promise<void> {
        this.registerView(VIEW_TYPE_MAP, (leaf) => new MapView(leaf));

        this.addRibbonIcon("network", "Open mind map", () => void this.openMap(this.activeFolderPath()));

        this.addCommand({
            id: "open-folder-map",
            name: "Open mind map of the current folder",
            callback: () => void this.openMap(this.activeFolderPath()),
        });
        this.addCommand({
            id: "open-note-map",
            name: "Open mind map of the current note",
            checkCallback: (checking) => {
                const file = this.app.workspace.getActiveFile();
                if (!file || file.extension !== "md") return false;
                if (!checking) void this.openMap(file.path);
                return true;
            },
        });
        this.addCommand({
            id: "open-vault-map",
            name: "Open mind map of the whole vault",
            callback: () => void this.openMap("/"),
        });

        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (!(file instanceof TFolder) && !(file instanceof TFile && file.extension === "md")) return;
                menu.addItem((item) =>
                    item
                        .setTitle("Open as mind map")
                        .setIcon("network")
                        .onClick(() => void this.openMap(file.path)),
                );
            }),
        );
    }

    /** The folder of the note being read, or the whole vault when no note is open. */
    private activeFolderPath(): string {
        const parent = this.app.workspace.getActiveFile()?.parent;
        return !parent || parent.isRoot() ? "/" : parent.path;
    }

    async openMap(path: string): Promise<void> {
        const leaf = this.app.workspace.getLeaf("tab");
        await leaf.setViewState({ type: VIEW_TYPE_MAP, state: { path }, active: true });
        await this.app.workspace.revealLeaf(leaf);
    }
}
