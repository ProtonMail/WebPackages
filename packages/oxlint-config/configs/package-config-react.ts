import { defineConfig } from "oxlint";

import { packageConfig } from "./package-config.ts";

/**
 * Shared oxlint configuration for the monorepo's React packages.
 *
 * This is the base `packageConfig` with the `react` plugin layered on: it picks
 * up React's `correctness`-category rules (via the base's `categories` setting)
 * on top of the shared TypeScript/import set. Packages that don't use React
 * should extend `packageConfig` (./package-config) directly instead.
 *
 * `plugins` overwrites oxlint's default set rather than merging, so we rebuild
 * the full list from the base's plugins plus `react`.
 */
export const packageReactConfig = defineConfig({
    ...packageConfig,
    plugins: [...packageConfig.plugins, "react"],
});
