export type Headers = Record<string, string[]>;

export interface Attachment {
    content: Uint8Array<ArrayBuffer>;
    headers: Headers;
    size: number;
    fileName?: string;
    contentType?: string;
    contentDisposition?: string;
    contentId?: string;
}

interface Address { name: string, email: string }
interface Group { name: string, group: Address[] }
type AddressOrGroup = Address | Group;

export interface ParsedMessage {
    attachments: Attachment[];
    headers: Headers;
    body: {
        html: string | null; // 'text/html' body parts, joined together separated by <br>\n
        text: string | null; // 'text/plain' body parts, joined together separated by \n
    },
    date?: Date;
    subject?: string,
    from?: Address,
    to?: AddressOrGroup[],
    cc?: AddressOrGroup[],
    bcc?: AddressOrGroup[],
    "reply-to"?: Address
}

export function parseMail(message: string | Uint8Array<ArrayBuffer>): ParsedMessage;
