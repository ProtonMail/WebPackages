import type { LogLevel, LogWriter } from "./types";

type Emit = (level: LogLevel, message: string, args: unknown[]) => void;

export const createContextLogWriter = (
    emit: Emit,
    prefix: string,
): LogWriter => {
    const emitWithPrefix =
        (level: LogLevel) =>
        (message: string, ...args: unknown[]): void => {
            emit(level, `${prefix} ${message}`, args);
        };

    return {
        trace: emitWithPrefix("trace"),
        debug: emitWithPrefix("debug"),
        info: emitWithPrefix("info"),
        warn: emitWithPrefix("warn"),
        error: emitWithPrefix("error"),
        log: emitWithPrefix("info"),
        withContext: (context) =>
            createContextLogWriter(emit, `${prefix} [${context}]`),
    };
};
