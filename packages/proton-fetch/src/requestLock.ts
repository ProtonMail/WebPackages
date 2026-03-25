// Separate file to be able to mock this function
export const requestLock = <T>(
    id: string,
    cb: LockGrantedCallback<T>,
): Promise<T> => {
    return navigator.locks.request<T>(id, cb);
};
