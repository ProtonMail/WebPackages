/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TransferHandler } from "comlink";

import type { KeyReference } from "../../api.models.ts";
import {
    type SerializeWebStreamTypes,
    ReadableStreamSerializer,
} from "./streamHandler.ts";

// return interface with same non-function fields as T, and with function fields type converted to their return type
// e.g. ExtractFunctionReturnTypes<{ foo: () => string, bar: 3 }> returns { foo: string, bar: 3 }
type ExtractFunctionReturnTypes<T> = {
    [I in keyof T]: T[I] extends (...args: any) => any
        ? ReturnType<T[I]>
        : T[I] extends (infer A)[]
            ? ExtractFunctionReturnTypes<A>[]
            : T[I]; // recurse on array fields
};

// ExtractFunctionReturnTypes cannot keep track of fixed length of `_keyContentHash` so we explicitly re-declare
type SerializedKeyReference = ExtractFunctionReturnTypes<KeyReference> & {
    _keyContentHash: [string, string];
};
const KeyReferenceSerializer = {
    canHandle: (obj: any): obj is KeyReference =>
        typeof obj === "object" &&
        obj._idx !== undefined &&
        obj.isPrivate !== undefined, // NB: careful not to confuse with KeyInfo object
    serialize: (keyReference: KeyReference): SerializedKeyReference => ({
        // store values directly, convert back to function when deserialising
        ...keyReference,
        isPrivate: keyReference.isPrivate(),
        isPrivateKeyV4: keyReference.isPrivateKeyV4(),
        isPrivateKeyV6: keyReference.isPrivateKeyV6(),
        getVersion: keyReference.getVersion(),
        getFingerprint: keyReference.getFingerprint(),
        getSHA256Fingerprints: keyReference.getSHA256Fingerprints(),
        getKeyID: keyReference.getKeyID(),
        getKeyIDs: keyReference.getKeyIDs(),
        getAlgorithmInfo: keyReference.getAlgorithmInfo(),
        getCreationTime: keyReference.getCreationTime(),
        getExpirationTime: keyReference.getExpirationTime(),
        getUserIDs: keyReference.getUserIDs(),
        isWeak: keyReference.isWeak(),
        equals: false, // unused, function will be reconstructed based on ._keyContentHash
        subkeys: keyReference.subkeys.map((subkey) => ({
            getAlgorithmInfo: subkey.getAlgorithmInfo(),
            getKeyID: subkey.getKeyID(),
        })),
    }),

    deserialize: (serialized: SerializedKeyReference): KeyReference =>
        ({
            ...serialized,
            isPrivate: () => serialized.isPrivate,
            isPrivateKeyV4: () => serialized.isPrivateKeyV4,
            isPrivateKeyV6: () => serialized.isPrivateKeyV6,
            getVersion: () => serialized.getVersion,
            getFingerprint: () => serialized.getFingerprint,
            getSHA256Fingerprints: () => serialized.getSHA256Fingerprints,
            getKeyID: () => serialized.getKeyID,
            getKeyIDs: () => serialized.getKeyIDs,
            getAlgorithmInfo: () => serialized.getAlgorithmInfo,
            getCreationTime: () => serialized.getCreationTime,
            getExpirationTime: () => serialized.getExpirationTime,
            getUserIDs: () => serialized.getUserIDs,
            isWeak: () => serialized.isWeak,
            equals: (otherKey, ignoreOtherCerts) =>
                ignoreOtherCerts
                    ? otherKey._keyContentHash[1] ===
                      serialized._keyContentHash[1]
                    : otherKey._keyContentHash[0] ===
                      serialized._keyContentHash[0],
            subkeys: serialized.subkeys.map((subkey) => ({
                getAlgorithmInfo: () => subkey.getAlgorithmInfo,
                getKeyID: () => subkey.getKeyID,
            })),
        }) as KeyReference,
};

