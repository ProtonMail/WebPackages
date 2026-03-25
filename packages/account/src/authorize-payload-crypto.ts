import { decryptData } from "@protontech/crypto/aes-gcm";

export type PayloadBlob =
    | {
          type: "default";
          keyPassword: string;
      }
    | {
          type: "offline";
          keyPassword: string;
          offlineKeyPassword: string;
          offlineKeySalt: string;
      };

export type PayloadResult = {
    keyPassword: string;
    offlineKey?: {
        password: string;
        salt: string;
    };
};

const decryptPayloadData = async (
    key: CryptoKey,
    data: string,
    payloadVersion: number,
) => {
    if (payloadVersion === 3) {
        const value = await decryptData(
            key,
            Uint8Array.fromBase64(data),
            new TextEncoder().encode("fork"),
        );
        return new TextDecoder().decode(value);
    }
    throw new Error("Unsupported payload version");
};

export const decryptPayload = async (
    key: CryptoKey,
    data: string,
    payloadVersion: number,
): Promise<PayloadResult> => {
    const string = await decryptPayloadData(key, data, payloadVersion);
    const parsedValue: PayloadBlob = JSON.parse(string);

    const keyPassword = parsedValue.keyPassword ?? "";
    let offlineKey: PayloadResult["offlineKey"];

    if (
        parsedValue.type === "offline" &&
        parsedValue.offlineKeyPassword &&
        parsedValue.offlineKeySalt
    ) {
        offlineKey = {
            salt: parsedValue.offlineKeySalt,
            password: parsedValue.offlineKeyPassword,
        };
    }

    return {
        keyPassword,
        offlineKey,
    };
};
