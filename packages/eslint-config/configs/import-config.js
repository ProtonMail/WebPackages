import importPlugin from "eslint-plugin-import";
import { defineConfig } from "eslint/config";
import { tsGlobs, allGlobs, allExtensions, tsExtensions } from "../globs.js";

export const importConfig = defineConfig([
    {
        name: "global-import-rules",
        files: allGlobs,
        extends: [importPlugin.flatConfigs.typescript],
        rules: {
            "import/extensions": [
                "error",
                "ignorePackages",
                {
                    ts: "always",
                    tsx: "always",
                    js: "always",
                    jsx: "always",
                },
            ],
            "import/no-cycle": "error",
            "import/no-extraneous-dependencies": "error",
        },
        settings: {
            "import/extensions": allExtensions,
            "import/external-module-folders": [
                "node_modules",
                "node_modules/@types",
            ],
            "import/parsers": {
                "@typescript-eslint/parser": tsExtensions,
            },
            "import/resolver": {
                node: {
                    extensions: allExtensions,
                },
                typescript: true,
            },
        },
    },
    {
        name: "typescript-import-rules",
        files: tsGlobs,
        rules: {
            // Disable these, TypeScript provides the same checks as part of standard type checking:
            "import/named": "off",
            "import/namespace": "off",
            "import/default": "off",
            "import/order": "off",
            "import/no-named-as-default-member": "off",
            "import/no-unresolved": "off",
        },
    },
]);
