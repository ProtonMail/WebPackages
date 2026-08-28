# @protontech/eslint-plugin-enforce-uint8array-arraybuffer

## 3.0.2

### Patch Changes

- 20b4039: Type the plugin as ESLint's `ESLint.Plugin` so type-checked flat configs accept it.

  `@typescript-eslint/utils` still types rule contexts with the helpers ESLint 10 removed (`parserPath`, `getAncestors`, ...), so a rule built with `ESLintUtils.RuleCreator` is not assignable to ESLint's `RuleDefinition`. Consumers registering this plugin in a type-checked config hit `TS2322: Type '{ rules: ... }' is not assignable to type 'Plugin'`.

  The rule is now written against ESLint's own `RuleDefinition`, parameterised with the rule's message ids and the TS-ESTree node types, so no casts are needed and the rule keeps full type checking. Behaviour is unchanged.

  `eslint` is now declared as a peer dependency (`^9.0.0 || ^10.0.0`).

## 3.0.1

### Patch Changes

- a5ba2f9: Ship the plugin as compiled JavaScript instead of raw TypeScript.

  The published package now contains `dist/` (compiled `.js` plus `.d.ts`) built with `tsc`, and its `main`/`types`/`exports` point there via `publishConfig` — so consumers no longer need to strip types at runtime to load the plugin. Development within the monorepo continues to resolve to the TypeScript source.

## 3.0.0

### Major Changes

- 86a90cf: Migrate to typescript and update dependencies
