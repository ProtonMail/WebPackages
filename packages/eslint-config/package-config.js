import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import { importRules } from "./import.js";
import { allGlobs } from "./globs.js";
import pluginEnforceUint8ArrayArrayBuffer from "@protontech/eslint-plugin-enforce-uint8array-arraybuffer";

export const eslintConfigPackage = defineConfig([
    {
        files: allGlobs,
        extends: [js.configs.recommended, tseslint.configs.strict, importRules],
        languageOptions: {
            ...react.configs.flat.recommended.languageOptions,
            ecmaVersion: 2020,
            globals: globals.browser,
        },
        plugins: {
            "@protontech/enforce-uint8array-arraybuffer":
                pluginEnforceUint8ArrayArrayBuffer,
        },
        rules: {
            "@protontech/enforce-uint8array-arraybuffer/enforce-uint8array-arraybuffer":
                "error",
        },
    },
]);
