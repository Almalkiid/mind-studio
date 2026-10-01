import { readFileSync } from "fs";
import * as path from "path";
import { env } from "process";
import { parseObsidianVersions } from "wdio-obsidian-service";

// wdio-obsidian-service downloads Obsidian versions into this directory (gitignored).
const cacheDir = path.resolve(".obsidian-cache");

// Obsidian app/installer version(s) to test, "app/installer" space separated. Override with OBSIDIAN_VERSIONS.
const versions = await parseObsidianVersions(env.OBSIDIAN_VERSIONS ?? "latest/latest", { cacheDir });

// `pnpm test:e2e` builds the plugin and copies main.js, manifest.json and styles.css here (tests/e2e/stage-plugin.mjs).
const pluginDir = ".e2e-plugin";
// E2E_VAULT points a run at another vault, e.g. a copy of real notes for screenshots
const vaultDir = env.E2E_VAULT ?? "tests/e2e/vault";

export const config: WebdriverIO.Config = {
    runner: "local",
    framework: "mocha",

    specs: ["./tests/e2e/specs/**/*.e2e.ts"],

    // Desktop and mobile run in parallel, each in its own sandboxed Obsidian with its own vault copy.
    maxInstances: Number(env.WDIO_MAX_INSTANCES || 2),

    capabilities: [
        ...versions.map<WebdriverIO.Capabilities>(([appVersion, installerVersion]) => ({
            browserName: "obsidian",
            "wdio:obsidianOptions": { appVersion, installerVersion, plugins: [pluginDir], vault: vaultDir },
        })),
        // Emulated phone: desktop Electron with Obsidian's app.emulateMobile(true) and a phone-sized window.
        ...versions.map<WebdriverIO.Capabilities>(([appVersion, installerVersion]) => ({
            browserName: "obsidian",
            "wdio:obsidianOptions": {
                appVersion,
                installerVersion,
                emulateMobile: true,
                plugins: [pluginDir],
                vault: vaultDir,
            },
            "goog:chromeOptions": { mobileEmulation: { deviceMetrics: { width: 390, height: 844 } } },
        })),
    ],

    services: ["obsidian"],
    reporters: ["obsidian"],

    mochaOpts: { ui: "bdd", timeout: 60 * 1000 },
    waitforInterval: 250,
    waitforTimeout: 10 * 1000,
    logLevel: "warn",

    cacheDir,

    injectGlobals: false,

    before: async () => {
        const { browser } = await import("@wdio/globals");
        const pluginId = (JSON.parse(readFileSync(path.resolve("manifest.json"), "utf8")) as { id: string }).id;
        await browser.waitUntil(
            () =>
                browser.executeObsidian(({ app }, id) => {
                    const plugins = (app as unknown as { plugins: { plugins: Record<string, unknown> } }).plugins
                        .plugins;
                    return plugins[id] !== undefined;
                }, pluginId),
            { timeout: 30 * 1000, timeoutMsg: `plugin ${pluginId} did not load` },
        );
    },
};
