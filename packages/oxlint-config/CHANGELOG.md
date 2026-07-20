# @protontech/oxlint-config

## 1.1.0

### Minor Changes

- 257e6b8: Add `@protontech/oxlint-config`, a shared oxlint base configuration.

    This is the oxlint successor to `@protontech/eslint-config` (which has been removed). Each package now extends this base from its own `oxlint.config.ts`. The base reproduces typescript-eslint's `recommendedTypeChecked` + `stylisticTypeChecked` rule sets (the presets the former `packageTypeCheckedConfig` enabled), mapped to oxlint's rule names, so lint coverage stays on par with the ESLint setup. It also keeps the custom `enforce-uint8array-arraybuffer` rule (loaded as an oxlint JS plugin) and enables type-aware linting.
