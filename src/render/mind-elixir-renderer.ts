// The only file that knows about Mind Elixir. Everything else works with MapNode, so another library (Markmap, for
// its animation) can replace this one file.
import "mind-elixir/style.css";

import MindElixir from "mind-elixir";
import type { MindElixirInstance, NodeObj, Theme, Topic } from "mind-elixir";

import { cardHtml } from "src/render/node-html";
import { MapNode } from "src/tree/types";

/** Line colour of each first-ring branch; the card fills for the same slots are in styles.css (.ms-branch-N). */
export const BRANCH_LINES = ["#e57f97", "#ec9a55", "#d9b23c", "#4fb98a", "#4fa3dd", "#9a7fe3"];

/** Below this width the map grows to one side and opens folded, which is what fits on a phone. */
export const NARROW_WIDTH = 700;
/** Fitting a big map onto a phone would make the text unreadable, so fitting stops at this zoom. */
const MIN_FIT_SCALE = 0.55;
/** A press that moves less than this is a tap (a fingertip wobbles); one that moves more is a drag of the map. */
const TAP_SLOP = 10;

export interface RenderOptions {
    /** Rings that open unfolded, from `initialDepth`. */
    depth: number;
    narrow: boolean;
}

export interface RendererEvents {
    /** A topic was tapped while it was already selected: open it. */
    onOpen(node: MapNode): void;
}

interface LineParams {
    pT: number;
    pL: number;
    pW: number;
    pH: number;
    cT: number;
    cL: number;
    cW: number;
    cH: number;
    direction: string;
}

/** An S-curve from the side of the parent card to the side of the child card. */
function curve({ pT, pL, pW, pH, cT, cL, cW, cH, direction }: LineParams): string {
    const left = direction === "lhs";
    const x1 = left ? pL : pL + pW;
    const y1 = pT + pH / 2;
    const x2 = left ? cL + cW : cL;
    const y2 = cT + cH / 2;
    const dx = (x2 - x1) / 2;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
}

/** Mind Elixir reports a sub-topic's position with the node gap included, on the side facing its parent. */
function subCurve(this: MindElixirInstance, params: LineParams): string {
    const gap = parseInt(this.container.style.getPropertyValue("--node-gap-x")) || 0;
    const left = params.direction === "lhs";
    return curve({ ...params, cL: left ? params.cL - gap : params.cL + gap });
}

function theme(dark: boolean): Theme {
    return {
        name: "Mind Studio",
        type: dark ? "dark" : "light",
        palette: BRANCH_LINES,
        cssVar: {
            "--main-gap-x": "70px",
            "--main-gap-y": "26px",
            "--node-gap-x": "34px",
            "--node-gap-y": "10px",
            "--bgcolor": "transparent",
            "--root-bgcolor": "transparent",
            "--main-bgcolor": "transparent",
            "--topic-padding": "0px",
            "--selected": "var(--interactive-accent)",
        },
        generateMainBranch: curve,
        generateSubBranch: subCurve,
    };
}

function isDark(): boolean {
    return activeDocument.body.classList.contains("theme-dark");
}

export class MindElixirRenderer {
    private mind: MindElixirInstance | null = null;
    /** Mind Elixir ids are short and plain ("n12"); ours are paths, which do not belong in a DOM attribute selector. */
    private nodes = new Map<string, MapNode>();
    private lastTapped: string | null = null;
    private narrow = false;
    private pressedAt: { x: number; y: number } | null = null;

    constructor(
        private readonly el: HTMLElement,
        private readonly events: RendererEvents,
    ) {
        el.addEventListener("pointerdown", (event) => (this.pressedAt = { x: event.clientX, y: event.clientY }), true);
        el.addEventListener("click", (event) => this.onFoldClick(event), true);
        el.addEventListener("click", (event) => this.onClick(event));
    }

    /**
     * Draws the map. When a map is already shown and `fresh` is false (the vault changed under the same map), it is
     * redrawn in place, keeping what the person folded and unfolded and where they had panned to.
     */
    render(map: MapNode, options: RenderOptions, fresh: boolean): void {
        if (fresh) this.destroy();
        const folds = this.mind ? this.currentFolds() : null;
        this.narrow = options.narrow;
        // Ids are handed out again below, so a tap on the old map must not count as the first of two on the new one
        this.lastTapped = null;
        this.nodes.clear();
        const nodeData = this.toNodeObj(map, 0, null, options.depth, folds);

        if (this.mind) {
            this.mind.refresh({ nodeData });
            return;
        }
        this.mind = new MindElixir({
            el: this.el,
            direction: options.narrow ? MindElixir.RIGHT : MindElixir.SIDE,
            editable: false,
            contextMenu: false,
            toolBar: false,
            keypress: false,
            theme: theme(isDark()),
        });
        this.mind.init({ nodeData });
        // Lines are placed from the card sizes, so they are redrawn once the interface font has loaded
        void activeDocument.fonts.ready.then(() => this.mind?.linkDiv());
        this.fit();
    }

