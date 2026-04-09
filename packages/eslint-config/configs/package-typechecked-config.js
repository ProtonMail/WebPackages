import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import { importConfig } from "./import-config.js";
import { allGlobs, jsGlobs, tsGlobs } from "../globs.js";
import { uint8ArrayConfig } from "./uint8array-config.js";

export const packageTypeCheckedConfig = defineConfig([
    {
        files: allGlobs,
        extends: [
            js.configs.recommended,
            tseslint.configs.recommendedTypeChecked,
            tseslint.configs.stylisticTypeChecked,
            importConfig,
            uint8ArrayConfig,
        ],
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
    {
        files: tsGlobs,
        rules: {
            "@typescript-eslint/no-empty-function": "off",
        },
    },
]);
