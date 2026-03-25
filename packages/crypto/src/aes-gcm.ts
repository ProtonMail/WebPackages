export function mergeUint8Arrays(arrays: Uint8Array<ArrayBuffer>[]) {
    const length = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const chunksAll = new Uint8Array(length);
    arrays.reduce((position, arr) => {
        chunksAll.set(arr, position);
        return position + arr.length;
    }, 0);
    return chunksAll;
}

const IV_LENGTH_BYTES = 12;
export const ENCRYPTION_ALGORITHM = "AES-GCM";
export type AesGcmCryptoKey = CryptoKey;

type ImportKeyParameters = Parameters<typeof crypto.subtle.importKey>;

export const importKey = async (
    key: Uint8Array<ArrayBuffer>,
    {
        keyUsage = ["decrypt", "encrypt"],
        extractable = false,
    }: {
        keyUsage?: ImportKeyParameters[4];
        extractable?: ImportKeyParameters[3];
    } = {},
) => {
    return crypto.subtle.importKey(
        "raw",
        key,
        "AES-GCM",
        extractable,
        keyUsage,
    );
};

export const encryptData = async (
    key: AesGcmCryptoKey,
    data: Uint8Array<ArrayBuffer>,
    additionalData?: Uint8Array<ArrayBuffer>,
) => {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
    const ciphertext = await crypto.subtle.encrypt(
        {
            name: ENCRYPTION_ALGORITHM,
            iv,
            ...(additionalData !== undefined ? { additionalData } : undefined),
        },
        key,
        data,
    );

    return mergeUint8Arrays([iv, new Uint8Array(ciphertext)]);
};

export const decryptData = async (
    key: AesGcmCryptoKey,
    data: Uint8Array<ArrayBuffer>,
    additionalData?: Uint8Array<ArrayBuffer>,
) => {
    const ivLength = IV_LENGTH_BYTES;
    const iv = data.slice(0, ivLength);
    const ciphertext = data.slice(ivLength, data.length);
    const result = await crypto.subtle.decrypt(
        {
            name: ENCRYPTION_ALGORITHM,
            iv,
            ...(additionalData !== undefined ? { additionalData } : undefined),
        },
        key,
        ciphertext,
    );

    return new Uint8Array(result);
};