    /**
     * Zooms out until the whole map shows, centred on the map as a whole. (Mind Elixir's toCenter centres the middle
     * topic instead, which pushes a one-sided map off the right edge.) A map too big to read when it all shows stops
     * at the smallest readable zoom, centred on its middle topic, so the person starts from there and pans. On a narrow
     * screen the map grows to the right only, so the middle topic goes to the left edge to leave room for its branches.
     */
    fit(): void {
        const mind = this.mind;
        if (!mind) return;
        mind.scaleFit();
        if (mind.scaleVal >= MIN_FIT_SCALE) return;
        mind.scale(MIN_FIT_SCALE);
        mind.toCenter();
        const root = this.el.querySelector("me-root");
        if (this.narrow && root) {
            const margin = 12;
            mind.move(this.el.getBoundingClientRect().left + margin - root.getBoundingClientRect().left, 0);
        }
    }

    /** Follows Obsidian's light or dark mode. Card colours follow by themselves; this updates Mind Elixir's own. */
    updateTheme(): void {
        // Changing the theme redraws the map and drops its selection, so the next tap is a first tap again
        this.lastTapped = null;
        this.mind?.changeTheme(theme(isDark()));
    }

    /** The topic that was tapped last, to open it from the view's header. */
    selected(): MapNode | null {
        return this.lastTapped === null ? null : (this.nodes.get(this.lastTapped) ?? null);
    }

    destroy(): void {
        this.mind?.destroy();
        this.mind = null;
    }

    private toNodeObj(
        node: MapNode,
        depth: number,
        branch: number | null,
        openDepth: number,
        folds: Map<string, boolean> | null,
    ): NodeObj {
        const id = `n${this.nodes.size}`;
        this.nodes.set(id, node);
        const obj: NodeObj = {
            id,
            topic: node.label,
            dangerouslySetInnerHTML: cardHtml(node, depth, branch),
            expanded: folds?.get(node.id) ?? depth < openDepth,
            children: node.children.map((child, index) =>
                this.toNodeObj(child, depth + 1, branch ?? index % BRANCH_LINES.length, openDepth, folds),
            ),
        };
        // Sub-topic lines take the colour of their first-ring branch
        if (depth === 1 && branch !== null) obj.branchColor = BRANCH_LINES[branch];
        return obj;
    }

    /** Which topics are unfolded now, by our ids, so a redraw keeps them. */
    private currentFolds(): Map<string, boolean> {
        const folds = new Map<string, boolean>();
        const walk = (obj: NodeObj) => {
            const node = this.nodes.get(obj.id);
            if (node && obj.expanded !== undefined) folds.set(node.id, obj.expanded);
            obj.children?.forEach(walk);
        };
        if (this.mind) walk(this.mind.getData().nodeData);
        return folds;
    }

    /** Whether the press that ended in this click moved far enough to be a drag of the map. */
    private wasDrag(event: MouseEvent): boolean {
        const at = this.pressedAt;
        return at !== null && Math.hypot(event.clientX - at.x, event.clientY - at.y) > TAP_SLOP;
    }

    /**
     * Fold buttons are handled here, before Mind Elixir sees the click: Mind Elixir drops a click after any pointer
     * movement at all, and a fingertip nearly always moves a pixel or two.
     */
    private onFoldClick(event: MouseEvent): void {
        const button = event.target as HTMLElement | null;
        if (button?.tagName !== "ME-EPD") return;
        event.stopPropagation();
        const topic = button.previousElementSibling;
        if (this.mind && topic?.tagName === "ME-TPC" && !this.wasDrag(event)) this.mind.expandNode(topic as Topic);
    }

    /** Tapping a topic selects it; tapping the same topic again opens it. Works the same with a mouse and a finger. */
    private onClick(event: MouseEvent): void {
        if (this.wasDrag(event)) return;
        const target = event.target as HTMLElement | null;
        const topic = target?.closest("me-tpc") as (HTMLElement & { nodeObj?: NodeObj }) | null;
        const id = topic?.nodeObj?.id;
        if (!id) return;
        if (this.lastTapped === id) {
            const node = this.nodes.get(id);
            if (node) this.events.onOpen(node);
            return;
        }
        this.lastTapped = id;
    }
}
