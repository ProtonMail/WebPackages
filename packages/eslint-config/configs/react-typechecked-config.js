import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import { importConfig } from "./import-config.js";
import { allGlobs, jsGlobs } from "../globs.js";

export const reactTypeCheckedConfig = defineConfig([
    {
        files: allGlobs,
        extends: [
            js.configs.recommended,
            tseslint.configs.recommendedTypeChecked,
            tseslint.configs.stylisticTypeChecked,
            react.configs.flat.recommended,
            react.configs.flat["jsx-runtime"],
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
            importConfig,
        ],
        settings: {
            react: { version: "detect" },
        },
        languageOptions: {
            ...react.configs.flat.recommended.languageOptions,
            ecmaVersion: 2020,
            globals: globals.browser,
            parserOptions: {
                projectService: true,
            },
        },
    },
    {
        files: jsGlobs,
        extends: [tseslint.configs.disableTypeChecked],
    },
]);
