import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "happy-dom",
        include: ["lib/**/*.unit.{test,spec}.{ts,tsx}"],
        name: "unit",
        testTimeout: 5000,
    },
});
