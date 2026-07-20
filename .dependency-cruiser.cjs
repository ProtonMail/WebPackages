/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: "dependency-cruiser/configs/recommended",
  forbidden: [
    {
      // Override the recommended no-circular rule: ignore cycles that only
      // close through an `import type` edge. These are erased at compile time
      // (e.g. pmcrypto.js barrel <-> submodule type imports) and are not real
      // runtime cycles.
      name: "no-circular",
      severity: "error",
      from: {},
      to: {
        circular: true,
        viaOnly: { dependencyTypesNot: ["type-only"] },
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // Count `import type` edges; several modules are consumed type-only and
    // would otherwise show up as false "orphans".
    tsPreCompilationDeps: true,
    // dist/ is generated build output; oxlint/eslint config files are tooling
    // config, neither belongs in the source dependency graph.
    exclude: "(^|/)(dist|oxlint\\.config\\.ts$|eslint\\.config\\.js$)",
    enhancedResolveOptions: {
      // Honor package.json "exports" maps (workspace packages + subpath deps
      // like openpgp/lightweight are exposed through them).
      exportsFields: ["exports"],
      // "browser"/"types" are needed for deps like openpgp whose subpaths
      // (openpgp/lightweight) are only exposed under those conditions.
      conditionNames: ["import", "require", "browser", "types", "default"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".d.ts"],
    },
  },
};
