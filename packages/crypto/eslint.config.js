import { packageTypeCheckedConfig } from "@protontech/eslint-config/package-typechecked-config.js";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
    globalIgnores(["dist"]),
    packageTypeCheckedConfig,
    {
        rules: {
            "no-unused-expressions": "off",
            "@typescript-eslint/no-unused-expressions": "off", // for the `expect` statements in the tests
        },
    },
]);
