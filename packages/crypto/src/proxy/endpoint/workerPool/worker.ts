import { expose, transferHandlers } from "comlink";
// apply polyfills
import "core-js/stable";
import "core-js/proposals/array-buffer-base64";

import { Api as WorkerApi } from "../api.ts";
import { workerTransferHandlers } from "./transferHandlers/index.ts";

workerTransferHandlers.forEach(({ name, handler }) =>
    transferHandlers.set(name, handler),
);

// WorkerApi.init() will be called in the main thread, to support passing inputs
expose(WorkerApi);
