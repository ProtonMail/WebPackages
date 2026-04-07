import {
    decryptData,
    encryptData,
    importKey,
} from "@protontech/crypto/subtle/aesGcm.ts";

/**
 * We aim to deliberately be non-persistent. This is useful for
 * data that wants to be preserved across refreshes, but is too sensitive
 * to be safely written to disk. Unfortunately, although sessionStorage is
 * deleted when a session ends, major browsers automatically write it
 * to disk to enable a session recovery feature, so using sessionStorage
 * alone is inappropriate.
 *
 * The second, more important trick is to split sensitive data between
 * window.name and sessionStorage. window.name is a property that, like
 * sessionStorage, is preserved across refresh and navigation within the
 * same tab - however, it seems to never be stored persistently. This
 * provides exactly the lifetime we want. Unfortunately, window.name is
 * readable and transferable between domains, so any sensitive data stored
 * in it would leak to random other websites.
 */
export async function getItem(storageKey: string): Promise<string | null> {
    const value = sessionStorage.getItem(storageKey);
    if (!value) {
        return null;
    }
    if (!window.name) {
        return null;
    }
    try {
        const key = await importKey(Uint8Array.fromBase64(window.name));
        const decryptedData = await decryptData(
            key,
            Uint8Array.fromBase64(value),
        );
        return new TextDecoder().decode(decryptedData);
    } catch {
        return null;
    }
}

export async function setItem(storageKey: string, data: string) {
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const key = await importKey(keyBytes);
    window.name = keyBytes.toBase64();
    const encryptedData = await encryptData(
        key,
        new TextEncoder().encode(data),
    );
    sessionStorage.setItem(storageKey, encryptedData.toBase64());
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function clearItem(storageKey: string) {
    window.name = "";
    sessionStorage.removeItem(storageKey);
}