const keyOptionNames = [
    "verificationKeys",
    "signingKeys",
    "encryptionKeys",
    "decryptionKeys",
    "privateKey",
    "key",
    "recipientKeys",
    "targetKey",
    "sourceKey",
    "forwarderKey",
] as const;
type SerializedKeyOptions = Record<typeof keyOptionNames[number], SerializedKeyReference | SerializedKeyReference[]>;
type KeyOptions = Partial<Record<typeof keyOptionNames[number], KeyReference | KeyReference[]>> & Record<string, unknown>;
const KeyOptionsSerializer = {
    _optionNames: keyOptionNames,
    canHandle: (options: any): options is KeyOptions => {
        if (typeof options !== "object") {
            return false;
        }
        return KeyOptionsSerializer._optionNames.some(
            (name) => options[name] && KeyReferenceSerializer.canHandle(options[name])
        );
    },

    serialize: (options: KeyOptions & Record<string, unknown>) => {
        const serializedOptions = { ...options } as unknown as SerializedKeyOptions & Record<string, unknown>;
        KeyOptionsSerializer._optionNames.forEach((name) => {
            if (options[name]) {
                serializedOptions[name] = Array.isArray(options[name])
                    ? options[name].map(KeyReferenceSerializer.serialize)
                    : KeyReferenceSerializer.serialize(options[name]);
            }
        });
        return serializedOptions;
    },
    getTransferables: () => [],
    deserialize: (serializedOptions: SerializedKeyOptions) => {
        const options = { ...serializedOptions } as unknown as KeyOptions & Record<string, unknown>;
        KeyOptionsSerializer._optionNames.forEach((name) => {
            if (serializedOptions[name]) {
                options[name] = Array.isArray(serializedOptions[name])
                    ? serializedOptions[name].map(
                        KeyReferenceSerializer.deserialize,
                    )
                    : KeyReferenceSerializer.deserialize(
                        serializedOptions[name],
                    );
            }
        });

        return options;
    },
};

const streamOptionNames = [
    // "dataStream", // computeHashStream
    "binaryDataStream",
    "binaryMessageStream"
] as const;
type StreamOptions = Partial<Record<typeof streamOptionNames[number], ReadableStream>>// & Record<string, unknown>;
type SerializedStreamOptions = SerializeWebStreamTypes<StreamOptions> & Record<string, unknown>//Partial<Record<typeof streamOptionNames[number], MessagePort>> & Record<string, unknown>;

const StreamOptionsSerializer = {
    _optionNames: streamOptionNames,
    canHandle: (input: any): input is StreamOptions =>
        typeof input === "object" &&
        StreamOptionsSerializer._optionNames.some(
            (name) => ReadableStreamSerializer.canHandle(input[name])),

    serialize: (data: StreamOptions): SerializedStreamOptions => {
        const serializedOptions = { ...data } as unknown as SerializedStreamOptions;
        StreamOptionsSerializer._optionNames.forEach((name) => {
            if (data[name]) {
                serializedOptions[name] = ReadableStreamSerializer.serialize(data[name]);
            }
        });
        return serializedOptions;
    },
    getTransferables: (input: SerializedStreamOptions) => {
        const transferables = StreamOptionsSerializer._optionNames
            .filter((name) => input[name] instanceof MessagePort)
            .map((name) => input[name]);
        // 'signatures' are always in binary form
        return transferables;
    },
    deserialize: (serializedOptions: SerializedStreamOptions): StreamOptions & Record<string, unknown> => {
        const options = { ...serializedOptions } as unknown as StreamOptions;
        StreamOptionsSerializer._optionNames.forEach((name) => {
            if (serializedOptions[name]) {
                options[name] = ReadableStreamSerializer.deserialize(serializedOptions[name]);
            }
        });
        return options;
    },
};

