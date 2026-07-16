# @protontech/eslint-plugin-enforce-uint8array-arraybuffer

## 3.0.1

### Patch Changes

- a5ba2f9: Ship the plugin as compiled JavaScript instead of raw TypeScript.

  The published package now contains `dist/` (compiled `.js` plus `.d.ts`) built with `tsc`, and its `main`/`types`/`exports` point there via `publishConfig` — so consumers no longer need to strip types at runtime to load the plugin. Development within the monorepo continues to resolve to the TypeScript source.

## 3.0.0

### Major Changes

- 86a90cf: Migrate to typescript and update dependencies
