import { Request, Response, NextFunction } from 'express';

export class ApiError extends Error {
    constructor(
        public message: string,
        public statusCode: number = 500,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

const MAX_MESSAGE_LENGTH = 200;

export const errorHandler = (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction,
) => {
    const statusCode = err.statusCode || err.status || 500;
    const rawMessage = err.message || 'Internal Server Error';
    // Some errors (e.g. an SDK/network failure bubbling up unwrapped) carry a
    // huge message — cap what reaches the client so a toast never has to
    // render a wall of text; the full message is still in the server logs.
    const message = rawMessage.length > MAX_MESSAGE_LENGTH
        ? `${rawMessage.slice(0, MAX_MESSAGE_LENGTH)}…`
        : rawMessage;

    res.status(statusCode).json({
        success: false,
        message,
    });
};
