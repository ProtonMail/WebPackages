import {
    getWorkerPoolInstance,
    type WorkerPoolInterface,
} from "../getWorkerPool.ts";

export const CryptoWorkerPool: WorkerPoolInterface = getWorkerPoolInstance(
    () =>
        // Webpack static analyser is not especially powerful at detecting web workers that require bundling,
        // see: https://github.com/webpack/webpack.js.org/issues/4898#issuecomment-823073304.
        // Harcoding the path here is the easiet way to get the worker to be bundled properly.
        new Worker(
            new URL(
                /* webpackChunkName: "crypto-worker" */
                "../worker.ts",
                import.meta.url,
            ),
            { type: "module" },
        ),
);
