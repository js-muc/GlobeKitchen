const path = require("path");

/** @type {import("next").NextConfig} */
module.exports = {
  // Tell Turbopack where the monorepo root is (where pnpm-lock.yaml lives)
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
};
