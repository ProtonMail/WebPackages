import { computeSHA256 } from "@protontech/crypto/subtle/hash.ts";

/**
 * Creates a new fork secret and its SHA-256 for account: the fork challenge.
 * Account binds the fork to the challenge, and only the client holding the
 * secret can pull it, so a leaked selector is not enough. See
 * `AuthorizeClient.authorize` for where the secret is kept.
 */
export const generateForkSecret = async () => {
    const forkSecret = crypto.getRandomValues(new Uint8Array(32)).toHex();
    // The API hashes the secret as it is sent, i.e. the hex string
    const forkChallenge = (
        await computeSHA256(new TextEncoder().encode(forkSecret))
    ).toHex();
    return { forkSecret, forkChallenge };
};
