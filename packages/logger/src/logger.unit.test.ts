import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
    type AesGcmCryptoKey,
    generateAndImportKey,
} from "@protontech/crypto/subtle/aesGcm.ts";
import "fake-indexeddb/auto";

import { LOGGER_DB_PREFIX } from "./constants";
import { PersistentLogger } from "./logger";
import { IndexedDBStorage } from "./storage";
import type { LoggerOptions } from "./types";
import type { LogReaderOptions } from "./worker/LogReader";
import LogReader from "./worker/LogReader";

const DAY_MS = 24 * 60 * 60 * 1000;

const uniqueId = () => crypto.randomUUID();

/** Stands in for the real worker: runs the same `LogReader` in-process. */
const inProcessReader = (options: LogReaderOptions): Promise<string> => {
    const reader = new LogReader();
    reader.init(options);
    return reader.getLogs();
};

/**
 * Opens a second connection to a logger's database for assertions, always closing it.
 * A lingering connection would block `deleteDatabase()` during teardown.
 */
const inspect = async <T>(
    name: string,
    id: string,
    fn: (storage: IndexedDBStorage) => Promise<T>,
): Promise<T> => {
    const storage = new IndexedDBStorage(name, id);
    try {
        return await fn(storage);
    } finally {
        await storage.close();
    }
};

/** Stubs the DOM and URL APIs `downloadLogs` uses, and exposes what the tests assert on. */
const mockDownloadDom = () => {
    const click = vi.fn();
    const anchor = {
        href: "",
        download: "",
        style: {},
        click,
    } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    vi.spyOn(document.body, "appendChild").mockReturnValue(anchor);
    vi.spyOn(document.body, "removeChild").mockReturnValue(anchor);
    const createObjectURL = vi
        .spyOn(URL, "createObjectURL")
        .mockReturnValue("blob:test");
    const revokeObjectURL = vi
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => {});

    return { anchor, click, createObjectURL, revokeObjectURL };
};

