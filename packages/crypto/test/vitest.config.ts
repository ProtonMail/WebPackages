import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const testFilesToInclude = {
    pmcrypto: ["test/pmcrypto/**/*.spec.ts"],
    allExceptPmcrypto: ["test/!(pmcrypto)/**/*.spec.ts"],
};

export default defineConfig({
    optimizeDeps: {
        // Without this, these worker dependencies are discovered "too late" and trigger a test reload,
        // which causes issues with the worker dynamic imports since the corresponding chunk names
        // become stale
        include: ["core-js/proposals/array-buffer-base64", "core-js/stable"],
    },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: "pmcrypto",
                    include: testFilesToInclude.pmcrypto,
                    setupFiles: ["test/pmcrypto/setup.ts"],
                    testTimeout: 30000,
                    typecheck: {
                        // run tsc directly instead for now, since this breaks on e.g. `it.next()` in `streamFromChunks`
                        enabled: false,
                        include: testFilesToInclude.pmcrypto, // typechecking is run over these files only
                    },
                },
            },
            {
                extends: true,
                test: {
                    name: "all-except-pmcrypto",
                    include: testFilesToInclude.allExceptPmcrypto,
                    testTimeout: 30000,
                    typecheck: {
                        enabled: true,
                        include: testFilesToInclude.allExceptPmcrypto, // typechecking is run over these files only
                    },
                },
            },
        ],
        browser: {
            provider: playwright(),
            enabled: true,
            headless: true,
            screenshotFailures: false,
            instances: process.env.CI
                ? [
                      {
                          // Custom browser instances must have unique names when used across different Vitest projects;
                          // randomizing the name here achieves that
                          name: `chromium-no-sandbox@${crypto.randomUUID()}`,
                          browser: "chromium",
                          provider: playwright({
                              launchOptions: {
                                  chromiumSandbox: false,
                              },
                          }),
                      },
                  ]
                : [
                      { browser: "chromium" },
                      { browser: "firefox" },
                      { browser: "webkit" },
                  ],
        },
    },
});
