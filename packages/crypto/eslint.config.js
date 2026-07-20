import stylistic from "@stylistic/eslint-plugin";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

/**
 * Minimal ESLint config for the crypto package ONLY.
 *
 * oxlint (see oxlint.config.ts) handles all correctness/type-aware linting, but
 * it intentionally implements no formatting rules and has no `@stylistic`
 * equivalent. Because this package is deliberately excluded from Prettier
 * (see the repo `.prettierignore`), these three stylistic rules are its only
 * automated style enforcement, so they are kept on ESLint here.
 *
 * These rules are purely syntactic, so no type information / tsconfig project is
 * needed — the TS parser alone is enough.
 */
export default defineConfig([
    globalIgnores(["dist"]),
    {
        files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.mjs", "**/*.cjs"],
        languageOptions: {
            parser: tseslint.parser,
        },
        plugins: {
            "@stylistic": stylistic,
            // Registered (not enabled) only so the many `@typescript-eslint/*`
            // eslint disable directives in the source resolve to a definition.
            // Those rules are owned by oxlint, not run here.
            "@typescript-eslint": tseslint.plugin,
        },
        linterOptions: {
            // The source has eslint-disable directives for rules oxlint now owns;
            // from ESLint's view they are unused. Don't report them — ESLint only
            // runs the three stylistic rules below.
            reportUnusedDisableDirectives: "off",
        },
        rules: {
            "@stylistic/indent": ["error", 4],
            "@stylistic/quotes": ["error", "double", { avoidEscape: true }],
            "@stylistic/no-multiple-empty-lines": ["error", { max: 1 }],
        },
    },
]);
