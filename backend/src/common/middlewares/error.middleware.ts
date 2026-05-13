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

export const errorHandler = (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction,
) => {
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        message,
    });
};
