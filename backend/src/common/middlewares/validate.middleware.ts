import { Request, Response, NextFunction } from 'express';
import { ObjectSchema } from 'joi';
import { ApiError } from './error.middleware';

export const validate = (schema: ObjectSchema) =>
    (req: Request, _res: Response, next: NextFunction) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            errors: { wrap: { label: false } },
        });

        if (error) {
            throw new ApiError(
                error.details.map((d) => d.message).join(', '),
                400,
            );
        }

        req.body = value;
        next();
    };
