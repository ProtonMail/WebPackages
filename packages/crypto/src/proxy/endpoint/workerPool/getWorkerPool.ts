import type { Remote } from "comlink";
import { releaseProxy, transferHandlers, wrap } from "comlink";

import type {
    Api as CryptoApi,
    ApiInterface as CryptoApiInterface,
} from "../api.ts";
import type { InitOptions } from "../api.models.ts";
import type { SentryLogger } from "../../sentry.ts";
import { mainThreadTransferHandlers } from "./transferHandlers/index.ts";

export interface WorkerInitOptions extends InitOptions {}

export interface WorkerPoolInitOptions {
    /**
     * Whether the waiting for the worker initialization should be done on first use of the WorkerPool,
     * instead of as part of `init`.
     * Setting this to true makes `init` faster, but any worker loading errors will be thrown later on
     * (see also `awaitOnFirstUseErrorCallback`).
     */
    awaitOnFirstUse?: boolean;
    /**
     * Callback triggered when the worker loading promise throws;
     * it's intended for reporting purposes when using enabling the `awaitOnFirstUse` option,
     * since the errors are not thrown by `init`.
     */
    awaitOnFirstUseErrorCallback?: (err: unknown) => void;
    poolSize?: number;
    openpgpConfigOptions?: WorkerInitOptions;
    sentryLogger: SentryLogger | null;
}

export interface WorkerPoolInterface extends CryptoApiInterface {
    /**
     * Setup worker pool (singleton instance):
     * create and start workers, and initializes internal Crypto API (incl. pmcrypto and OpenPGP.js)
     * @param options.poolSize - number of workers to start; defaults to `Navigator.hardwareConcurrency()` if available, otherwise to 1.
     */
    init(options: WorkerPoolInitOptions): Promise<void>;

    /**
     * Close all workers, after clearing their internal key store.
     * After the pool has been destroyed, it is possible to `init()` it again.
     */
    destroy(): Promise<void>;
}

/**
 * Get a worker pool instance bound to the provided `createWorker` callback.
 * The instance is meant to be used as a singleton.
 * NB: the workers are only created and started after calling `init()`.
 */
