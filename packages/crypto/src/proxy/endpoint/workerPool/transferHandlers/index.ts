/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TransferHandler } from "comlink";

import type { KeyReference } from "../../api.models.ts";
import { ReadableStreamSerializer } from "./streamHandler.ts";

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

interface Serializer<T, SerializedT> {
    canHandle: (value: any) => value is T;
    serialize: (value: T) => SerializedT;
    deserialize: (value: SerializedT) => T;
    getTransferables?: (serialized: SerializedT) => Transferable[];
}

/**
 * Builds a transferer that handles the given named fields of an input object,
 * applying the per-field serializer and collecting the transferables it declares.
 * A field may hold a single value, or an array of values if `maybeArray` is set.
 */
const createTransferer = (fieldSerializers: Record<string, Serializer<any, any> & { maybeArray?: boolean }>) => {
    const fieldNames = Object.keys(fieldSerializers);
    return {
        canHandle: (input: any): input is any =>
            typeof input === "object" && input !== null &&
            fieldNames.some((fieldName) => {
                const fieldValue = input[fieldName];
                if (!fieldValue) return false;
                const { canHandle, maybeArray } = fieldSerializers[fieldName];
                return maybeArray && Array.isArray(fieldValue) ? fieldValue.some(canHandle) : canHandle(fieldValue);
            }),
        serialize: (input: any): [any, Transferable[]] => {
            const serialized: any = { ...input };
            const transferables: Transferable[] = [];
            fieldNames.forEach((fieldName) => {
                const fieldValue = input[fieldName];
                if (!fieldValue) return;
                const { serialize, getTransferables, maybeArray } = fieldSerializers[fieldName];
                const serializeValue = (item: any) => {
                    const serializedValue = serialize(item);
                    if (getTransferables) transferables.push(...getTransferables(serializedValue));
                    return serializedValue;
                };
                serialized[fieldName] = maybeArray && Array.isArray(fieldValue) ? fieldValue.map(serializeValue) : serializeValue(fieldValue);
            });
            return [serialized, transferables];
        },
        deserialize: (serialized: any): any => {
            const deserialized: any = { ...serialized };
            fieldNames.forEach((fieldName) => {
                const fieldValue = serialized[fieldName];
                if (!fieldValue) return;
                const { deserialize, maybeArray } = fieldSerializers[fieldName];
                deserialized[fieldName] = maybeArray && Array.isArray(fieldValue) ? fieldValue.map(deserialize) : deserialize(fieldValue);
            });
            return deserialized;
        },
    };
};

/**
 * Takes care of Uint8Arrays that should be transferred.
 * This is safe to use for values returned by the worker, but not sent from the main thread.
 * NB: no need to use serializer if Uint8Arrays don't need transferring.
 */
const transferableUint8ArraySerializer: Serializer<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> = {
    canHandle: (value: any): value is Uint8Array<ArrayBuffer> =>
        value instanceof Uint8Array,
    serialize: (value) => value,
    deserialize: (value) => value,
    getTransferables: (value) => [value.buffer],
};

interface SerializedError {
    isError: true;
    value: Pick<Error, "message" | "name" | "stack">;
}
const ErrorSerializer: Serializer<Error, SerializedError> = {
    canHandle: (value: any): value is Error =>
        typeof value === "object" && (value instanceof Error || value.isError),
    serialize: ({ message, name, stack }: Error) => ({
        isError: true,
        value: { message, name, stack },
    }),
    deserialize: (serialized: SerializedError) =>
        Object.assign(new Error(serialized.value.message), serialized.value),
};

const ResultTranferer = createTransferer({
    message: transferableUint8ArraySerializer,
    signature: transferableUint8ArraySerializer,
    signatures: { ...transferableUint8ArraySerializer, maybeArray: true },
    encryptedSignature: transferableUint8ArraySerializer,
    sessionKey: transferableUint8ArraySerializer,
    messageStream: ReadableStreamSerializer,
    dataStream: ReadableStreamSerializer,
    hashedDataStream: ReadableStreamSerializer,
    errors: { ...ErrorSerializer, maybeArray: true },
    verificationErrors: { ...ErrorSerializer, maybeArray: true },
});

/**
 * NB: only one transfer handler is applied per input, so keys and streams share a single
 * transferer. Their option names don't overlap, hence one field map handles both.
 */
const OptionTransferer = createTransferer({
    verificationKeys: { ...KeyReferenceSerializer, maybeArray: true },
    signingKeys: { ...KeyReferenceSerializer, maybeArray: true },
    encryptionKeys: { ...KeyReferenceSerializer, maybeArray: true },
    decryptionKeys: { ...KeyReferenceSerializer, maybeArray: true },
    recipientKeys: { ...KeyReferenceSerializer, maybeArray: true },
    privateKey: KeyReferenceSerializer,
    key: KeyReferenceSerializer,
    targetKey: KeyReferenceSerializer,
    sourceKey: KeyReferenceSerializer,
    forwarderKey: KeyReferenceSerializer,
    binaryDataStream: ReadableStreamSerializer,
    binaryMessageStream: ReadableStreamSerializer,
})

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
const oneWayTransferHanders = [
    {
        name: "Uint8Array", // automatically transfer Uint8Arrays from worker (but not vice versa)
        workerHandler: {
            canHandle: transferableUint8ArraySerializer.canHandle,
            serialize: (bytes: Uint8Array<ArrayBuffer>) => [
                bytes,
                [bytes.buffer], // transferables
            ],
            deserialize: transferableUint8ArraySerializer.deserialize
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
            serialize: ResultTranferer.serialize, // returns [serialized, transferables]
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
            serialize: OptionTransferer.serialize, // returns [serialized, transferables]
            deserialize: () => {}, // unused on main thread side
        },
    },
] satisfies OneWayTransferHandler[];

/**
 * These transferHandles are needed to transfer some objects from and to the worker (either as returned data, or as arguments).
 * They are meant to be set both inside the worker and in the main thread.
 */
const sharedTransferHandlers = [
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
] satisfies ExportedTransferHandler[];

// Handlers to be set by the worker
export const workerTransferHandlers = [
    ...sharedTransferHandlers,
    ...oneWayTransferHanders.map(({ name, workerHandler }) => ({
        name,
        handler: workerHandler,
    })),
] satisfies ExportedTransferHandler[];

// Handlers to be set by the main thread
export const mainThreadTransferHandlers = [
    ...sharedTransferHandlers,
    ...oneWayTransferHanders.map(({ name, mainThreadHandler }) => ({
        name,
        handler: mainThreadHandler,
    })),
] satisfies ExportedTransferHandler[];