interface SerializedError {
    isError: true;
    value: Pick<Error, "message" | "name" | "stack">;
}
const ErrorSerializer = {
    canHandle: (value: any) =>
        typeof value === "object" && (value instanceof Error || value.isError),
    serialize: ({ message, name, stack }: Error) => ({
        isError: true,
        value: { message, name, stack },
    }),
    deserialize: (serialized: SerializedError) =>
        Object.assign(new Error(serialized.value.message), serialized.value),
};

const ResultTranferer = {
    _binaryFieldNames: [
        "message",
        "signature",
        "signatures",
        "encryptedSignature",
        "sessionKey",
    ],
    _streamFieldNames: ["messageStream", "dataStream"],
    _errorFieldNames: ["errors", "verificationErrors"],
    canHandle: (result: any): result is any => {
        if (typeof result !== "object") {
            return false;
        }
        return ResultTranferer._binaryFieldNames.some((name) => result[name]) ||
            ResultTranferer._streamFieldNames.some(
                (name) => result[name] && ReadableStreamSerializer.canHandle(result[name])
            );
    },
    serialize: (result: any) => {
        const serializedResult = { ...result };
        ResultTranferer._streamFieldNames.forEach((name) => {
            if (result[name]) {
                serializedResult[name] = ReadableStreamSerializer.serialize(result[name]);
            }
        });
        ResultTranferer._errorFieldNames.forEach((name) => {
            if (result[name]) {
                serializedResult[name] = result[name].map(
                    ErrorSerializer.serialize,
                );
            }
        });
        return serializedResult;
    },
    getTransferables: (result: any) => {
        const transferablesBuffers = ResultTranferer._binaryFieldNames
            .filter((name) => result[name] instanceof Uint8Array)
            .map((name) => result[name].buffer);
        const transferablesStreams = ResultTranferer._streamFieldNames
            .filter((name) => result[name] instanceof MessagePort)
            .map((name) => result[name]);
        // 'signatures' are always in binary form
        return transferablesBuffers.concat(
            transferablesStreams,
            result.signatures
                ? result.signatures.map(
                    (sig: Uint8Array<ArrayBuffer>) => sig.buffer,
                )
                : [],
        );
    },
    deserialize: (serializedResult: any) => {
        const result = { ...serializedResult };
        ResultTranferer._streamFieldNames.forEach((name) => {
            if (serializedResult[name]) {
                result[name] = ReadableStreamSerializer.deserialize(serializedResult[name]);
            }
        });
        ResultTranferer._errorFieldNames.forEach((name) => {
            if (serializedResult[name]) {
                result[name] = serializedResult[name].map(
                    ErrorSerializer.deserialize,
                );
            }
        });
        return result;
    },
};

type SerializedOptions = SerializedKeyOptions & SerializedStreamOptions
/**
 * NB: only one transfer handle is applied per input, hence transferer are needed to combine multiple serializers.
 * Currently the logic is bundled together since we don't have overlapping option names with
 * types that require different serialization (e.g. for streams we use specific option names).
 */
const OptionTransferer = {
    _combinedSerializers: [KeyOptionsSerializer, StreamOptionsSerializer],
    canHandle: (options: any): options is KeyOptions | StreamOptions => {
        if (typeof options !== "object") {
            return false;
        }
        return OptionTransferer._combinedSerializers.some(
            (serializer) => serializer.canHandle(options)
        );
    },
    serialize: (options: any): SerializedOptions => OptionTransferer._combinedSerializers.reduce(
        // avoid calling the serializer unnecessarily
        (partiallySerialized, serializer) => serializer.canHandle(partiallySerialized) ? serializer.serialize(partiallySerialized) : partiallySerialized,
        options
    ),
    getTransferables: (serializedOptions: SerializedOptions) => OptionTransferer._combinedSerializers.reduce<Transferable[]>(
        (partialTransferables, serializer) => partialTransferables.concat(
            serializer.getTransferables(serializedOptions) ?? []
        ),
        []
    ),
    deserialize: (serializedOptions: any): KeyOptions | StreamOptions => OptionTransferer._combinedSerializers.reduce(
        (partiallyDeserialized, serializer) => serializer.deserialize(partiallyDeserialized),
        serializedOptions
    )
}

