import {
    getWorkerPoolInstance,
    type WorkerPoolInterface,
} from "../getWorkerPool.ts";

export const CryptoWorkerPool: WorkerPoolInterface = getWorkerPoolInstance(
    () =>
        new Worker(new URL("../worker.ts", import.meta.url), {
            type: "module",
        }),
);
