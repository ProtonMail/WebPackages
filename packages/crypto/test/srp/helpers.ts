import { CryptoProxy } from "../../src/index.ts";

/**
 * Load Crypto API outside of web workers, for testing purposes.
 */
export async function setupCryptoProxyForTesting() {
    // dynamic import to avoid loading the library unless required
    const { Api: CryptoApi } = await import("../../src/proxy/endpoint/api.ts");
    CryptoApi.init({});
    CryptoProxy.setEndpoint(new CryptoApi(), (endpoint) => endpoint.clearKeyStore());
}

export function releaseCryptoProxy() {
    return CryptoProxy.releaseEndpoint();
}

let originalGetRandomValues: undefined | typeof crypto.getRandomValues;
/**
 * Mock crypto.getRandomValues using the mocked implementation (if given). Otherwise,
 * a deterministic function will fill the buffer with consecutive values from 0 up to 254.
 */
export const initRandomMock = (mockedImplementation: <T extends ArrayBufferView>(buf: T) => T) => {
    originalGetRandomValues ??= crypto.getRandomValues; // eslint-disable-line @typescript-eslint/unbound-method

    crypto.getRandomValues = mockedImplementation;
};

export const disableRandomMock = () => {
    if (!originalGetRandomValues) {
        throw new Error("mock was not initialized");
    }
    crypto.getRandomValues = originalGetRandomValues;
    originalGetRandomValues = undefined;
};
