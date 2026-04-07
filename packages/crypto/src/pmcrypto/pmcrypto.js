import {
    setConfig,
    readMessage,
    readSignature,
    readCleartextMessage,
    readKey,
    readKeys,
    readPrivateKey,
    decryptKey,
} from "./openpgp.ts";

export function init() {
    if (arguments.length) {
        throw new Error("Loading OpenPGP separately is no longer required");
    }
    setConfig();
}

export { updateServerTime, serverTime } from "./serverTime.ts";

export { SHA256, SHA512, unsafeMD5, unsafeSHA1 } from "./crypto/hash.ts";
export { argon2 } from "./crypto/argon2.ts";

export {
    generateKey,
    reformatKey,
    generateSessionKey,
    generateSessionKeyForAlgorithm,
    isExpiredKey,
    isRevokedKey,
    canKeyEncrypt,
    getMatchingKey,
    getSHA256Fingerprints,
} from "./key/utils.js";

export {
    generateForwardingMaterial,
    doesKeySupportForwarding,
    isForwardingKey,
} from "./key/forwarding.ts";

export { decryptSessionKey } from "./key/decrypt.js";
export { encryptKey, encryptSessionKey } from "./key/encrypt.js";
export { default as decryptMessage } from "./message/decrypt.js";
export { default as encryptMessage } from "./message/encrypt.js";
export { default as signMessage } from "./message/sign.js";
export { verifyMessage, verifyCleartextMessage } from "./message/verify.js";

export { splitMessage, armorBytes, stripArmor } from "./message/utils.ts";

export {
    decryptKey,
    readMessage,
    readSignature,
    readCleartextMessage,
    readKey,
    readKeys,
    readPrivateKey,
};

export { default as processMIME } from "./message/processMIME.ts";

export { checkKeyStrength, checkKeyCompatibility } from "./key/check.ts";

export * from "./constants.ts";

export { SignatureContextError } from "./message/context.ts";
