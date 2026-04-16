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
import { getItem, setItem, clearItem } from "./secure-session-storage.ts";

export interface SessionMemDto {
    localId: number;
    keyPassword: string;
    clientKey: string;
}
interface Store {
    setItem: typeof setItem;
    getItem: typeof getItem;
    clearItem: typeof clearItem;
}
export class SessionMem {
    private store: Store;

    constructor(
        store: Store = {
            setItem,
            getItem,
            clearItem,
        },
    ) {
        this.store = store;
    }

    private key() {
        return `session`;
    }

    public async load(
        localId: number | undefined,
    ): Promise<SessionMemDto | undefined> {
        try {
            const data = await this.store.getItem(this.key());
            if (!data) {
                return undefined;
            }
            const parsedValue = JSON.parse(data) as SessionMemDto;
            const result: SessionMemDto = {
                localId: parsedValue.localId,
                keyPassword: parsedValue.keyPassword,
                clientKey: parsedValue.clientKey,
            };
            if (localId !== undefined && result.localId !== localId) {
                return undefined;
            }
            return result;
        } catch {
            await this.store.clearItem(this.key()).catch(() => {});
            return undefined;
        }
    }

    public async save(data: SessionMemDto) {
        await this.store.setItem(this.key(), JSON.stringify(data));
    }
}
