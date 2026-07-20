import { defineConfig } from "oxlint";
import { packageConfig } from "@protontech/oxlint-config/package-config.ts";

export default defineConfig({
    ...packageConfig,
    rules: {
        ...packageConfig.rules,
        "unicorn/no-new-array": "off",
        // Force imports through the pmcrypto wrapper instead of raw openpgp.
        "no-restricted-imports": [
            "error",
            {
                name: "openpgp",
                message: "Please import from 'pmcrypto/openpgp' instead.",
            },
        ],
        // The crypto package disables this package-wide for its `expect(...)`
        // assertions (test helpers here are not all named *.spec.ts).
        "no-unused-expressions": "off",
        // Relaxations the crypto package deliberately opted into (these fire
        // heavily against openpgp's loosely-typed surface). Carried over from
        // the package's former eslint.config.js.
        "typescript/restrict-template-expressions": "off",
        "typescript/no-redundant-type-constituents": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-non-null-assertion": "off",
        "typescript/require-await": "off",
        "typescript/ban-ts-comment": "off",
        "typescript/prefer-for-of": "off",
        // Rule-option refinements the package used under eslint.
        "typescript/no-empty-object-type": [
            "error",
            { allowInterfaces: "with-single-extends" },
        ],
        "typescript/prefer-nullish-coalescing": [
            "error",
            { ignorePrimitives: { string: true } },
        ],
    },
});
