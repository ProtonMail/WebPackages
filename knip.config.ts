import type { KnipConfig } from "knip";

const config: KnipConfig = {
  tags: ["-lintignore"],
  workspaces: {
    ".": {},
  },
  ignoreDependencies: [
    // Consumed by oxlint as a JS plugin via a `jsPlugins` specifier string in
    // @protontech/oxlint-config, so it is not statically importable/detectable.
    "@protontech/eslint-plugin-enforce-uint8array-arraybuffer",
  ],
};

export default config;
