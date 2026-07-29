import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
    RegistrationResponseJSON,
    AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { AppDataSource } from '../../config/data.source';
import { WebauthnCredential } from './webauthn-credential.entity';
import { ApiError } from '../../common/middlewares/error.middleware';

const RP_NAME = 'Spendly';
// Single-user app — no accounts, so this is a fixed synthetic "owner" identity.
const OWNER_USER_ID = new Uint8Array(Buffer.from('spendly-owner'));

function getRpID(): string {
    if (process.env.WEBAUTHN_RP_ID) return process.env.WEBAUTHN_RP_ID;
    const url = process.env.FRONTEND_URL || 'http://localhost:8081';
    return new URL(url).hostname;
}

function getOrigin(): string {
    return process.env.FRONTEND_URL || 'http://localhost:8081';
}

export class WebauthnService {
    private repo = AppDataSource.getRepository(WebauthnCredential);

    // Transient challenge storage — single-user app, short-lived value between
    // generating options and verifying the response, no need for a DB table.
    private static currentChallenge: string | null = null;

    async getStatus() {
        const count = await this.repo.count();
        return { registered: count > 0 };
    }

    // Combines the "is a device already registered" check with generating the
    // matching options into one round trip, so the browser's biometric prompt
    // appears after a single request instead of two sequential ones.
    async generateChallenge(deviceName?: string) {
        const existing = await this.repo.find();
        if (existing.length === 0) {
            return { type: 'register' as const, options: await this.buildRegistrationOptions(existing, deviceName) };
        }
        return { type: 'authenticate' as const, options: await this.buildAuthenticationOptions(existing) };
    }

    async listDevices() {
        const creds = await this.repo.find({ order: { createdAt: 'DESC' } });
        return creds.map((c) => ({ id: c.id, deviceName: c.deviceName, createdAt: c.createdAt }));
    }

    async deleteDevice(id: string) {
        const cred = await this.repo.findOneBy({ id });
        if (!cred) throw new ApiError('Device not found', 404);
        await this.repo.remove(cred);
    }

    async generateRegistration(deviceName?: string) {
        return this.buildRegistrationOptions(await this.repo.find(), deviceName);
    }

    private async buildRegistrationOptions(existing: WebauthnCredential[], deviceName?: string) {
        const options = await generateRegistrationOptions({
            rpName: RP_NAME,
            rpID: getRpID(),
            userID: OWNER_USER_ID,
            userName: 'owner',
            userDisplayName: deviceName || 'Spendly',
            attestationType: 'none',
            excludeCredentials: existing.map((c) => ({
                id: c.credentialId,
                transports: c.transports as any,
            })),
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'required',
                authenticatorAttachment: 'platform',
            },
        });

        WebauthnService.currentChallenge = options.challenge;
        return options;
    }

    async verifyRegistration(response: RegistrationResponseJSON, deviceName?: string) {
        const expectedChallenge = WebauthnService.currentChallenge;
        if (!expectedChallenge) throw new ApiError('No registration in progress', 400);

        const verification = await verifyRegistrationResponse({
            response,
            expectedChallenge,
            expectedOrigin: getOrigin(),
            expectedRPID: getRpID(),
        });

        WebauthnService.currentChallenge = null;

        if (!verification.verified || !verification.registrationInfo) {
            throw new ApiError('Registration could not be verified', 400);
        }

        const { credential } = verification.registrationInfo;
        const record = this.repo.create({
            credentialId: credential.id,
            publicKey: Buffer.from(credential.publicKey).toString('base64url'),
            counter: String(credential.counter),
            transports: credential.transports || null,
            deviceName: deviceName || 'This device',
        });
        await this.repo.save(record);

        return { verified: true };
    }

    async generateAuthentication() {
        const existing = await this.repo.find();
        if (existing.length === 0) throw new ApiError('No device registered', 400);
        return this.buildAuthenticationOptions(existing);
    }

    private async buildAuthenticationOptions(existing: WebauthnCredential[]) {
        const options = await generateAuthenticationOptions({
            rpID: getRpID(),
            userVerification: 'required',
            allowCredentials: existing.map((c) => ({
                id: c.credentialId,
                transports: c.transports as any,
            })),
        });

        WebauthnService.currentChallenge = options.challenge;
        return options;
    }

    async verifyAuthentication(response: AuthenticationResponseJSON) {
        const expectedChallenge = WebauthnService.currentChallenge;
        if (!expectedChallenge) throw new ApiError('No authentication in progress', 400);

        const cred = await this.repo.findOneBy({ credentialId: response.id });
        if (!cred) throw new ApiError('Unknown credential', 400);

        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge,
            expectedOrigin: getOrigin(),
            expectedRPID: getRpID(),
            credential: {
                id: cred.credentialId,
                publicKey: new Uint8Array(Buffer.from(cred.publicKey, 'base64url')),
                counter: Number(cred.counter),
                transports: cred.transports as any,
            },
        });

        WebauthnService.currentChallenge = null;

        if (!verification.verified) {
            throw new ApiError('Verification failed', 401);
        }

        cred.counter = String(verification.authenticationInfo.newCounter);
        await this.repo.save(cred);

        return { verified: true };
    }
}
