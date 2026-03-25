import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import { importRules } from "./import.js";
import { allGlobs } from "./globs.js";

export const eslintConfigReact = defineConfig([
    {
        files: allGlobs,
        extends: [
            js.configs.recommended,
            tseslint.configs.strict,
            react.configs.flat.recommended,
            react.configs.flat["jsx-runtime"],
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
            importRules,
        ],
        settings: {
            react: { version: "detect" },
        },
        languageOptions: {
            ...react.configs.flat.recommended.languageOptions,
            ecmaVersion: 2020,
            globals: globals.browser,
        },
    },
]);
