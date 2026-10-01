import eslint from "@eslint/js";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    ...obsidianmd.configs.recommended,
    {
        languageOptions: {
            parserOptions: { projectService: true },
        },
    },
    {
        // Jest's describe/test/expect are globals; TypeScript already checks them
        files: ["tests/**"],
        rules: { "no-undef": "off" },
    },
    {
        ignores: ["build/", "node_modules/", "main.js", "esbuild.config.mjs", "jest.config.js", "eslint.config.mjs"],
    },
);