interface OneWayTransferHandler {
    name: string;
    workerHandler: TransferHandler<any, any>;
    mainThreadHandler: TransferHandler<any, any>;
}
interface ExportedTransferHandler {
    name: string;
    handler: TransferHandler<any, any>;
}

/**
 * Transfer handlers for data that needs to be transferred only in one direction (e.g. from the worker to the main thread).
 * NB: serializer still needs to be declared for recipient side too (comlink does not support implementing only the deserializer)
 */
const oneWayTransferHanders: OneWayTransferHandler[] = [
    {
        name: "Uint8Array", // automatically transfer Uint8Arrays from worker (but not vice versa)
        workerHandler: {
            canHandle: (input: any): input is Uint8Array<ArrayBuffer> =>
                input instanceof Uint8Array,
            serialize: (bytes: Uint8Array<ArrayBuffer>) => [
                bytes,
                [bytes.buffer], // transferables
            ],
            deserialize: (bytes: Uint8Array<ArrayBuffer>) => bytes,
        },
        mainThreadHandler: {
            canHandle: (input: any): input is Uint8Array<ArrayBuffer> =>
                input instanceof Uint8Array,
            serialize: (bytes: Uint8Array<ArrayBuffer>) => [
                bytes,
                [], // transferables: no transferring from main thread
            ],
            deserialize: (bytes: Uint8Array<ArrayBuffer>) => bytes,
        },
    },
    {
        name: "encrypt/decrypt/sign/verifyResult", // result objects are already serialised, but we need to transfer all Uint8Arrays fields from worker
        workerHandler: {
            canHandle: ResultTranferer.canHandle,
            serialize: (result: any) => {
                const serializedResult = ResultTranferer.serialize(result);
                return [
                    serializedResult,
                    ResultTranferer.getTransferables(serializedResult), // transferables
                ]
            },
            deserialize: (result: any) => result, // unused
        },
        mainThreadHandler: {
            canHandle: ResultTranferer.canHandle,
            serialize: (result: any) => [result, []], // unused
            deserialize: ResultTranferer.deserialize,
        },
    },
    {
        name: "Options",
        workerHandler: {
            canHandle: OptionTransferer.canHandle,
            serialize: () => [undefined, []], // unused on worker side
            deserialize: OptionTransferer.deserialize,
        },
        mainThreadHandler: {
            canHandle: OptionTransferer.canHandle,
            serialize: (options: StreamOptions | KeyOptions) => {
                const serializedOptions =
                    OptionTransferer.serialize(options);
                return [
                    serializedOptions,
                    OptionTransferer.getTransferables(serializedOptions)
                ];
            },
            deserialize: () => {}, // unused on main thread side
        },
    },
];

/**
 * These transferHandles are needed to transfer some objects from and to the worker (either as returned data, or as arguments).
 * They are meant to be set both inside the worker and in the main thread.
 */
const sharedTransferHandlers: ExportedTransferHandler[] = [
    {
        name: "KeyReference",
        handler: {
            canHandle: KeyReferenceSerializer.canHandle,
            serialize: (keyReference: KeyReference) => [
                KeyReferenceSerializer.serialize(keyReference),
                [], // transferables
            ],
            deserialize: KeyReferenceSerializer.deserialize,
        },
    },
];

// Handlers to be set by the worker
export const workerTransferHandlers: ExportedTransferHandler[] = [
    ...sharedTransferHandlers,
    ...oneWayTransferHanders.map(({ name, workerHandler }) => ({
        name,
        handler: workerHandler,
    })),
];

// Handlers to be set by the main thread
export const mainThreadTransferHandlers: ExportedTransferHandler[] = [
    ...sharedTransferHandlers,
    ...oneWayTransferHanders.map(({ name, mainThreadHandler }) => ({
        name,
        handler: mainThreadHandler,
    })),
];
