import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import { importRules } from "./import.js";
import { allGlobs } from "./globs.js";

export const eslintConfigPackage = defineConfig([
    {
        files: allGlobs,
        extends: [js.configs.recommended, tseslint.configs.strict, importRules],
        languageOptions: {
            ...react.configs.flat.recommended.languageOptions,
            ecmaVersion: 2020,
            globals: globals.browser,
        },
    },
]);
