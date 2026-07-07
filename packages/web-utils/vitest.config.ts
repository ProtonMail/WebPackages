import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "happy-dom",
        include: ["src/**/*.unit.{test,spec}.{ts,tsx}"],
        name: "unit",
        testTimeout: 5000,
    },
});
