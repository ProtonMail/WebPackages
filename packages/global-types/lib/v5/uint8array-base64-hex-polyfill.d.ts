export {};

// Uint8Array native base64 helpers only have TS definitions from v6 (with ESnext target),
// as they are only available in some browsers (https://github.com/microsoft/TypeScript/issues/30855#issuecomment-1432931820),
// but we polyfill them.

type OptionsFromBase64 = {
  alphabet?: "base64" | "base64url";
  lastChunkHandling?: "loose" | "strict" | "stop-before-partial";
};

declare global {
  interface Uint8ArrayConstructor {
    /** https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/fromBase64 */
    fromBase64: (
      base64: string,
      options?: OptionsFromBase64,
    ) => Uint8Array<ArrayBuffer>;
    /** https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/fromHex */
    fromHex: (hex: string) => Uint8Array<ArrayBuffer>;
  }

  interface Uint8Array {
    /** https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/toBase64 */
    toBase64: (options?: {
      alphabet?: "base64" | "base64url";
      omitPadding?: boolean;
    }) => string;
    setFromBase64(
      base64: string,
      options?: OptionsFromBase64,
    ): { read: number; written: number };
    /** https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/toHex */
    toHex: () => string;
  }
}
