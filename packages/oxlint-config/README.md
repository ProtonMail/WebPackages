# @protontech/oxlint-config

Shared [oxlint](https://oxc.rs/docs/guide/usage/linter) configuration for Proton
packages. Provides a base config (`package-config.ts`) and a React variant
(`package-config-react.ts`) that each package's `oxlint.config.ts` extends.

## Usage

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";
import { packageConfig } from "@protontech/oxlint-config/package-config.ts";

export default defineConfig({
    ...packageConfig,
    options: {
        // Enable type-aware linting in the package's own (root) config.
        typeAware: true,
    },
});
```

## Peer dependencies

This config is a thin layer over `oxlint` and one custom JS plugin, both declared
as **peer dependencies**:

- `oxlint`
- `@protontech/eslint-plugin-enforce-uint8array-arraybuffer`

They are peers rather than direct dependencies because oxlint resolves a
`jsPlugins` specifier (and `defineConfig`) relative to the **project being
linted**, not relative to this package. The plugin must therefore be resolvable
from the consumer's own `node_modules`.

Most consumers don't need to list them by hand:

- **pnpm** (`auto-install-peers`, default on) and **npm 7+** install missing
  peers automatically.
- **Yarn** (classic and Berry) does _not_ auto-install peers — Yarn users must
  add both packages to their own `package.json`.

If your package manager uses a strict/symlinked layout and oxlint reports
`Cannot find module '@protontech/eslint-plugin-enforce-uint8array-arraybuffer'`,
either add the plugin as a direct dependency of the consuming package or hoist
it to the workspace root (e.g. pnpm `publicHoistPattern`).
