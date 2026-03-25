/**
 * @type {import('lint-staged').Configuration}
 */
export default {
  "(*.ts|*.tsx|*.js)": "prettier --write",
  "*.css": "prettier --write",
  "package.json": ["sort-package-json", "prettier --write"],
  "(*.json|*.md|*.mdx|*.html|*.mjs|*.yml|*.svg)": "prettier --write",
};
