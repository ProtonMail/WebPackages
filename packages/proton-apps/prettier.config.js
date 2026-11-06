import config from "@protontech/prettier-config/prettier.config";

/** @type {import("prettier").Config} */
export default {
    ...config,
    // Prettier has no SVG parser, format the icons as HTML
    overrides: [{ files: "*.svg", options: { parser: "html" } }],
};
