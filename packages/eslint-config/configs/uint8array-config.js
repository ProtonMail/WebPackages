import { defineConfig } from "eslint/config";
import pluginEnforceUint8ArrayArrayBuffer from "@protontech/eslint-plugin-enforce-uint8array-arraybuffer";
import { tsGlobs } from "../globs.js";

export const uint8ArrayConfig = defineConfig([
    {
        files: tsGlobs,
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
