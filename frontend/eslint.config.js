// Monorepo-wide lint entry: the shared flat config in packages/config governs
// every app and package (including its staged foundation-rule severities).
export { default } from "./packages/config/eslint.config.js";
