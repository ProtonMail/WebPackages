import { packageTypeCheckedConfig } from "@protontech/eslint-config/package-typechecked-config.js";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
    globalIgnores(["dist"]),
    packageTypeCheckedConfig,
]);
