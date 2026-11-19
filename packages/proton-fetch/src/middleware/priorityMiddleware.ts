import type { MiddlewareFn } from "../interface.ts";
import { ServiceType } from "../policy.ts";

/**
 * Creates a middleware that sends the service type as the `priority` header
 * (RFC 9218), e.g. `priority: u=4`. A request can override `service` with the
 * `policy.service` fetch option. A `priority` header already on the request is
 * kept.
 *
 * Cross-origin APIs must allow the `priority` header in CORS preflights.
 */
export const createPriorityMiddleware = (
    service: ServiceType = ServiceType.Normal,
): MiddlewareFn => {
    return (next, context) => {
        return (request) => {
            if (!request.headers.has("priority")) {
                request.headers.set(
                    "priority",
                    `u=${context.policy?.service ?? service}`,
                );
            }
            return next(request);
        };
    };
};
