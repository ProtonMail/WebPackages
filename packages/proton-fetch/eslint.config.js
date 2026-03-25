import { eslintConfigPackage } from "@protontech/eslint-config/package-config";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([globalIgnores(["dist"]), eslintConfigPackage]);
