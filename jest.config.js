/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/tests/unit/"],
    moduleNameMapper: { "^src/(.*)$": "<rootDir>/src/$1" },
    collectCoverageFrom: ["src/tree/build-tree.ts", "src/render/node-html.ts"],
};
