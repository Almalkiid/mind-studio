import console from "console";
import esbuild from "esbuild";
import fs from "fs";
import { builtinModules } from "node:module";
import path from "path";
import process from "process";

const prod = process.argv[2] === "production";

// Obsidian installs styles.css from the repository root, not from build/, so the bundled CSS is moved there.
const moveToRootPlugin = {
    name: "move-to-root",
    setup(build) {
        build.onEnd(() => {
            const cssFile = path.join("build", "main.css");
            if (fs.existsSync(cssFile)) {
                const contents = fs
                    .readFileSync(cssFile, "utf8")
                    .replace(/\/\*#\s*sourceMappingURL=.*?\*\/\s*$/s, "");
                fs.writeFileSync("styles.css", contents);
                fs.rmSync(cssFile);
                console.log("✓ CSS bundled to styles.css");
            }
        });
    },
};

const context = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: ["obsidian", "electron", ...builtinModules],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    sourcesContent: !prod,
    minify: prod,
    treeShaking: true,
    outfile: "build/main.js",
    loader: { ".css": "css" },
    plugins: [moveToRootPlugin],
});

if (prod) {
    try {
        await context.rebuild();
    } catch {
        process.exit(1);
    } finally {
        await context.dispose();
    }
} else {
    context.watch().catch(() => process.exit(1));
}
