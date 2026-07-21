import { defineConfig } from "oxlint";

/**
 * Shared base oxlint configuration for the monorepo's packages.
 *
 * This is the oxlint successor to the former `@protontech/eslint-config`. Each
 * package's `oxlint.config.ts` extends this base and layers on package-specific
 * rules, mirroring the previous per-package-config-extends-shared-base setup.
 *
 * Rule parity: the `rules` block below reproduces typescript-eslint's
 * `recommendedTypeChecked` + `stylisticTypeChecked` presets (the two sets the
 * old `packageTypeCheckedConfig` pulled in), mapped to oxlint's rule names
 * (`typescript/*`, plus a handful of bare eslint-core rules). Keeping the list
 * explicit — rather than relying on oxlint's `correctness` category alone —
 * pins the exact rules regardless of how oxlint categorises them, and covers
 * the stylistic set, which lives outside `correctness`.
 *
 * Many of these are type-aware (await-thenable, no-floating-promises,
 * no-unsafe-*, restrict-*, prefer-nullish-coalescing, …). They only run when
 * `options.typeAware` is set, which oxlint reads solely from the *root config
 * file* it loads for a package (not from nested `extends`/`overrides` configs).
 * Because each package *spreads* this base into its own `oxlint.config.ts`, the
 * spread is resolved by JS before oxlint sees the config, so `options.typeAware`
 * set here lands in that root object and takes effect — same mechanism as
 * `plugins`/`categories`/`jsPlugins`. Hence it lives here rather than being
 * repeated in every package. A package can still override with
 * `options: { typeAware: false }` (spreading `...packageConfig.options` if it
 * needs to set other options alongside).
 *
 * It also keeps the project's custom rules:
 *  - `@protontech/eslint-plugin-enforce-uint8array-arraybuffer` (a workspace
 *    package) is loaded as a JS plugin — oxlint's plugin API is compatible with
 *    ESLint v9+ — enforcing `Uint8Array<ArrayBuffer>`. The package ships its
 *    TypeScript source directly (no build step); oxlint loads the `.ts` entry
 *    natively. It only inspects TS type references, so it is inert on plain JS
 *    files and needs no file-type scoping.
 */
export const packageConfig = defineConfig({
    // `plugins` overwrites the default set, so list everything we want enabled.
    // Mirrors the previous ESLint setup: eslint (always on) + typescript + import.
    // React lives in the separate `packageReactConfig` (./package-config-react),
    // since not every package uses React.
    plugins: ["unicorn", "oxc", "typescript", "import"],
    categories: {
        correctness: "error",
    },
    // Enable type-aware linting (typescript-eslint's *TypeChecked equivalent).
    // Read only from the root config file; effective here because packages
    // spread this base into their own root `oxlint.config.ts` (see above).
    options: {
        typeAware: true,
    },
    // Custom, project-authored rule, published as the workspace package
    // `@protontech/eslint-plugin-enforce-uint8array-arraybuffer`. The bare
    // package specifier resolves via its `exports` map to the `.ts` entry,
    // which oxlint loads directly.
    jsPlugins: [
        {
            name: "enforce-uint8array-arraybuffer",
            specifier:
                "@protontech/eslint-plugin-enforce-uint8array-arraybuffer",
        },
    ],
    ignorePatterns: ["**/dist/**"],
    rules: {
        "import/no-cycle": "error",

        // --- typescript-eslint `recommendedTypeChecked` ---
        "typescript/await-thenable": "error",
        "typescript/ban-ts-comment": "error",
        "no-array-constructor": "error",
        "typescript/no-array-delete": "error",
        "typescript/no-base-to-string": "error",
        "typescript/no-duplicate-enum-values": "error",
        "typescript/no-duplicate-type-constituents": "error",
        "typescript/no-empty-object-type": "error",
        "typescript/no-explicit-any": "error",
        "typescript/no-extra-non-null-assertion": "error",
        "typescript/no-floating-promises": "error",
        "typescript/no-for-in-array": "error",
        "typescript/no-implied-eval": "error",
        "typescript/no-misused-new": "error",
        "typescript/no-misused-promises": "error",
        "typescript/no-namespace": "error",
        "typescript/no-non-null-asserted-optional-chain": "error",
        "typescript/no-non-null-assertion": "error",
        "typescript/no-redundant-type-constituents": "error",
        "typescript/no-require-imports": "error",
        "typescript/no-this-alias": "error",
        "typescript/no-unnecessary-type-assertion": "error",
        "typescript/no-unnecessary-type-constraint": "error",
        "typescript/no-unsafe-argument": "error",
        "typescript/no-unsafe-assignment": "error",
        "typescript/no-unsafe-call": "error",
        "typescript/no-unsafe-declaration-merging": "error",
        "typescript/no-unsafe-enum-comparison": "error",
        "typescript/no-unsafe-function-type": "error",
        "typescript/no-unsafe-member-access": "error",
        "typescript/no-unsafe-return": "error",
        "typescript/no-unsafe-unary-minus": "error",
        "no-unused-expressions": "error",
        "no-unused-vars": "error",
        "typescript/no-wrapper-object-types": "error",
        "typescript/only-throw-error": "error",
        "typescript/prefer-as-const": "error",
        "typescript/prefer-namespace-keyword": "error",
        "typescript/prefer-promise-reject-errors": "error",
        "typescript/require-await": "error",
        "typescript/restrict-plus-operands": "error",
        "typescript/restrict-template-expressions": "error",
        "typescript/triple-slash-reference": "error",
        "typescript/unbound-method": "error",
        "no-var": "error",
        "prefer-const": "error",
        "prefer-rest-params": "error",
        "prefer-spread": "error",

        // --- typescript-eslint `stylisticTypeChecked` ---
        "typescript/adjacent-overload-signatures": "error",
        "typescript/array-type": "error",
        "typescript/ban-tslint-comment": "error",
        "typescript/class-literal-property-style": "error",
        "typescript/consistent-generic-constructors": "error",
        "typescript/consistent-indexed-object-style": "error",
        "typescript/consistent-type-assertions": "error",
        "typescript/consistent-type-definitions": "error",
        "typescript/dot-notation": "error",
        "no-empty-function": "off",
        "typescript/no-confusing-non-null-assertion": "error",
        "typescript/no-inferrable-types": "error",
        "typescript/non-nullable-type-assertion-style": "error",
        "typescript/prefer-find": "error",
        "typescript/prefer-for-of": "error",
        "typescript/prefer-function-type": "error",
        "typescript/prefer-includes": "error",
        "typescript/prefer-nullish-coalescing": "error",
        "typescript/prefer-optional-chain": "error",
        "typescript/prefer-regexp-exec": "error",
        "typescript/prefer-string-starts-ends-with": "error",
        "typescript/consistent-type-imports": "error",

        "enforce-uint8array-arraybuffer/enforce-uint8array-arraybuffer":
            "error",
    },
});
