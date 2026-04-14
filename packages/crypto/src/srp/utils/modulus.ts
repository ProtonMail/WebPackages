import { CryptoProxy, VERIFICATION_STATUS, type PublicKeyReference } from "../../index.ts";

import { SRP_MODULUS_KEY } from "../constants.ts";

/**
 * Get key to verify the modulus
 */
const getModulusKey = (() => {
    let cachedKeyReference: PublicKeyReference | undefined;

    const get = async () => {
        try {
            const keyReference = await CryptoProxy.importPublicKey({ armoredKey: SRP_MODULUS_KEY });
            cachedKeyReference = keyReference;
            return cachedKeyReference;
        } catch (e) {
            cachedKeyReference = undefined;
            throw e;
        }
    };

    return async () => {
        const isValidKeyReference =
            cachedKeyReference &&
            // after logging out, the key store is cleared, and the key reference becomes invalid.
            // try and export the key to see if it's still valid
            (await CryptoProxy.exportPublicKey({ key: cachedKeyReference, format: "binary" })
                .then(() => true)
                .catch(() => false));
        if (isValidKeyReference) {
            return cachedKeyReference!;
        }
        return get();
    };
})();

/**
 * Verify the modulus signature with the SRP public key
 * @returns modulus value if verification is successful
 * @throws on verification error
 */
const verifyModulus = async (publicKey: PublicKeyReference, modulus: string) => {
    try {
        const { data: modulusData, verificationStatus } = await CryptoProxy.verifyCleartextMessage({
            armoredCleartextMessage: modulus,
            verificationKeys: publicKey,
        });

        if (verificationStatus !== VERIFICATION_STATUS.SIGNED_AND_VALID) {
            throw new Error();
        }

        return modulusData;
    } catch {
        throw new Error("Unable to verify server identity");
    }
};

/**
 * Verify modulus from the API and get the value.
 */
export const verifyAndGetModulus = async (modulus: string) => {
    const publicKey = await getModulusKey();
    const modulusData = await verifyModulus(publicKey, modulus);
    return Uint8Array.fromBase64(modulusData);
};
