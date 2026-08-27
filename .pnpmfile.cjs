/**
 * See https://pnpm.io/pnpmfile#hooksreadpackagepkg-context-pkg--promisepkg
 */
function readPackage(pkg) {
  /**
   * Change typescript-eslint dependencies and install ts6 as a dependency, instead of
   * relying on typescript as a peerDependency, since we need the workspace to move to ts7,
   * which is currently not compatible with typescript-eslint
   * (see https://github.com/typescript-eslint/typescript-eslint/issues/10940)
   */
  if (pkg.name === "typescript-eslint" || pkg.name.startsWith("@typescript-eslint/")) {
    if (pkg.peerDependencies?.typescript) {
      delete pkg.peerDependencies.typescript;
      pkg.dependencies = { ...pkg.dependencies, typescript: "~6.0.3" };
    }
  }

  /**
   * Install ts6 as a dependency of dependency-cruiser, since we need the workspace to move
   * to ts7 and dependency-cruiser only supports `typescript: >=2.0.0 <7.0.0` for now.
   * It resolves the transpiler from its own scope and does not declare typescript as a
   * peerDependency, so without this it silently misses TypeScript sources and dependencies.
   */
  if (pkg.name === "dependency-cruiser") {
    pkg.dependencies = { ...pkg.dependencies, typescript: "~6.0.3" };
  }

  return pkg;
}
module.exports = { hooks: { readPackage } };