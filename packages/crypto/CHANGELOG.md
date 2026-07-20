# @protontech/crypto

## 2.1.1

### Patch Changes

- d57b179: CryptoProxy: add back `computeHashStream` (fix blocking behavior); this is technically a breaking API change for the specific function, but since it fixes an issue with it, we just mark it as a patch

## 2.1.0

### Minor Changes

- c1c0825: CryptoProxy: implement `encryptMessageStream`/`decryptMessageStream`.

## 2.0.1

### Patch Changes

- 2440b8c: Fix some exported types used by web-clients and drop unused bigInteger export

## 2.0.0

### Major Changes

- 6103406: Migrate crypto package from web-clients monorepo.
  Breaking change: existing `exports` paths have been updated too.

### Minor Changes

- f75de3d: Move pmcrypto inside the package
- ebd250e: Move srp module from monorepo to this package

## 1.0.2

### Patch Changes

- 48e84aa: Update to new lint config
