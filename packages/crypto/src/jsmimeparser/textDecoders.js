import { uint8ArrayToBinaryString } from "./utils.js";

class UTF7TextDecoder {
    constructor() {
        this.collectInput = "";
        this.decodeString = decodeUtf7;
    }
    decode(input, options = {}) {
        const more = options.stream;
        // There are cases where this is called without input, to flush the collected input
        if (input) {
            this.collectInput += uint8ArrayToBinaryString(input);
        }
        if (more) {
            return "";
        }
        return this.decodeString(this.collectInput);
    }
}

class UTF7ImapTextDecoder extends UTF7TextDecoder {
    constructor() {
        super();
        this.decodeString = decodeUtf7Imap;
    }
}

export function MimeTextDecoder(charset, options) {
    switch (charset.toLowerCase()) {
        case "utf-7":
            return new UTF7TextDecoder();
        case "utf-7-imap":
            return new UTF7ImapTextDecoder();
        case "cp932":
            // https://bugzilla.mozilla.org/show_bug.cgi?id=1511950
            return new TextDecoder("shift_jis", options);
        default:
            return new TextDecoder(charset, options);
    }
}

// UTF7 helpers

/**
 * Decode UTF7 string to unicode
 * @see {@link https://github.com/emailjs/emailjs-utf7} for original implementation
 */
function decodeFromUTF7 (str) {
    const octets = Uint8Array.fromBase64(str)
    let output = ""

    // In modified UTF-7, all characters are represented by their two byte Unicode ID.
    for (let i = 0, len = octets.length; i < len;) {
        output += String.fromCharCode(octets[i++] << 8 | octets[i++])
    }
    return output
}

/**
 * Decodes UTF-7 string, see RFC 2152
 * @see {@link https://github.com/emailjs/emailjs-utf7} for original implementation
 * @param {String} str String to decode
 */
export const decodeUtf7 = str =>
    str.replace(/\+([A-Za-z0-9/]*)-?/gi, (_, chunk) => chunk === "" ? "+" : decodeFromUTF7(chunk))

/**
 * Decodes UTF-7 string, see RFC 3501
 * @see {@link https://github.com/emailjs/emailjs-utf7} for original implementation
 * @param {String} str String to decode
 */
export const decodeUtf7Imap = str =>
    str.replace(/&([^-]*)-/g, (_, chunk) => (chunk === "") ? "&" : decodeFromUTF7(chunk.replace(/,/g, "/")))
