import type { KnipConfig } from "knip";

const config: KnipConfig = {
  tags: ["-lintignore"],
  workspaces: {
    ".": {},
  },
  ignoreDependencies: [
    // TODO:
    // Remove this when removing/resolving eslint import
    // eslint-import-resolver-typescript  packages/eslint-config/package.json:18:10
    "eslint-import-resolver-typescript",
  ],
};

export default config;
