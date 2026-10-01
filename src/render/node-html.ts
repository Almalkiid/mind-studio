import { MapNode } from "src/tree/types";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Card HTML is built from file names and headings, so every piece of vault text goes through this. */
export function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function ring(depth: number): string {
    if (depth === 0) return "ms-root";
    return depth === 1 ? "ms-main" : "ms-sub";
}

/**
 * The inside of one card. `branch` is the colour slot of the first-ring branch the topic belongs to, null for the
 * centre. Colours come from styles.css, so light and dark mode follow Obsidian without re-rendering.
 */
export function cardHtml(node: MapNode, depth: number, branch: number | null): string {
    const classes = ["ms-card", ring(depth), `ms-kind-${node.kind}`];
    if (branch !== null) classes.push(`ms-branch-${branch}`);

    const parts: string[] = [];
    if (node.tag !== undefined) parts.push(`<span class="ms-tag">${escapeHtml(node.tag)}</span>`);
    parts.push(`<span class="ms-text">${escapeHtml(node.label)}</span>`);
    if (depth === 0) {
        const count = node.children.length;
        parts.push(`<span class="ms-meta">${count} ${count === 1 ? "topic" : "topics"}</span>`);
    } else if (node.children.length > 0) {
        parts.push(`<span class="ms-count">${node.children.length}</span>`);
    }
    return `<div class="${classes.join(" ")}">${parts.join("")}</div>`;
}
