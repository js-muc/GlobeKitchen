/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.test.ts",
    "<rootDir>/src/**/*.test.ts",
  ],
  moduleFileExtensions: ["ts", "js"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  // optional: ignore node:test files if any slipped in
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  setupFiles: ["<rootDir>/jest.setup-env.ts"],
  setupFiles: ["<rootDir>/jest.setup-env.ts"],
};
