export const jsExtensions = [".js", ".jsx", ".mjs", ".cjs"];
export const tsExtensions = [".ts", ".cts", ".mts", ".tsx"];
export const allExtensions = [...tsExtensions, ...jsExtensions];

export const tsGlobs = tsExtensions.map((ext) => `**/*${ext}`);
export const jsGlobs = jsExtensions.map((ext) => `**/*${ext}`);
export const allGlobs = allExtensions.map((ext) => `**/*${ext}`);
