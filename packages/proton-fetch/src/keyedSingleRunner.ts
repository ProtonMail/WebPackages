export class KeyedSingleRunner {
    private running = new Map<string, Promise<unknown>>();

    get<T>(key: string): Promise<T> | undefined {
        const runningPromise = this.running.get(key);
        if (runningPromise) {
            return runningPromise as Promise<T>;
        }
    }

    /**
     * Runs the task only if no other task is currently running for the key.
     * If a task is already running for the key, returns the existing promise.
     */
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
        const runningPromise = this.running.get(key);
        if (runningPromise) {
            return runningPromise as Promise<T>;
        }

        const promise = task();

        // Mark as running
        this.running.set(key, promise);

        // When finished, remove from running map
        promise.then(
            () => this.running.delete(key),
            () => this.running.delete(key),
        );

        return promise;
    }
}
