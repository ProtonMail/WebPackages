import enforceUint8ArrayArraybuffer from "./rules/enforce-uint8array-arraybuffer.ts";

const plugin = {
  rules: {
    "enforce-uint8array-arraybuffer": enforceUint8ArrayArraybuffer,
  },
};

export default plugin;
