import type { ProtonConfig } from "./interface.ts";

const headerNameMap = new Map<keyof ProtonConfig, string>([
    ["uid", "x-pm-uid"],
    ["appVersion", "x-pm-appversion"],
    ["locale", "x-pm-locale"],
]);

export const addProtonHeadersToRequest = (
    request: Request,
    config: ProtonConfig,
) => {
    Object.entries(config).forEach(([key, value]) => {
        const headerName =
            value !== undefined
                ? headerNameMap.get(key as keyof ProtonConfig)
                : undefined;
        if (!headerName || typeof value !== "string") {
            return;
        }
        if (!request.headers.has(headerName)) {
            request.headers.set(headerName, value);
        }
    });
};
