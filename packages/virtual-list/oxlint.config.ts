import { packageReactConfig } from "@protontech/oxlint-config/package-config-react.ts";
import { defineConfig } from "oxlint";

export default defineConfig({
    ...packageReactConfig,
    rules: {
        ...packageReactConfig.rules,
        "no-restricted-imports": [
            "error",
            {
                patterns: [
                    {
                        group: ["@tanstack/*"],
                        message:
                            "Only src/useVirtualList.ts may import @tanstack",
                    },
                ],
            },
        ],
    },
    overrides: [
        {
            files: ["src/useVirtualList.ts"],
            rules: { "no-restricted-imports": "off" },
        },
    ],
});
