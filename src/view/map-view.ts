import { debounce, ItemView, Platform, TAbstractFile, ViewStateResult } from "obsidian";

import { MindElixirRenderer, NARROW_WIDTH } from "src/render/mind-elixir-renderer";
import { buildMap, initialDepth } from "src/tree/build-tree";
import { readSnapshot } from "src/tree/obsidian-source";
import { MapNode } from "src/tree/types";

export const VIEW_TYPE_MAP = "mind-studio-map";

interface MapViewState {
    /** The folder or note at the centre of the map; "/" is the whole vault. */
    path?: string;
}

export class MapView extends ItemView {
    // Opening a note from the map on a phone replaces the map, and the back button comes back to it
    navigation = true;
    private path = "/";
    /** What the drawn map was built from, so a change that leaves it the same (typing in a note) redraws nothing. */
    private signature: string | null = null;
    private mapId: string | null = null;
    private narrow = false;
    private renderer: MindElixirRenderer | null = null;
    private mapEl: HTMLElement | null = null;
    private emptyEl: HTMLElement | null = null;
    /** Vault changes come in bursts (a sync, a rename of a folder), so the map is redrawn once they settle. */
    private readonly redrawSoon = debounce(() => this.draw(false), 800, true);

    getViewType(): string {
        return VIEW_TYPE_MAP;
    }

    getIcon(): string {
        return "network";
    }

    getDisplayText(): string {
        if (this.path === "/") return this.app.vault.getName();
        return this.path.split("/").pop()?.replace(/\.md$/, "") ?? this.path;
    }

    getState(): Record<string, unknown> {
        return { ...super.getState(), path: this.path };
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        const path = (state as MapViewState | null)?.path;
        if (typeof path === "string" && path !== this.path) {
            // A new centre on a map that was already showing is a step the back button can undo
            if (this.mapId !== null) result.history = true;
            this.path = path;
        }
        await super.setState(state, result);
        this.updateTitle();
        this.draw(true);
    }

    /**
     * ItemView writes its header title once, when it loads, which is before the state arrives. titleEl is not in the
     * typings, so it is only updated when it is there.
     */
    private updateTitle(): void {
        (this as unknown as { titleEl?: HTMLElement }).titleEl?.setText(this.getDisplayText());
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass("ms-view");
        // data-ignore-swipe keeps Obsidian's mobile sidebar swipe from taking over panning the map. Mind Elixir sets
        // position: relative on the element it draws in, which would let that element grow with the map, so it draws
        // in a host that fills a frame pinned to the view.
        const frame = this.contentEl.createDiv({ cls: "ms-map", attr: { "data-ignore-swipe": "true" } });
        this.mapEl = frame.createDiv({ cls: "ms-map-host" });
        this.emptyEl = this.contentEl.createDiv({ cls: "ms-empty" });
        this.emptyEl.hide();
        this.renderer = new MindElixirRenderer(this.mapEl, { onOpen: (node) => void this.openNode(node) });

        this.addAction("file-text", "Open the selected topic", () => {
            const node = this.renderer?.selected();
            if (node) void this.openNode(node);
        });
        this.addAction("arrow-up", "Map of the parent folder", () => void this.showPath(this.parentPath()));
        this.addAction("maximize", "Fit the map to the screen", () => this.renderer?.fit());

        const onVaultChange = (file: TAbstractFile, oldPath?: string) => {
            if (this.covers(file.path) || (oldPath !== undefined && this.covers(oldPath))) this.redrawSoon();
        };
        this.registerEvent(this.app.vault.on("create", onVaultChange));
        this.registerEvent(this.app.vault.on("delete", onVaultChange));
        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                // The map follows its folder or note, or a folder above it, when it is renamed or moved
                if (this.path === oldPath || this.path.startsWith(oldPath + "/")) {
                    this.path = file.path + this.path.slice(oldPath.length);
                    this.updateTitle();
                    this.app.workspace.requestSaveLayout();
                }
                onVaultChange(file, oldPath);
            }),
        );
        this.registerEvent(this.app.metadataCache.on("changed", (file) => onVaultChange(file)));
        this.registerEvent(this.app.workspace.on("css-change", () => this.renderer?.updateTheme()));
        // A pane that is resized across the phone width (a sidebar opened, an iPad turned) gets the other layout
        this.registerEvent(
            this.app.workspace.on("resize", () => {
                if (this.mapId !== null && this.isNarrow() !== this.narrow) this.draw(true);
            }),
        );
    }

    async onClose(): Promise<void> {
        this.redrawSoon.cancel();
        this.renderer?.destroy();
        this.renderer = null;
    }

    /** Whether a change at `path` shows on this map. */
    private covers(path: string): boolean {
        return this.path === "/" || path === this.path || path.startsWith(this.path + "/");
    }

    /** The nearest folder above whose map differs: a folder that only wraps the mapped note draws the same map. */
    private parentPath(): string {
        let path = this.path;
        while (path !== "/") {
            const slash = path.lastIndexOf("/");
            path = slash <= 0 ? "/" : path.slice(0, slash);
            const entry = readSnapshot(this.app, path);
            if (entry === null || buildMap(entry, this.app.vault.getName()).id !== this.mapId) return path;
        }
        return "/";
    }

    private isNarrow(): boolean {
        const width = this.mapEl?.clientWidth || this.contentEl.clientWidth;
        return Platform.isPhone || (width > 0 && width < NARROW_WIDTH);
    }

    private draw(fresh: boolean): void {
        if (!this.renderer || !this.mapEl || !this.emptyEl) return;
        const entry = readSnapshot(this.app, this.path);
        if (entry === null) {
            this.signature = null;
            this.mapEl.hide();
            this.emptyEl.show();
            this.emptyEl.setText(`"${this.path}" is no longer in this vault.`);
            return;
        }
        const signature = JSON.stringify(entry);
        if (!fresh && signature === this.signature) return;
        this.signature = signature;
        this.emptyEl.hide();
        this.mapEl.show();
        const map = buildMap(entry, this.app.vault.getName());
        this.mapId = map.id;
        this.narrow = this.isNarrow();
        this.renderer.render(map, { narrow: this.narrow, depth: initialDepth(map, this.narrow) }, fresh);
    }

    /** Puts another folder or note at the centre. Goes through the view state, so the back button returns. */
    private async showPath(path: string): Promise<void> {
        if (path === this.path) return;
        await this.leaf.setViewState({ type: VIEW_TYPE_MAP, state: { path }, active: true });
    }

    private async openNode(node: MapNode): Promise<void> {
        if (node.kind === "folder" || node.kind === "vault") {
            await this.showPath(node.path);
            return;
        }
        // Opened by path and line, not as a link: a link text would take the first of two same-named headings, read
        // "#" in a file name as a heading, and create the note if it had just been deleted
        const file = this.app.vault.getFileByPath(node.path);
        if (file === null) return;
        // A phone has room for one screen: the note replaces the map and the back button returns to it
        const leaf = Platform.isPhone ? this.leaf : this.app.workspace.getLeaf("tab");
        await leaf.openFile(file, { active: true, eState: node.line === undefined ? undefined : { line: node.line } });
    }
}
