import { packageTypeCheckedConfig } from "@protontech/eslint-config/package-typechecked-config.js";
import { defineConfig, globalIgnores } from "eslint/config";
import pluginStylistic from "@stylistic/eslint-plugin";
import tseslint from "typescript-eslint";

export default defineConfig([
    globalIgnores(["dist"]),
    packageTypeCheckedConfig,
    {
        extends: [tseslint.configs.strictTypeChecked],
        languageOptions: {
            parserOptions: {
                // See https://typescript-eslint.io/troubleshooting/typed-linting#project-service-issues
                // We want to lint .js files despite `allowJS: false` in tsconfig.json .
                // Since `projectService.allowDefaultProject` does not accept '**' glob patterns, for now
                // we need to keep an eslint-specific tsconfig.
                projectService: false,
                project: "tsconfig.eslint.json"
            },
        },
        plugins: {
            "@stylistic": pluginStylistic
        },
        rules: {
            "no-unused-expressions": "off",
            "@typescript-eslint/no-unused-expressions": "off", // for the `expect` statements in the tests
            "no-restricted-imports": ["error", {
                name: "openpgp",
                message: "Please import from 'pmcrypto/openpgp' instead."
            }],
            "import/extensions": ["error", "always", { ignorePackages: true, checkTypeImports: true }],
            "import/no-unresolved": "error",
            "no-multiple-empty-lines": ["error"],
            "no-trailing-spaces": ["error"],
            "eol-last": ["error"],
            "camelcase": ["error", { allow: ["openpgp_*"] }],
            "padded-blocks": "off",

            "@typescript-eslint/naming-convention": ["error", {
                selector: "typeLike",
                format: ["PascalCase", "UPPER_CASE"]
            }],
            "@typescript-eslint/require-await": "off",
            "@typescript-eslint/no-deprecated": "off",
            "@typescript-eslint/ban-ts-comment": "off",
            "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "with-single-extends" }],
            "@typescript-eslint/no-unused-vars": "error",
            "@typescript-eslint/no-unsafe-call": "off", // function call to fn with `any` type
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-confusing-void-expression": "off",
            "@typescript-eslint/restrict-template-expressions": "off",
            "@typescript-eslint/no-unnecessary-condition": "off", // due to https://typescript-eslint.io/rules/no-unnecessary-condition/#possibly-undefined-indexed-access
            "@typescript-eslint/no-unsafe-return": "off", // issues with generics: https://github.com/typescript-eslint/typescript-eslint/issues/2432
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/prefer-nullish-coalescing": ["error", { ignorePrimitives: { string: true } }],
            "@typescript-eslint/prefer-for-of": "off",
            "@stylistic/indent": ["error", 4],
            "@stylistic/quotes": ["error", "double", { "avoidEscape": true }],
            "@stylistic/no-multiple-empty-lines": ["error", { max: 1 }],
            "@typescript-eslint/comma-dangle": "off"
        },
    },
]);
