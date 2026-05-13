import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { isKeyValid } from '../../common/utils/keyValid';
import { ApiError } from '../../common/middlewares/error.middleware';

const ACCESS_EXPIRY = '1d';
const REFRESH_EXPIRY = '7d';

function signAccess() {
    return jwt.sign({ app: 'spendly' }, process.env.JWT_SECRET!, { expiresIn: ACCESS_EXPIRY });
}

function signRefresh() {
    return jwt.sign({ app: 'spendly' }, process.env.REFRESH_SECRET!, { expiresIn: REFRESH_EXPIRY });
}

export class AuthController {
    unlock = (req: Request, res: Response) => {
        const { key } = req.body;

        if (!key || !isKeyValid(key)) {
            throw new ApiError('Invalid access key', 401);
        }

        const accessToken = signAccess();
        const refreshToken = signRefresh();

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'none',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.json({ accessToken });
    };

    refresh = (req: Request, res: Response) => {
        const token = req.cookies?.refreshToken;

        if (!token) {
            throw new ApiError('No refresh token', 401);
        }

        try {
            jwt.verify(token, process.env.REFRESH_SECRET!);
            res.json({ accessToken: signAccess() });
        } catch {
            throw new ApiError('Invalid or expired refresh token', 401);
        }
    };
}
