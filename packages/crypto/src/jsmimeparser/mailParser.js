/* eslint-disable @typescript-eslint/restrict-plus-operands */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import headerParser from "./headerParser.js";
import RawMimeParser from "./rawMimeParser.js";
import { mergeUint8Arrays, binaryStringToUint8Array, uint8ArrayToBinaryString } from "./utils.js";

// Emitter helpers, for internal functions later on.
var ExtractMimeMsgEmitter = {
    getAttachmentName(part) {
        if (!part || !part["headers"]) {
            return "";
        }

        if (part.headers["content-disposition"]) {
            let filename = MimeParser.getParameter(
                part.headers["content-disposition"][0],
                "filename"
            );
            if (filename) {
                return filename;
            }
        }

        if (part.headers["content-type"]) {
            let name = MimeParser.getParameter(
                part.headers["content-type"][0],
                "name"
            );
            if (name) {
                return name;
            }
        }

        return "";
    },

    // All parts of content-disposition = "attachment" are returned as attachments.
    // For content-disposition = "inline", all parts except those with content-type
    // text/plain, text/html and text/enriched are returned as attachments.
    isAttachment(part) {
        if (!part) {
            return false;
        }

        let contentType = part.contentType || "text/plain";
        if (contentType.search(/^multipart\//i) === 0) {
            return false;
        }

        let contentDisposition = "";
        if (
            Array.isArray(part.headers["content-disposition"]) &&
      part.headers["content-disposition"].length > 0
        ) {
            contentDisposition = part.headers["content-disposition"][0];
        }

        if (
            contentDisposition.search(/^attachment/i) === 0 ||
      contentType.search(/^text\/plain|^text\/html|^text\/enriched/i) === -1
        ) {
            return true;
        }

        return false;
    },

    /** JSMime API **/
    startMessage() {
        this.mimeTree = {
            partName: "",
            contentType: "message/rfc822",
            parts: [],
            size: 0,
            headers: {},
            rawHeaderText: "",
            allAttachments: [],
            // keep track of encountered body parts, based on content-type
            bodyParts: { text: [], html: [] },
            // No support for encryption.
            isEncrypted: false,
        };
        // partsPath is a hierarchical stack of parts from the root to the
        // current part.
        this.partsPath = [this.mimeTree];
        this.options = this.options || {};
    },

    endMessage() {
    // Prepare the mimeMsg object, which is the final output of the emitter.
        this.mimeMsg = null;
        if (this.mimeTree.parts.length == 0) {
            return;
        }

        // Check if only a specific mime part has been requested.
        if (this.options.getMimePart) {
            if (this.mimeTree.parts[0].partName == this.options.getMimePart) {
                this.mimeMsg = this.mimeTree.parts[0];
                this.mimeMsg.bodyAsTypedArray = binaryStringToUint8Array(
                    this.mimeMsg.body
                );
            }
            return;
        }

        this.mimeMsg = this.mimeTree;
    },

    startPart(partNum, headerMap) {
        let utf8Encoder = new TextEncoder();

        let contentType = headerMap.contentType && headerMap.contentType.type
            ? headerMap.contentType.type
            : "text/plain";

        let rawHeaderText = headerMap.rawHeaderText;

        let headers = {};
        for (let [headerName, headerValue] of headerMap._rawHeaders) {
            // MsgHdrToMimeMessage always returns an array, even for single values.
            let valueArray = Array.isArray(headerValue) ? headerValue : [headerValue];
            // Return a binary string, to mimic MsgHdrToMimeMessage.
            headers[headerName] = valueArray.map(value => {
                let utf8ByteArray = utf8Encoder.encode(value);
                return uint8ArrayToBinaryString(utf8ByteArray);
            });
        }

        // Get the most recent part from the hierarchical parts stack, which is the
        // parent of the new part to by added.
        let currentPart = this.partsPath[this.partsPath.length - 1];

        // Add a leading 1 to the partNum.
        let partName = "1" + (partNum !== "" ? "." : "") + partNum;
        if (partName == "1") {
            // MsgHdrToMimeMessage differentiates between the message headers and the
            // headers of the first part. jsmime.js however returns all headers of
            // the message in the first part.

            // Move rawHeaderText and add the content-* headers back to the new/first
            // part.
            currentPart.rawHeaderText = rawHeaderText;
            rawHeaderText = rawHeaderText
                .split(/\n(?![ \t])/)
                .filter(h => h.toLowerCase().startsWith("content-"))
                .join("\n")
                .trim();

            // Move all headers and add the content-* headers back to the new/first
            // part.
            currentPart.headers = headers;
            headers = Object.fromEntries(
                Object.entries(headers).filter(h => h[0].startsWith("content-"))
            );
        }

        // Add default content-type header.
        if (!headers["content-type"]) {
            headers["content-type"] = ["text/plain"];
        }

        let newPart = {
            partName,
            rawBody: null, // Uint8Array
            body: "", // string, coerced based on options
            headers,
            rawHeaderText,
            contentType,
            size: 0,
            parts: [],
            // No support for encryption.
            isEncrypted: false,
        };

        // Add nested new part.
        currentPart.parts.push(newPart);
        // Update the newly added part to be current part.
        this.partsPath.push(newPart);
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    endPart(partNum) {
        let deleteBody = false;
        // Get the most recent part from the hierarchical parts stack.
        let currentPart = this.partsPath[this.partsPath.length - 1];

        // Add size.
        let size = currentPart.body.length;
        currentPart.size += size;

        if (this.isAttachment(currentPart)) {
            currentPart.fileName = this.getAttachmentName(currentPart);
            const contentDispositionHeader = currentPart.headers["content-disposition"] && currentPart.headers["content-disposition"][0];
            const contentIdHeader = currentPart.headers["content-id"] && currentPart.headers["content-id"][0];

            // the content-disposition header, as parsed by jsmime, also contains the filename
            currentPart.contentDisposition = contentDispositionHeader ? contentDispositionHeader.split(";").shift() : undefined;
            currentPart.contentId = contentIdHeader || undefined;

            if (this.options.includeAttachments) {
                this.mimeTree.allAttachments.push(currentPart);
            } else {
                deleteBody = true;
            }
        } else if (currentPart.rawBody) {
            delete currentPart.rawBody; // drop Uint8Array data outside of attachments, to free up memory

            const bodyType = currentPart.contentType || "text/plain";
            switch(bodyType) {
                case "text/html":
                    this.mimeTree.bodyParts.html.push(currentPart.body);
                    break;
                case "text/plain":
                    this.mimeTree.bodyParts.text.push(currentPart.body);
                    break;
        // no support for rich text
            }
        }

        if (deleteBody) {
            delete currentPart.body;
            delete currentPart.rawBody;
        }

        // Remove content-disposition and content-transfer-encoding headers.
        currentPart.headers = Object.fromEntries(
            Object.entries(currentPart.headers).filter(
                h =>
                    !["content-disposition", "content-transfer-encoding"].includes(h[0])
            )
        );

        // Set the parent of this part to be the new current part.
        this.partsPath.pop();

        // Add the size of this part to its parent as well.
        currentPart = this.partsPath[this.partsPath.length - 1];
        currentPart.size += size;
    },

    /**
   * The data parameter is either a string or a Uint8Array.
   */
    deliverPartData(partNum, data, rawData) {
    // Get the most recent part from the hierarchical parts stack.
        let currentPart = this.partsPath[this.partsPath.length - 1];

        if (typeof data === "string") {
            currentPart.body += data;
        } else {
            currentPart.body += uint8ArrayToBinaryString(data);
        }

        // we keep both raw and string data as at this point we do not know whether the part is an attachment
        if (currentPart.rawBody === null) {
            currentPart.rawBody = rawData;
        } else {
            currentPart.rawBody = mergeUint8Arrays([currentPart.rawBody, rawData])
        }
    },
};

var ExtractHeadersEmitter = {
    startPart(partNum, headers) {
        if (partNum == "") {
            this.headers = headers;
        }
    },
};

var ExtractHeadersAndBodyEmitter = {
    body: "",
    // eslint-disable-next-line @typescript-eslint/unbound-method
    startPart: ExtractHeadersEmitter.startPart,
    deliverPartData(partNum, data) {
        if (partNum == "") {
            this.body += data;
        }
    },
};

export const MimeParser = {
    /***
   * Determine an arbitrary "parameter" part of a mail header.
   *
   * @param {string} headerStr - The string containing all parts of the header.
   * @param {string} parameter - The parameter we are looking for.
   *
   *
   * 'multipart/signed; protocol="xyz"', 'protocol' --> returns "xyz"
   *
   * @return {string} String containing the value of the parameter; or "".
   */

    getParameter(headerStr, parameter) {
        parameter = parameter.toLowerCase();
        headerStr = headerStr.replace(/[\r\n]+[ \t]+/g, "");

        let hdrMap = headerParser.parseParameterHeader(
            ";" + headerStr,
            true,
            true
        );

        for (let [key, value] of hdrMap.entries()) {
            if (parameter == key.toLowerCase()) {
                return value;
            }
        }

        return "";
    },

    /**
   * Triggers an synchronous parse of the given input.
   *
   * The input is a string that is immediately parsed, calling all functions on
   * the emitter before this function returns.
   *
   * @param {BinaryString} input   A string or input stream of text to parse.
   * @param emitter The emitter to receive callbacks on.
   * @param opts    A set of options for the parser.
   */
    parseSync(input, emitter, opts) {
    // We only support string parsing if we are trying to do this parse
    // synchronously.
        if (typeof input != "string") {
            throw new Error("input is not a recognizable type!");
        }
        var parser = new RawMimeParser(emitter, opts);
        parser.deliverData(input);
        parser.deliverEOF();
    },

    /**
   * Returns a stream listener that feeds data into a parser.
   *
   * In addition to the functions on the emitter that the parser may use, the
   * generated stream listener will also make calls to onStartRequest and
   * onStopRequest on the emitter (if they exist).
   *
   * @param emitter The emitter to receive callbacks on.
   * @param opts    A set of options for the parser.
   */
    // makeStreamListenerParser(emitter, opts) {
    //   var StreamListener = {
    //     onStartRequest(aRequest) {
    //       try {
    //         if ("onStartRequest" in emitter) {
    //           emitter.onStartRequest(aRequest);
    //         }
    //       } finally {
    //         this._parser.resetParser();
    //       }
    //     },
    //     onStopRequest(aRequest, aStatus) {
    //       this._parser.deliverEOF();
    //       if ("onStopRequest" in emitter) {
    //         emitter.onStopRequest(aRequest, aStatus);
    //       }
    //     },
    //     onDataAvailable(aRequest, aStream, aOffset, aCount) {
    //       var scriptIn = Cc[
    //         "@mozilla.org/scriptableinputstream;1"
    //       ].createInstance(Ci.nsIScriptableInputStream);
    //       scriptIn.init(aStream);
    //       // Use readBytes instead of read to handle embedded NULs properly.
    //       this._parser.deliverData(scriptIn.readBytes(aCount));
    //     },
    //     QueryInterface: ChromeUtils.generateQI([
    //       "nsIStreamListener",
    //       "nsIRequestObserver",
    //     ]),
    //   };
    //   setDefaultParserOptions(opts);
    //   StreamListener._parser = new RawMimeParser(emitter, opts);
    //   return StreamListener;
    // },

    /**
   * Returns a new raw MIME parser.
   *
   * Prefer one of the other methods where possible, since the input here must
   * be driven manually.
   *
   * @param emitter The emitter to receive callbacks on.
   * @param opts    A set of options for the parser.
   */
    makeParser(emitter, opts) {
        return new RawMimeParser(emitter, opts);
    },

    /**
   * Returns a mimeMsg object for the given input. The returned object tries to
   * be compatible with the return value of MsgHdrToMimeMessage. Differences:
   *  - no support for encryption
   *  - calculated sizes differ slightly
   *  - allAttachments includes the content and not a URL
   *  - does not eat TABs in headers, if they follow a CRLF
   *
   * The input is any type of input that would be accepted by parseSync.
   *
   * @param {BinaryString} input   A string of text to parse.
   */
    extractMimeMsg(input, options = {}) {
        var emitter = Object.create(ExtractMimeMsgEmitter);
        // Set default options.
        emitter.options = {
            includeAttachments: true,
            getMimePart: "",
        };
        // Override default options.
        for (let option of Object.keys(options)) {
            emitter.options[option] = options[option];
        }

        MimeParser.parseSync(input, emitter, {
            // jsmime does not use the "1." prefix for the partName.
            pruneat: emitter.options.getMimePart
                .split(".")
                .slice(1)
                .join("."),
            bodyformat: "decode",
            stripcontinuations: true,
            strformat: "unicode",
        });
        return emitter.mimeMsg;
    },

    /**
   * Returns a dictionary of headers for the given input.
   *
   * The input is any type of input that would be accepted by parseSync. What
   * is returned is a JS object that represents the headers of the entire
   * envelope as would be received by startPart when partNum is the empty
   * string.
   *
   * @param input   A string of text to parse.
   */
    extractHeaders(input) {
        var emitter = Object.create(ExtractHeadersEmitter);
        MimeParser.parseSync(input, emitter, { pruneat: "", bodyformat: "none" });
        return emitter.headers;
    },

    /**
   * Returns the headers and body for the given input message.
   *
   * The return value is an array whose first element is the dictionary of
   * headers (as would be returned by extractHeaders) and whose second element
   * is a binary string of the entire body of the message.
   *
   * @param input   A string of text to parse.
   */
    extractHeadersAndBody(input) {
        var emitter = Object.create(ExtractHeadersAndBodyEmitter);
        MimeParser.parseSync(input, emitter, { pruneat: "", bodyformat: "raw" });
        return [emitter.headers, emitter.body];
    },

    // Parameters for parseHeaderField

    /**
   * Parse the header as if it were unstructured.
   *
   * This results in the same string if no other options are specified. If other
   * options are specified, this causes the string to be modified appropriately.
   */
    HEADER_UNSTRUCTURED: 0x00,
    /**
   * Parse the header as if it were in the form text; attr=val; attr=val.
   *
   * Such headers include Content-Type, Content-Disposition, and most other
   * headers used by MIME as opposed to messages.
   */
    HEADER_PARAMETER: 0x02,
    /**
   * Parse the header as if it were a sequence of mailboxes.
   */
    HEADER_ADDRESS: 0x03,

    /**
   * This decodes parameter values according to RFC 2231.
   *
   * This flag means nothing if HEADER_PARAMETER is not specified.
   */
    HEADER_OPTION_DECODE_2231: 0x10,
    /**
   * This decodes the inline encoded-words that are in RFC 2047.
   */
    HEADER_OPTION_DECODE_2047: 0x20,
    /**
   * This converts the header from a raw string to proper Unicode.
   */
    HEADER_OPTION_ALLOW_RAW: 0x40,

    // Convenience for all three of the above.
    HEADER_OPTION_ALL_I18N: 0x70,

    /**
   * Parse a header field according to the specification given by flags.
   *
   * Permissible flags begin with one of the HEADER_* flags, which may be or'd
   * with any of the HEADER_OPTION_* flags to modify the result appropriately.
   *
   * If the option HEADER_OPTION_ALLOW_RAW is passed, the charset parameter, if
   * present, is the charset to fallback to if the header is not decodable as
   * UTF-8 text. If HEADER_OPTION_ALLOW_RAW is passed but the charset parameter
   * is not provided, then no fallback decoding will be done. If
   * HEADER_OPTION_ALLOW_RAW is not passed, then no attempt will be made to
   * convert charsets.
   *
   * @param text    The value of a MIME or message header to parse.
   * @param flags   A set of flags that controls interpretation of the header.
   * @param charset A default charset to assume if no information may be found.
   */
    parseHeaderField(text, flags, charset) {
    // If we have a raw string, convert it to Unicode first
        if (flags & MimeParser.HEADER_OPTION_ALLOW_RAW) {
            text = headerParser.convert8BitHeader(text, charset);
        }

        // The low 4 bits indicate the type of the header we are parsing. All of the
        // higher-order bits are flags.
        switch (flags & 0x0f) {
            case MimeParser.HEADER_UNSTRUCTURED:
                if (flags & MimeParser.HEADER_OPTION_DECODE_2047) {
                    text = headerParser.decodeRFC2047Words(text);
                }
                return text;
            case MimeParser.HEADER_PARAMETER:
                return headerParser.parseParameterHeader(
                    text,
                    (flags & MimeParser.HEADER_OPTION_DECODE_2047) != 0,
                    (flags & MimeParser.HEADER_OPTION_DECODE_2231) != 0
                );
            case MimeParser.HEADER_ADDRESS:
                return headerParser.parseAddressingHeader(
                    text,
                    (flags & MimeParser.HEADER_OPTION_DECODE_2047) != 0
                );
            default:
                throw new Error("Illegal type of header field");
        }
    },
};

/**
 * Parse MIME message
 * @param {String|Uint8Array} data - MIME message to parse
 * @returns {Object} parsed content (see TS definitions for more details)
 */
export function parseMail(data) {
    const encoded = (typeof data === "string") ? new TextEncoder().encode(data) : data;

    const { headers, allAttachments, bodyParts } = MimeParser.extractMimeMsg(uint8ArrayToBinaryString(encoded));
    // these fields can only contain a single value
    const singleKeys = new Set([
        "message-id",
        "content-id",
        "from",
        "sender",
        "in-reply-to",
        "reply-to",
        "subject",
        "date",
        "content-disposition",
        "content-type",
        "content-transfer-encoding",
        "priority",
        "mime-version",
        "content-description",
        "precedence",
        "errors-to"
    ]);

    const mail = {
        headers,
        // drop some fields for each attachment.
        // also, and convert a `null` rawBody to an empty array (edge-case when passing only the attachment headers as `data`)
        attachments: allAttachments.map(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ({ parts, partName, body, isEncrypted, rawBody, ...rest }) => ({ ...rest, content: rawBody || new Uint8Array() })
        ),
        // join all body parts and normalise EOL to \n
        body: {
            html: bodyParts.html.length ? bodyParts.html.join("<br>\n").replace(/\r?\n/g, "\n") : null,
            text: bodyParts.text.length ? bodyParts.text.join("\n").replace(/\r?\n/g, "\n") : null
        },
    };

    // copy some headers into top-level object
    ["subject", "date", "to", "from", "cc", "bcc", "message-id", "in-reply-to", "reply-to"].forEach(key => {
        if (!headers[key]) return;
        const maybeArrayValue = headers[key] && headerParser.parseStructuredHeader(key, headers[key]);
        mail[key] = singleKeys.has(key) && Array.isArray(maybeArrayValue)
            ? maybeArrayValue[maybeArrayValue.length - 1]
            : maybeArrayValue;
    });

    return mail;
}
