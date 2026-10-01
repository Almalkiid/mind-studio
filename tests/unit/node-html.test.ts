import { cardHtml, escapeHtml } from "src/render/node-html";
import { MapNode } from "src/tree/types";

function node(overrides: Partial<MapNode>): MapNode {
    return { id: "a.md", kind: "note", label: "Risk", path: "a.md", children: [], ...overrides };
}

describe("escapeHtml", () => {
    test("escapes the characters that could start markup or end an attribute", () => {
        expect(escapeHtml(`<img src=x onerror="a()"> & 'b'`)).toBe(
            "&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;b&#39;",
        );
    });
});

describe("cardHtml", () => {
    test("renders a heading's text and tag as text, never as markup", () => {
        const html = cardHtml(node({ label: "<b>Bold</b> & co", tag: "<i>3a</i>" }), 2, 0);
        expect(html).not.toContain("<b>");
        expect(html).not.toContain("<i>");
        expect(html).toContain("&lt;b&gt;Bold&lt;/b&gt; &amp; co");
        expect(html).toContain('<span class="ms-tag">&lt;i&gt;3a&lt;/i&gt;</span>');
    });

    test("marks the centre, the first ring and deeper topics, with the branch colour and the kind", () => {
        expect(cardHtml(node({ kind: "folder" }), 0, null)).toMatch(/^<div class="ms-card ms-root ms-kind-folder">/);
        expect(cardHtml(node({}), 1, 3)).toMatch(/^<div class="ms-card ms-main ms-kind-note ms-branch-3">/);
        expect(cardHtml(node({ kind: "heading" }), 2, 3)).toMatch(/^<div class="ms-card ms-sub ms-kind-heading ms-branch-3">/);
    });

    test("shows how many sub-topics a topic has, and nothing for a topic without any", () => {
        const parent = node({ children: [node({ id: "b" }), node({ id: "c" })] });
        expect(cardHtml(parent, 1, 0)).toContain('<span class="ms-count">2</span>');
        expect(cardHtml(node({}), 1, 0)).not.toContain("ms-count");
    });

    test("leaves the tag out when there is none", () => {
        expect(cardHtml(node({}), 1, 0)).not.toContain("ms-tag");
    });

    test("the centre says how many topics branch from it", () => {
        const root = node({ kind: "folder", label: "Part2", children: [node({ id: "b" })] });
        expect(cardHtml(root, 0, null)).toContain('<span class="ms-meta">1 topic</span>');
        root.children.push(node({ id: "c" }));
        expect(cardHtml(root, 0, null)).toContain('<span class="ms-meta">2 topics</span>');
    });
});
