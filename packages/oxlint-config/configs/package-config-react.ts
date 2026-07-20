import { defineConfig } from "oxlint";

import { packageConfig } from "./package-config.ts";

/**
 * Shared oxlint configuration for the monorepo's React packages.
 *
 * This is the base `packageConfig` with the `react` plugin layered on: it picks
 * up React's `correctness`-category rules (via the base's `categories` setting)
 * on top of the shared TypeScript/import set. Packages that don't use React
 * should extend `packageConfig` (./package-config) directly instead.
 *
 * `plugins` overwrites oxlint's default set rather than merging, so we rebuild
 * the full list from the base's plugins plus `react`.
 *
 * Rule parity: oxlint ships no `react/recommended` preset, so the `rules` block
 * below reproduces the two upstream recommended sets — `eslint-plugin-react`'s
 * `recommended` and `eslint-plugin-react-hooks`' `recommended` — mapped to
 * oxlint's `react/*` rule names. As in the base config, the list is explicit
 * rather than left to oxlint's categories: it pins the exact rules regardless
 * of how oxlint categorises them (e.g. `react/rules-of-hooks` currently lives
 * in `pedantic`, not `correctness`, so relying on the category alone would miss
 * it). Rules already guaranteed by the base's `correctness` category are listed
 * here anyway so the recommended set stays intact if oxlint recategorises them.
 *
 * Deliberate omissions from the upstream `recommended` set:
 *  - `react/react-in-jsx-scope` — required only under the classic JSX runtime.
 *    Our packages use the automatic JSX transform (React 17+), where importing
 *    React into scope is unnecessary, so enabling it would be counterproductive.
 *  - `jsx-uses-react` / `jsx-uses-vars` / `no-deprecated` / `prop-types` — not
 *    implemented by oxlint; the relevant no-unused checks are covered by the
 *    base config's `no-unused-vars` and by TypeScript.
 */
export const packageReactConfig = defineConfig({
    ...packageConfig,
    plugins: [...packageConfig.plugins, "react"],
    rules: {
        ...packageConfig.rules,

        // --- eslint-plugin-react-hooks `recommended` ---
        "react/rules-of-hooks": "error",
        "react/exhaustive-deps": "error",

        // --- eslint-plugin-react `recommended` ---
        "react/display-name": "error",
        "react/jsx-key": "error",
        "react/jsx-no-comment-textnodes": "error",
        "react/jsx-no-duplicate-props": "error",
        "react/jsx-no-target-blank": "error",
        "react/jsx-no-undef": "error",
        "react/no-children-prop": "error",
        "react/no-danger-with-children": "error",
        "react/no-direct-mutation-state": "error",
        "react/no-find-dom-node": "error",
        "react/no-is-mounted": "error",
        "react/no-render-return-value": "error",
        "react/no-string-refs": "error",
        "react/no-unescaped-entities": "error",
        "react/no-unknown-property": "error",
        "react/require-render-return": "error",
    },
});
