import type { ESLint } from "eslint";

import enforceUint8ArrayArraybuffer from "./rules/enforce-uint8array-arraybuffer.ts";

const plugin: ESLint.Plugin = {
  rules: {
    "enforce-uint8array-arraybuffer": enforceUint8ArrayArraybuffer,
  },
};

export default plugin;
