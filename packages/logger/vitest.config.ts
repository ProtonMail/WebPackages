import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "happy-dom",
        include: ["src/**/*.{unit,perf}.{test,spec}.{ts,tsx}"],
        name: "unit",
        setupFiles: ["./vitest.setup.ts"],
        testTimeout: 5000,
    },
});
