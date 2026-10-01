import type { AesGcmCryptoKey } from "@protontech/crypto/subtle/aesGcm.ts";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/**
 * A persisted log line.
 *
 * `data` is the base64 AES-GCM ciphertext of `JSON.stringify({ message, args })`.
 * Message and arguments share a single ciphertext so that writing a line costs one
 * crypto operation regardless of how many arguments it carries.
 */
export interface LogEntry {
    id: string;
    timestamp: number;
    level: LogLevel;
    data: string;
}

export interface LoggerOptions {
    /** Session-bound AES-GCM key, see `generateLoggerKey`. */
    encryptionKey: AesGcmCryptoKey;
    /** Combined with the logger name to form the AES-GCM context. */
    appName: string;
    /** Defaults to the name the logger was created with. Only affects the encryption context. */
    loggerName?: string;
    /** Session-scoped identifier, forms part of the IndexedDB database name. */
    loggerID: string;
    /** Entries kept before the oldest are dropped. Default: 10 000. */
    maxEntries?: number;
    /** Days an entry is kept before cleanup removes it. Default: 7. */
    retentionDays?: number;
    /** Levels echoed to the console outside development. Default: `['error']`. */
    consoleLevels?: LogLevel[];
}

/**
 * Encrypted, persistent application logger.
 *
 * Lines are echoed to the console (errors only outside development) and written to
 * IndexedDB encrypted with a session-bound AES-GCM key. Persistence is best-effort:
 * where IndexedDB is unavailable, writes are dropped silently and console output is
 * unaffected.
 *
 * Lines emitted before `initialize()` are buffered and written once it resolves,
 * keeping their original timestamps.
 */
export interface Logger {
    initialize(options: LoggerOptions): Promise<void>;
    isInitialized(): boolean;

    trace(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    /** Equivalent to `info`. */
    log(message: string, ...args: unknown[]): void;

    /** Resolves once every line emitted so far has been written. */
    flush(): Promise<void>;
    /** Reads every stored line back, decrypted, oldest first. */
    getLogs(): Promise<string>;
    clearLogs(): Promise<void>;
    downloadLogs(filename?: string): Promise<void>;
    /** Stops cleanup and closes storage. */
    destroy(): Promise<void>;
}

/**
 * Persistence backend for log entries.
 *
 * Every method rejects when the backend is unavailable. Callers are expected to treat
 * that as "no persistence" rather than an error worth surfacing.
 */
export interface Storage {
    store(entry: LogEntry): Promise<void>;
    /** Entries in ascending timestamp order. */
    retrieve(): Promise<LogEntry[]>;
    count(): Promise<number>;
    clear(): Promise<void>;
    /** Removes the `count` oldest entries. */
    removeOldest(count: number): Promise<void>;
    /** Removes entries older than `timestamp`, returning how many were removed. */
    removeOlderThan(timestamp: number): Promise<number>;
    close(): Promise<void>;
    /** Closes the connection and removes the stored data entirely. */
    deleteDatabase(): Promise<void>;
}
