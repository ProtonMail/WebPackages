import { decryptData, encryptData } from "@protontech/crypto/aes-gcm";

export const encryptBlob = async (key: CryptoKey, data: string) => {
    return encryptData(
        key,
        new TextEncoder().encode(data),
        new TextEncoder().encode("session"),
    );
};

export const decryptBlob = async (
    key: CryptoKey,
    blob: Uint8Array<ArrayBuffer>,
) => {
    const value = await decryptData(
        key,
        blob,
        new TextEncoder().encode("session"),
    );
    return new TextDecoder().decode(value);
};
