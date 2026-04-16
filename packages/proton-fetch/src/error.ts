class BaseError extends Error {
    public cause?: unknown;
    constructor(name: string, message: string, cause?: unknown) {
        super(message);
        this.name = name;
        if (cause !== undefined) this.cause = cause;
    }
}

export class TimeoutError extends BaseError {
    constructor(message = "Request timed out", cause?: unknown) {
        super("TimeoutError", message, cause);
    }
}
