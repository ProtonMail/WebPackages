# @protontech/oxlint-config

## 1.1.2

### Patch Changes

- 8fc862b: Enable the recommended React rules in `packageReactConfig`.

    The React config now explicitly enables the `eslint-plugin-react-hooks` `recommended` set (`react/rules-of-hooks`, `react/exhaustive-deps`) and the `eslint-plugin-react` `recommended` set (`react/display-name`, `react/jsx-no-target-blank`, `react/no-unescaped-entities`, `react/no-unknown-property`, `react/require-render-return`, and others), mapped to oxlint's rule names. Notably this adds `react/rules-of-hooks`, which oxlint places outside the `correctness` category and so was not previously enforced. `react/react-in-jsx-scope` is intentionally omitted as it is incompatible with the automatic JSX transform.

## 1.1.1

### Patch Changes

- 152a8c1: Ship the config as compiled JavaScript instead of raw TypeScript.

    The published package now contains `dist/` (compiled `.js` plus `.d.ts`) built with `tsc` at `prepack`, and its `exports` point there via `publishConfig` — so consumers no longer need to strip types at runtime to load the config. Development within the monorepo continues to resolve to the TypeScript source.

## 1.1.0

### Minor Changes

- 257e6b8: Add `@protontech/oxlint-config`, a shared oxlint base configuration.

    This is the oxlint successor to `@protontech/eslint-config` (which has been removed). Each package now extends this base from its own `oxlint.config.ts`. The base reproduces typescript-eslint's `recommendedTypeChecked` + `stylisticTypeChecked` rule sets (the presets the former `packageTypeCheckedConfig` enabled), mapped to oxlint's rule names, so lint coverage stays on par with the ESLint setup. It also keeps the custom `enforce-uint8array-arraybuffer` rule (loaded as an oxlint JS plugin) and enables type-aware linting.
