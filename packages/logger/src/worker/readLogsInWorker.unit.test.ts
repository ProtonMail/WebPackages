import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import * as Comlink from "comlink";

import type { LogReaderOptions } from "./LogReader";
import { readLogsInWorker } from "./readLogsInWorker";

vi.mock("comlink");

/** Comlink is mocked, so termination is the only part of `Worker` these tests exercise. */
class FakeWorker {
    terminate = vi.fn();
}

const mockWrap = (reader: { init: Mock; getLogs: Mock }) => {
    vi.mocked(Comlink.wrap).mockReturnValue(
        reader as unknown as ReturnType<typeof Comlink.wrap>,
    );
};

describe("readLogsInWorker", () => {
    const options: LogReaderOptions = {
        name: "test",
        loggerID: "id",
        encryptionKey: {} as LogReaderOptions["encryptionKey"],
        encryptionContext: "ctx",
    };

    let worker: FakeWorker;

    beforeEach(() => {
        worker = new FakeWorker();
        global.Worker = vi.fn(function () {
            return worker;
        }) as unknown as typeof Worker;
    });

    it("initializes before reading, returns the result, and terminates the worker", async () => {
        const init = vi.fn().mockResolvedValue(undefined);
        const getLogs = vi.fn().mockResolvedValue("the logs");
        mockWrap({ init, getLogs });

        const result = await readLogsInWorker(options);

        expect(result).toBe("the logs");
        expect(init).toHaveBeenCalledWith(options);
        // A missing call falls back to a value that makes the ordering assertion fail.
        const initOrder = init.mock.invocationCallOrder[0] ?? Infinity;
        const getLogsOrder = getLogs.mock.invocationCallOrder[0] ?? -Infinity;
        expect(initOrder).toBeLessThan(getLogsOrder);
        expect(worker.terminate).toHaveBeenCalledTimes(1);
    });

    it("terminates the worker even when init rejects", async () => {
        const init = vi.fn().mockRejectedValue(new Error("init failed"));
        mockWrap({ init, getLogs: vi.fn() });

        await expect(readLogsInWorker(options)).rejects.toThrow("init failed");
        expect(worker.terminate).toHaveBeenCalledTimes(1);
    });
});
