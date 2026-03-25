import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KeyedSingleRunner } from "./keyedSingleRunner.ts";

describe("KeyedSingleRunner (with fake timers)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should run a task and return its result", async () => {
        const runner = new KeyedSingleRunner();
        const task = vi.fn(
            () =>
                new Promise<number>((resolve) => {
                    setTimeout(() => resolve(42), 100);
                }),
        );

        const promise = runner.run("key1", task);

        // Fast-forward time
        vi.advanceTimersByTime(100);

        const result = await promise;
        expect(result).toBe(42);
        expect(task).toHaveBeenCalledTimes(1);
    });

    it("should return the same promise if a task is already running", async () => {
        const runner = new KeyedSingleRunner();

        const task = vi.fn(
            () =>
                new Promise<number>((resolve) => {
                    setTimeout(() => resolve(123), 100);
                }),
        );

        const promise1 = runner.run("key1", task);
        const promise2 = runner.run("key1", task);

        expect(promise1).toBe(promise2);

        vi.advanceTimersByTime(100);

        const result = await promise1;
        expect(result).toBe(123);
        expect(task).toHaveBeenCalledTimes(1);
    });

    it("should remove the running task from the map after it finishes", async () => {
        const runner = new KeyedSingleRunner();
        const task = vi.fn(
            () =>
                new Promise<string>((resolve) => {
                    setTimeout(() => resolve("done"), 50);
                }),
        );

        const promise = runner.run("key1", task);

        // Still running
        expect(runner.get("key1")).toBe(promise);

        vi.advanceTimersByTime(50);

        const result = await promise;
        expect(result).toBe("done");

        // Map should be cleared
        expect(runner.get("key1")).toBeUndefined();
    });

    it("should run tasks independently for different keys", async () => {
        const runner = new KeyedSingleRunner();

        const task1 = vi.fn(
            () =>
                new Promise<number>((resolve) => {
                    setTimeout(() => resolve(1), 30);
                }),
        );
        const task2 = vi.fn(
            () =>
                new Promise<number>((resolve) => {
                    setTimeout(() => resolve(2), 60);
                }),
        );

        const promise1 = runner.run("key1", task1);
        const promise2 = runner.run("key2", task2);

        vi.advanceTimersByTime(30);
        const r1 = await promise1;
        expect(r1).toBe(1);

        vi.advanceTimersByTime(30);
        const r2 = await promise2;
        expect(r2).toBe(2);

        expect(task1).toHaveBeenCalledTimes(1);
        expect(task2).toHaveBeenCalledTimes(1);
    });

    it("should handle rejected tasks and remove them from the map", async () => {
        const runner = new KeyedSingleRunner();

        const task = vi.fn(
            () =>
                new Promise<number>((_, reject) => {
                    setTimeout(() => reject(new Error("fail")), 50);
                }),
        );

        const promise = runner.run("key1", task);
        await vi.runAllTimersAsync();
        await expect(promise).rejects.toThrow("fail");

        expect(runner.get("key1")).toBeUndefined();
    });
});
