import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import next from "@next/eslint-plugin-next";

// The one eslint flat config for the monorepo, consumed via the root
// eslint.config.js re-export (`pnpm lint` runs `eslint .` at the root).
//
// Token-foundation and a11y rules run at "error" in both tiers (packages and
// apps). The complementary arbitrary-value scan (scripts/check-tokens.mjs)
// enforces via a per-file baseline ratchet: existing debt is budgeted in
// scripts/check-tokens.baseline.json, any new ad-hoc value fails, and the
// baseline only ever ratchets down. Escape hatch for a genuinely token-less
// case: `token-exempt: <reason>` on or above the line.
const APP_FOUNDATION_SEVERITY = "error";
const PKG_FOUNDATION_SEVERITY = "error";

// Any hex colour literal (3+ hex digits after "#").
const HEX = "#[0-9a-fA-F]{3}";

// Hex colour literals do not belong in className/style props: every colour
// comes from the token layer (--caliber-*, --color-*, the Tailwind theme
// utilities). Template-literal and cn(...) compositions are covered by the
// TemplateElement/descendant selectors.
function foundationRules(severity) {
  const message =
    "Hex colours are banned in markup: use a design token (--caliber-*/--color-* variable or a theme utility class) instead.";
  return {
    "no-restricted-syntax": [
      severity,
      {
        selector: `JSXAttribute[name.name='className'] Literal[value=/${HEX}/]`,
        message,
      },
      {
        selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=/${HEX}/]`,
        message,
      },
      {
        selector: `JSXAttribute[name.name='style'] Literal[value=/${HEX}/]`,
        message,
      },
      {
        selector: `JSXAttribute[name.name='style'] TemplateElement[value.raw=/${HEX}/]`,
        message,
      },
    ],
  };
}

// jsx-a11y recommended, re-levelled to one severity so the apps tier can run
// report-only during adoption. Rules the preset turns off (deprecated or
// opt-in variants) stay off rather than being promoted.
function a11yRules(severity) {
  return Object.fromEntries(
    Object.entries(jsxA11y.configs.recommended.rules)
      .filter(([, level]) => (Array.isArray(level) ? level[0] : level) !== "off")
      .map(([rule, level]) => [
        rule,
        Array.isArray(level) ? [severity, ...level.slice(1)] : severity,
      ]),
  );
}

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/node_modules/**",
      "**/src/generated/**",
      "**/next-env.d.ts",
      "**/mockServiceWorker.js",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Node scripts (repo gates, generators) run under Node, not the browser.
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  // React hooks correctness applies everywhere components/hooks are written.
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  // Enforced tier: shared packages.
  {
    files: ["packages/**/*.tsx"],
    rules: {
      ...a11yRules(PKG_FOUNDATION_SEVERITY),
      ...foundationRules(PKG_FOUNDATION_SEVERITY),
    },
  },
  // App tier: same severities, plus the Next.js rules (the app surfaces are
  // the only Next applications; the auth harness is a dev-only fixture).
  {
    files: ["apps/**/*.tsx"],
    rules: {
      ...a11yRules(APP_FOUNDATION_SEVERITY),
      ...foundationRules(APP_FOUNDATION_SEVERITY),
    },
  },
  {
    files: ["apps/**/*.{ts,tsx}"],
    plugins: {
      "@next/next": next,
    },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
      // Pages-router rule; every app here is App Router, so it can only
      // misfire (and prints a "Pages directory cannot be found" banner).
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  // A labelled scrollable region carrying tabIndex is the sanctioned pattern
  // for WCAG 2.1.1 / axe scrollable-region-focusable (the shared Table
  // container); allow the region role alongside the preset's tabpanel.
  {
    files: ["**/*.tsx"],
    rules: {
      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        { roles: ["tabpanel", "region"], allowExpressionValues: true },
      ],
    },
  },
);
