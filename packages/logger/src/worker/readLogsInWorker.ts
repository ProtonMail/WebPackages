import * as Comlink from "comlink";

import type LogReader from "./LogReader";
import type { LogReaderOptions } from "./LogReader";

/**
 * Reads and decrypts stored log lines off the main thread, so a large history cannot stall
 * the UI. Kept apart from `PersistentLogger` so tests can inject an in-process reader instead of a
 * real worker.
 */
export const readLogsInWorker = async (
    options: LogReaderOptions,
): Promise<string> => {
    const worker = new Worker(new URL("./logger.worker.ts", import.meta.url), {
        type: "module",
        name: "logger-read-worker",
    });

    try {
        const reader = Comlink.wrap<LogReader>(worker);
        await reader.init(options);
        // Awaited rather than returned directly, so `finally` cannot terminate mid-read.
        return await reader.getLogs();
    } finally {
        worker.terminate();
    }
};