export const getWorkerPoolInstance = (createWorker: () => Worker) => {
    type OneOrMore<T> = [T, ...T[]];
    let workerPoolPromise: Promise<OneOrMore<Remote<CryptoApi>>> | null = null;
    let i = -1;
    let sentryLogger: SentryLogger | null = null;

    const initWorker = async (openpgpConfigOptions: WorkerInitOptions) => {
        const RemoteApi = wrap<typeof CryptoApi>(createWorker());

        await RemoteApi.init(openpgpConfigOptions);
        const worker = await new RemoteApi();
        return worker;
    };

    const destroyWorker = async (worker: Remote<CryptoApi>) => {
        await worker?.clearKeyStore();
        worker?.[releaseProxy](); // nosemgrep
    };

    /**
     * Get worker from the pool pool. By default, the workers are picked in a round-robin fashion, to balance the load.
     * However, this might not be desirable for operations like e.g. argon2, which is resource intensive and caches them
     * (wasm module & allocated memory) across calls.
     * @param [fixed] - whether to always return the same worker
     */
    const getWorker = async (fixed = false): Promise<Remote<CryptoApi>> => {
        if (workerPoolPromise === null) {
            throw new Error("Uninitialised worker pool");
        }
        const workerPool = await workerPoolPromise;
        if (fixed) {
            return workerPool[0];
        }
        i = (i + 1) % workerPool.length;
        return workerPool[i];
    };

    // The return type is technically `Remote<CryptoApi>` but that removes some type inference capabilities that are
    // useful to type-check the internal worker pool functions.
    const getAllWorkers = async (): Promise<OneOrMore<CryptoApi>> => {
        if (workerPoolPromise === null) {
            throw new Error("Uninitialised worker pool");
        }
        const workerPool = await workerPoolPromise;
        return workerPool as unknown as OneOrMore<CryptoApi>;
    };

    const errorReporter = (err: Error) => {
        if (
            err.name === "NetworkError" ||
            err.message?.toLowerCase() === "network error"
        ) {
            sentryLogger?.("Network error in crypto worker", {
                level: "info",
                extra: { message: err.message },
            });
        }

        throw err;
    };

    return {
        init: async ({
            awaitOnFirstUse = false,
            awaitOnFirstUseErrorCallback = () => {},
            poolSize = navigator.hardwareConcurrency || 1,
            openpgpConfigOptions = {},
            sentryLogger: logger,
        }) => {
            if (workerPoolPromise !== null) {
                throw new Error("worker pool already initialised");
            }
            sentryLogger = logger;

            workerPoolPromise = (async () => {
                // We load one worker early to ensure the browser serves the cached resources to the rest of the pool
                let workerPool: OneOrMore<Remote<CryptoApi>> = [
                    await initWorker(openpgpConfigOptions),
                ];
                if (poolSize > 1) {
                    workerPool = workerPool.concat(
                        await Promise.all(
                            new Array(poolSize - 1)
                                .fill(null)
                                .map(() => initWorker(openpgpConfigOptions)),
                        ),
                    ) as OneOrMore<Remote<CryptoApi>>;
                }
                mainThreadTransferHandlers.forEach(({ name, handler }) =>
                    transferHandlers.set(name, handler),
                );
                return workerPool;
            })().catch((err: unknown) => {
                awaitOnFirstUseErrorCallback(err);
                throw err;
            });

            if (!awaitOnFirstUse) {
                await workerPoolPromise;
            }
        },
        destroy: async () => {
            if (workerPoolPromise) {
                const workerPool = await workerPoolPromise;
                await Promise.all(workerPool.map(destroyWorker));
                workerPoolPromise = null;
            }
        },
        encryptMessage: async (opts) =>
            // @ts-expect-error marked as non-callable, unclear why, might be due to a limitation of type Remote
            (await getWorker()).encryptMessage(opts).catch(errorReporter),
        decryptMessage: async (opts) =>
            (await getWorker()).decryptMessage(opts).catch(errorReporter),
        signMessage: async (opts) =>
            // @ts-expect-error marked as non-callable, unclear why, might be due to a limitation of type Remote
            (await getWorker()).signMessage(opts).catch(errorReporter),
        // @ts-expect-error marked as non-callable, unclear why, might be due to a limitation of type Remote
        verifyMessage: async (opts) => (await getWorker()).verifyMessage(opts),
        verifyCleartextMessage: async (opts) =>
            (await getWorker())
                .verifyCleartextMessage(opts)
                .catch(errorReporter),
        processMIME: async (opts) =>
            (await getWorker()).processMIME(opts).catch(errorReporter),
        computeHash: async (opts) =>
            (await getWorker()).computeHash(opts).catch(errorReporter),
        computeHashStream: async (opts) =>
            (await getWorker()).computeHashStream(opts).catch(errorReporter),
        computeArgon2: async (opts) =>
            (await getWorker(true)).computeArgon2(opts).catch(errorReporter),

        generateSessionKey: async (opts) =>
            (await getWorker()).generateSessionKey(opts).catch(errorReporter),
        generateSessionKeyForAlgorithm: async (opts) =>
            (await getWorker())
                .generateSessionKeyForAlgorithm(opts)
                .catch(errorReporter),
        encryptSessionKey: async (opts) =>
            (await getWorker()).encryptSessionKey(opts).catch(errorReporter),
        decryptSessionKey: async (opts) =>
            (await getWorker()).decryptSessionKey(opts).catch(errorReporter),
        importPrivateKey: async (opts) => {
            const [first, ...rest] = await getAllWorkers();
            const result = await first
                .importPrivateKey(opts)
                .catch(errorReporter);
            await Promise.all(
                rest.map((worker) =>
                    worker.importPrivateKey(opts, result._idx),
                ),
            );
            return result;
        },
        importPublicKey: async (opts) => {
            const [first, ...rest] = await getAllWorkers();
            const result = await first
                .importPublicKey(opts)
                .catch(errorReporter);
            await Promise.all(
                rest.map((worker) => worker.importPublicKey(opts, result._idx)),
            );
            return result;
        },
        generateKey: async (opts) => {
            const [first, ...rest] = await getAllWorkers();
            const keyReference = await first
                .generateKey(opts)
                .catch(errorReporter);
            const key = await first.exportPrivateKey({
                privateKey: keyReference,
                passphrase: null,
                format: "binary",
            });
            await Promise.all(
                rest.map((worker) =>
                    worker.importPrivateKey(
                        { binaryKey: key, passphrase: null },
                        keyReference._idx,
                    ),
                ),
            );
            return keyReference;
        },
        reformatKey: async (opts) => {
            const [first, ...rest] = await getAllWorkers();
            const keyReference = await first
                .reformatKey(opts)
                .catch(errorReporter);
            const key = await first.exportPrivateKey({
                privateKey: keyReference,
                passphrase: null,
                format: "binary",
            });
            await Promise.all(
                rest.map((worker) =>
                    worker.importPrivateKey(
                        { binaryKey: key, passphrase: null },
                        keyReference._idx,
                    ),
                ),
            );
            return keyReference;
        },
        generateE2EEForwardingMaterial: async (opts) =>
            (await getWorker())
                .generateE2EEForwardingMaterial(opts)
                .catch(errorReporter),
        doesKeySupportE2EEForwarding: async (opts) =>
            (await getWorker())
                .doesKeySupportE2EEForwarding(opts)
                .catch(errorReporter),
        isE2EEForwardingKey: async (opts) =>
            (await getWorker()).isE2EEForwardingKey(opts).catch(errorReporter),

        replaceUserIDs: async (opts) => {
            await Promise.all(
                (await getAllWorkers()).map((worker) =>
                    worker.replaceUserIDs(opts),
                ),
            );
        },
        cloneKeyAndChangeUserIDs: async (opts) => {
            const [first, ...rest] = await getAllWorkers();
            const keyReference = await first
                .cloneKeyAndChangeUserIDs(opts)
                .catch(errorReporter);
            const key = await first.exportPrivateKey({
                privateKey: keyReference,
                passphrase: null,
                format: "binary",
            });
            await Promise.all(
                rest.map((worker) =>
                    worker.importPrivateKey(
                        { binaryKey: key, passphrase: null },
                        keyReference._idx,
                    ),
                ),
            );
            return keyReference;
        },
        exportPublicKey: async (opts) =>
            (await getWorker()).exportPublicKey(opts).catch(errorReporter),
        exportPrivateKey: async (opts) =>
            (await getWorker()).exportPrivateKey(opts).catch(errorReporter),
        clearKeyStore: async () => {
            await Promise.all(
                (await getAllWorkers()).map((worker) => worker.clearKeyStore()),
            );
        },
        clearKey: async (opts) => {
            await Promise.all(
                (await getAllWorkers()).map((worker) => worker.clearKey(opts)),
            );
        },

        isExpiredKey: async (opts) =>
            (await getWorker()).isExpiredKey(opts).catch(errorReporter),
        isRevokedKey: async (opts) =>
            (await getWorker()).isRevokedKey(opts).catch(errorReporter),
        canKeyEncrypt: async (opts) =>
            (await getWorker()).canKeyEncrypt(opts).catch(errorReporter),
        getMessageInfo: async (opts) =>
            (await getWorker()).getMessageInfo(opts).catch(errorReporter),
        getKeyInfo: async (opts) =>
            (await getWorker()).getKeyInfo(opts).catch(errorReporter),
        getSignatureInfo: async (opts) =>
            (await getWorker()).getSignatureInfo(opts).catch(errorReporter),
        getArmoredKeys: async (opts) =>
            (await getWorker()).getArmoredKeys(opts),
        getArmoredSignature: async (opts) =>
            (await getWorker()).getArmoredSignature(opts),
        getArmoredMessage: async (opts) =>
            (await getWorker()).getArmoredMessage(opts),
    } as WorkerPoolInterface; // casting needed to 'reuse' CryptoApi's parametric types declarations and preserve dynamic inference of
    // the output types based on the input ones.
};
