import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Firefox CI settings
if (process.env.CI) {
    process.env.DISPLAY = ":99";
    process.env.MOZ_HEADLESS = "1";
    process.env.MOZ_DISABLE_CONTENT_SANDBOX = "1";
}

const testFilesToInclude = {
    pmcrypto: ["test/pmcrypto/**/*.spec.ts"],
    allExceptPmcrypto: ["test/!(pmcrypto)/**/*.spec.ts"],
};

export default defineConfig({
    optimizeDeps: {
        // Without this, these worker dependencies are discovered "too late" and trigger a test reload,
        // which causes issues with the worker dynamic imports since the corresponding chunk names
        // become stale
        include: ["core-js/proposals/array-buffer-base64", "core-js/stable", "bcryptjs"],
    },
    test: {
        // Disable running test files in parallel: with chromium + firefox instances sharing the CI
        // runner, concurrent CPU-heavy tests (worker pool, streaming, argon2) starve each other and
        // blow past the 30s timeout. Running files serially avoids the CPU contention.
        fileParallelism: false,
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
                    {
                        name: `firefox-ci-@${crypto.randomUUID()}`,
                        browser: "firefox",
                        provider: playwright({
                            launchOptions: {
                                firefoxUserPrefs: {
                                    "layers.acceleration.disabled": true,
                                    "gfx.direct2d.disabled": true,
                                    "webgl.disabled": true,
                                    "layers.acceleration.force-enabled": false,
                                    "media.hardware-video-decoding.enabled": false,
                                    "media.ffmpeg.vaapi.enabled": false,
                                    "gfx.x11-egl.force-enabled": false,
                                    "layers.gpu-process.enabled": false,
                                }
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
