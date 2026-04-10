import { expose, transferHandlers } from "comlink";
import "../../../polyfill.ts";

import { Api as WorkerApi } from "../api.ts";
import { workerTransferHandlers } from "./transferHandlers/index.ts";

workerTransferHandlers.forEach(({ name, handler }) =>
    transferHandlers.set(name, handler),
);

// WorkerApi.init() will be called in the main thread, to support passing inputs
expose(WorkerApi);
