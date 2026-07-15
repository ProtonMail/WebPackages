# eslint-plugin-enforce-uint8array-arraybuffer

This ESLint rule enforces that any `Uint8Array` type declaration explicitly includes `<ArrayBuffer>` as its generic parameter.
An auto-fix feature is also implemented.

Using `<ArrayBuffer>` ensures compatibility with WebCrypto APIs, `Blob`s, and other browser features, following a TS [change](https://github.com/microsoft/TypeScript/pull/59417) in v5.9 the default `ArrayBufferLike` parameter is no longer guaranteed to be compatible with `ArrayBuffer` (due to differences with `SharedArrayBuffer`) .

## Installation

```sh
npm i --save-dev @protontech/eslint-plugin-enforce-uint8array-arraybuffer
```

## Usage

Add the plugin and rule to your ESLint config:

```js
import pluginEnforceUint8ArrayArrayBuffer from "@protontech/eslint-plugin-enforce-uint8array-arraybuffer";

export default defineConfig({
  plugins: {
    "@protontech/enforce-uint8array-arraybuffer":
      pluginEnforceUint8ArrayArrayBuffer,
  },
  rules: {
    "@protontech/enforce-uint8array-arraybuffer/enforce-uint8array-arraybuffer":
      "error",
  },
});
```

## Example behavior

These usages are correct:

```ts
const a = new Uint8Array(); // this is automatically instantiated as Uint8Array<ArrayBuffer>
function f(data: Uint8Array<ArrayBuffer>) {}
type T = Promise<Uint8Array<ArrayBuffer>[]>;
```

While these will trigger eslint errors (`Uint8Array must be used as Uint8Array<ArrayBuffer>`), but can be auto-fixed.

```ts
function f(data: Uint8Array) {} // missingGeneric error
type T = Promise<Uint8Array[]>; // missingGeneric error
```

If a generic argument is specified other than `ArrayBuffer`, the linter will also error (`Uint8Array generic argument must be exactly 'ArrayBuffer'`), but it will require manual resolution:

```ts
function f(data: Uint8Array<ArrayBufferLike>) {} // wrongGeneric error
```
