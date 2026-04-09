import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import { importConfig } from "./import-config.js";
import { allGlobs } from "../globs.js";
import { uint8ArrayConfig } from "./uint8array-config.js";

export const packageConfig = defineConfig([
    js.configs.recommended,
    tseslint.configs.strict,
    importConfig,
    uint8ArrayConfig,
    {
        languageOptions: {
            ...react.configs.flat.recommended.languageOptions,
            ecmaVersion: 2020,
            globals: globals.browser,
        },
    },
]);
