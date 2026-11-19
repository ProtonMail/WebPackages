import { describe, expect, it, vi } from "vitest";
import type { FetchLike, ProtonFetchContext } from "../interface.ts";
import { type RequestPolicy, ServiceType } from "../policy.ts";
import { createPriorityMiddleware } from "./priorityMiddleware.ts";

const makeContext = (policy?: RequestPolicy): ProtonFetchContext => ({
    config: {
        url: new URL("https://api.proton.me"),
        appVersion: "web-calendar@1.0.0",
        locale: "en_US",
    },
    createFetch: vi.fn(),
    startedAt: Date.now(),
    middlewares: [],
    policy,
});

const getPriority = async (
    middleware: ReturnType<typeof createPriorityMiddleware>,
    policy?: RequestPolicy,
    request = new Request("https://api.proton.me/test"),
) => {
    const next = vi
        .fn<FetchLike>()
        .mockResolvedValue(new Response(null, { status: 200 }));
    await middleware(next, makeContext(policy))(request);
    return next.mock.calls[0]?.[0].headers.get("priority");
};

describe("createPriorityMiddleware", () => {
    it("sends Normal by default", async () => {
        expect(await getPriority(createPriorityMiddleware())).toBe("u=4");
    });

    it("sends the service type it was created with", async () => {
        expect(
            await getPriority(createPriorityMiddleware(ServiceType.Background)),
        ).toBe("u=5");
    });

    it("lets a request override the service type", async () => {
        expect(
            await getPriority(createPriorityMiddleware(), {
                service: ServiceType.Interactive,
            }),
        ).toBe("u=2");
    });

    it("keeps a priority header already on the request", async () => {
        expect(
            await getPriority(
                createPriorityMiddleware(),
                { service: ServiceType.Interactive },
                new Request("https://api.proton.me/test", {
                    headers: { priority: "u=0" },
                }),
            ),
        ).toBe("u=0");
    });
});