describe("Logger", () => {
    let key: AesGcmCryptoKey;

    /** Loggers and databases to tear down, so tests never share state. */
    const loggers: PersistentLogger[] = [];
    const databases: { name: string; id: string }[] = [];

    beforeAll(async () => {
        key = await generateAndImportKey();
    });

    const options = (
        overrides: Partial<LoggerOptions> & { loggerID: string },
    ): LoggerOptions => ({
        encryptionKey: key,
        appName: "test-app",
        ...overrides,
    });

    /** Creates an initialized logger and registers it for cleanup. */
    const createLogger = ({
        name = "test",
        id = uniqueId(),
        now,
        ...rest
    }: Partial<LoggerOptions> & {
        name?: string;
        id?: string;
        now?: () => number;
    } = {}) => {
        const logger = new PersistentLogger(now, inProcessReader);
        loggers.push(logger);
        databases.push({ name, id });
        logger.initialize(options({ ...rest, loggerName: name, loggerID: id }));
        return logger;
    };

    afterEach(async () => {
        vi.restoreAllMocks();
        await Promise.all(
            loggers.splice(0).map((logger) => logger.destroy().catch(() => {})),
        );
        await Promise.all(
            databases
                .splice(0)
                .map(({ name, id }) =>
                    new IndexedDBStorage(name, id)
                        .deleteDatabase()
                        .catch(() => {}),
                ),
        );
    });

    describe("persistence", () => {
        it("round-trips a line through IndexedDB", async () => {
            const logger = createLogger();

            logger.info("hello world");

            const logs = await logger.getLogs();
            expect(logs).toContain("hello world");
            expect(logs).toContain("INFO");
            expect(logs).toContain("[test]");
        });

        it("writes lines in the order they were emitted", async () => {
            const logger = createLogger();

            logger.info("first");
            logger.info("second");
            logger.info("third");

            const lines = (await logger.getLogs()).split("\n");
            expect(lines.map((line) => line.split(": ")[1])).toEqual([
                "first",
                "second",
                "third",
            ]);
        });

        it("prefixes each line with an ISO timestamp and the level", async () => {
            const at = Date.UTC(2026, 0, 2, 3, 4, 5);
            const logger = createLogger({ now: () => at });

            logger.warn("careful");

            expect(await logger.getLogs()).toMatch(
                /^2026-01-02T03:04:05\.000Z WARN \[test\]: careful$/,
            );
        });

        it("buffers lines emitted before initialize and keeps their timestamps", async () => {
            const at = Date.UTC(2026, 0, 1);
            const id = uniqueId();
            const logger = new PersistentLogger(() => at, inProcessReader);
            loggers.push(logger);
            databases.push({ name: "test", id });

            logger.info("before init");
            expect(await logger.getLogs()).toBe("");

            logger.initialize(options({ loggerName: "test", loggerID: id }));

            const logs = await logger.getLogs();
            expect(logs).toContain("before init");
            expect(logs).toContain("2026-01-01T00:00:00.000Z");
        });

        it("persists arguments alongside the message", async () => {
            const logger = createLogger();

            logger.info("with args", "plain", { nested: { value: 1 } }, 42);

            const logs = await logger.getLogs();
            expect(logs).toContain("plain");
            expect(logs).toContain('{"nested":{"value":1}}');
            expect(logs).toContain("42");
        });

        it("serializes Error arguments with their stack", async () => {
            const logger = createLogger();

            logger.info("boom", new Error("kaboom"));

            const logs = await logger.getLogs();
            expect(logs).toContain("Error: kaboom");
        });

        it("does not lose a line containing a circular argument", async () => {
            const logger = createLogger();
            const circular: Record<string, unknown> = { name: "loop" };
            circular.self = circular;

            logger.info("circular", circular);

            expect(await logger.getLogs()).toContain("circular");
        });

        it("encrypts entries at rest", async () => {
            const id = uniqueId();
            const logger = createLogger({ id });

            logger.info("super secret value");
            await logger.flush();

            const stored = await inspect("test", id, (storage) =>
                storage.retrieve(),
            );
            expect(stored).toHaveLength(1);
            expect(stored[0]?.data).not.toContain("super secret");
        });
    });

    describe("console output", () => {
        it("only echoes errors by default", () => {
            const error = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});
            const info = vi.spyOn(console, "info").mockImplementation(() => {});
            const logger = createLogger();

            logger.info("quiet");
            logger.error("loud");

            expect(info).not.toHaveBeenCalled();
            expect(error).toHaveBeenCalledWith("[test]", "loud");
        });

        it("respects consoleLevels", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            const logger = createLogger({ consoleLevels: ["warn"] });

            logger.warn("shown");

            expect(warn).toHaveBeenCalledWith("[test]", "shown");
        });

        it("echoes lines emitted before initialize", () => {
            const error = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});
            const logger = new PersistentLogger();
            loggers.push(logger);

            logger.error("pre-init failure");

            expect(error).toHaveBeenCalledWith("[default]", "pre-init failure");
        });
    });

    describe("reading", () => {
        it("returns an empty string before initialize", async () => {
            const logger = new PersistentLogger();
            loggers.push(logger);

            expect(await logger.getLogs()).toBe("");
        });

        it("de-duplicates concurrent reads", async () => {
            const id = uniqueId();
            const logger = createLogger({ id });
            logger.info("once");
            await logger.flush();

            const retrieve = vi.spyOn(IndexedDBStorage.prototype, "retrieve");
            const [a, b] = await Promise.all([
                logger.getLogs(),
                logger.getLogs(),
            ]);

            expect(a).toBe(b);
            expect(retrieve).toHaveBeenCalledTimes(1);
        });

        it("sees every line emitted before the read", async () => {
            const logger = createLogger();

            logger.info("a");
            logger.info("b");

            // No flush: getLogs awaits the write chain itself.
            expect((await logger.getLogs()).split("\n")).toHaveLength(2);
        });

        it("clears entries that cannot be decrypted", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            const id = uniqueId();
            const first = createLogger({ id });
            first.info("written with the old key");
            await first.flush();
            await first.destroy();

            // A new session key cannot read the previous session's entries.
            const second = new PersistentLogger(undefined, inProcessReader);
            loggers.push(second);
            second.initialize(
                options({
                    loggerName: "test",
                    loggerID: id,
                    encryptionKey: await generateAndImportKey(),
                }),
            );

            expect(await second.getLogs()).toBe("");
            expect(warn).toHaveBeenCalled();
            expect(
                await inspect("test", id, (storage) => storage.count()),
            ).toBe(0);
        });
    });

    describe("retention", () => {
        it("drops entries older than retentionDays on cleanup", async () => {
            const start = Date.UTC(2026, 0, 10);
            const id = uniqueId();

            const first = createLogger({ id, now: () => start });
            first.info("old line");
            await first.flush();
            await first.destroy();

            // Same database, eight days later: the entry is past the 7-day default.
            const second = new PersistentLogger(
                () => start + 8 * DAY_MS,
                inProcessReader,
            );
            loggers.push(second);
            second.initialize(options({ loggerName: "test", loggerID: id }));

            expect(await second.getLogs()).toBe("");
        });

        it("keeps entries inside the retention window", async () => {
            const start = Date.UTC(2026, 0, 10);
            const id = uniqueId();

            const first = createLogger({ id, now: () => start });
            first.info("recent line");
            await first.flush();
            await first.destroy();

            const second = new PersistentLogger(
                () => start + 2 * DAY_MS,
                inProcessReader,
            );
            loggers.push(second);
            second.initialize(options({ loggerName: "test", loggerID: id }));

            expect(await second.getLogs()).toContain("recent line");
        });

        it("trims to maxEntries on cleanup, keeping the newest", async () => {
            const start = Date.UTC(2026, 0, 10);
            const id = uniqueId();
            let clock = start;

            const first = createLogger({ id, now: () => clock });
            ["one", "two", "three", "four"].forEach((message) => {
                clock += 1000;
                first.info(message);
            });
            await first.flush();
            await first.destroy();

            const second = new PersistentLogger(() => clock, inProcessReader);
            loggers.push(second);
            second.initialize(
                options({ loggerName: "test", loggerID: id, maxEntries: 2 }),
            );

            const logs = await second.getLogs();
            expect(logs).not.toContain("one");
            expect(logs).not.toContain("two");
            expect(logs).toContain("three");
            expect(logs).toContain("four");
        });
    });

    describe("lifecycle", () => {
        it("reports initialization state", () => {
            const logger = new PersistentLogger();
            loggers.push(logger);
            expect(logger.isInitialized()).toBe(false);

            const id = uniqueId();
            databases.push({ name: "lifecycle", id });
            logger.initialize(
                options({ loggerName: "lifecycle", loggerID: id }),
            );

            expect(logger.isInitialized()).toBe(true);
        });

        it("names itself after the app when no logger name is given", async () => {
            const id = uniqueId();
            const logger = new PersistentLogger(undefined, inProcessReader);
            loggers.push(logger);
            databases.push({ name: "test-app", id });

            logger.initialize(options({ loggerID: id }));
            logger.info("named by app");

            expect(await logger.getLogs()).toContain("[test-app]");
            // One logger per app, so the app name is enough to find its database.
            expect(
                (await indexedDB.databases()).map(({ name }) => name),
            ).toContain(`${LOGGER_DB_PREFIX}test-app-${id}`);
        });

        it("ignores a second initialize", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            const logger = createLogger();

            logger.initialize(options({ loggerID: uniqueId() }));

            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining("already initialized"),
            );
        });

        it("clears logs on request", async () => {
            const logger = createLogger();
            logger.info("temporary");
            expect(await logger.getLogs()).toContain("temporary");

            await logger.clearLogs();

            expect(await logger.getLogs()).toBe("");
        });

        it("stops logging after destroy", async () => {
            const logger = createLogger();
            logger.info("before");

            await logger.destroy();

            expect(logger.isInitialized()).toBe(false);
            expect(await logger.getLogs()).toBe("");
            // Still callable, just inert.
            expect(() => logger.info("after")).not.toThrow();
        });

        it("downloads logs as a file", async () => {
            const { anchor, click, createObjectURL, revokeObjectURL } =
                mockDownloadDom();

            const logger = createLogger();
            logger.info("downloadable");
            await logger.downloadLogs();

            expect(createObjectURL).toHaveBeenCalled();
            expect(anchor.download).toMatch(/^test-logs-.*\.log$/);
            expect(click).toHaveBeenCalled();
            expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
        });

        it("uses an explicit download filename when given", async () => {
            const { anchor } = mockDownloadDom();

            const logger = createLogger();
            await logger.downloadLogs("custom.log");

            expect(anchor.download).toBe("custom.log");
        });
    });

    it("does not attach any global error handling", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const logger = createLogger();

        window.dispatchEvent(
            new ErrorEvent("error", { message: "window blew up" }),
        );

        expect(await logger.getLogs()).toBe("");
        // The browser reports the dispatched event to the console itself, so only the
        // logger's own prefixed output would indicate it had listened in.
        expect(
            error.mock.calls.filter(([first]) => first === "[test]"),
        ).toHaveLength(0);
    });
});
