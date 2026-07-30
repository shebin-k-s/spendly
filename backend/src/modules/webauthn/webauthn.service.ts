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

// How long a prefetched-but-unused challenge stays valid. The frontend can now
// fetch one as early as page mount (not just right before the biometric
// prompt), so this needs real headroom — but still short enough that a
// captured-and-replayed challenge has a tightly bounded window.
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

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

    // Keyed by a client-generated request ID (not a single shared value) so
    // that prefetching from multiple pages, or well before the actual press,
    // doesn't clobber another in-flight challenge.
    private static pendingChallenges = new Map<string, { challenge: string; createdAt: number }>();

    // Credentials change only on register/delete — caching them shaves a DB
    // round trip off the hot path (every challenge request), on top of the
    // unavoidable network round trip to the browser.
    private static credentialsCache: WebauthnCredential[] | null = null;

    private async getCachedCredentials(): Promise<WebauthnCredential[]> {
        if (!WebauthnService.credentialsCache) {
            WebauthnService.credentialsCache = await this.repo.find();
        }
        return WebauthnService.credentialsCache;
    }

    private static pruneExpiredChallenges() {
        const now = Date.now();
        for (const [id, entry] of WebauthnService.pendingChallenges) {
            if (now - entry.createdAt > CHALLENGE_TTL_MS) {
                WebauthnService.pendingChallenges.delete(id);
            }
        }
    }

    private static storeChallenge(requestId: string, challenge: string) {
        WebauthnService.pruneExpiredChallenges();
        WebauthnService.pendingChallenges.set(requestId, { challenge, createdAt: Date.now() });
    }

    private static consumeChallenge(requestId: string): string {
        const entry = WebauthnService.pendingChallenges.get(requestId);
        WebauthnService.pendingChallenges.delete(requestId);
        if (!entry || Date.now() - entry.createdAt > CHALLENGE_TTL_MS) {
            throw new ApiError('Challenge expired — try again', 400);
        }
        return entry.challenge;
    }

    async getStatus() {
        const existing = await this.getCachedCredentials();
        return { registered: existing.length > 0 };
    }

    // Combines the "is a device already registered" check with generating the
    // matching options into one round trip, so the browser's biometric prompt
    // appears after a single request instead of two sequential ones.
    async generateChallenge(requestId: string, deviceName?: string) {
        const existing = await this.getCachedCredentials();
        if (existing.length === 0) {
            return { type: 'register' as const, options: await this.buildRegistrationOptions(requestId, existing, deviceName) };
        }
        return { type: 'authenticate' as const, options: await this.buildAuthenticationOptions(requestId, existing) };
    }

    async listDevices() {
        const creds = await this.repo.find({ order: { createdAt: 'DESC' } });
        return creds.map((c) => ({ id: c.id, deviceName: c.deviceName, createdAt: c.createdAt }));
    }

    async deleteDevice(id: string) {
        const cred = await this.repo.findOneBy({ id });
        if (!cred) throw new ApiError('Device not found', 404);
        await this.repo.remove(cred);
        WebauthnService.credentialsCache = null;
    }

    private async buildRegistrationOptions(requestId: string, existing: WebauthnCredential[], deviceName?: string) {
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

        WebauthnService.storeChallenge(requestId, options.challenge);
        return options;
    }

    async verifyRegistration(requestId: string, response: RegistrationResponseJSON, deviceName?: string) {
        const expectedChallenge = WebauthnService.consumeChallenge(requestId);

        const verification = await verifyRegistrationResponse({
            response,
            expectedChallenge,
            expectedOrigin: getOrigin(),
            expectedRPID: getRpID(),
        });

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
        WebauthnService.credentialsCache = null;

        return { verified: true };
    }

    private async buildAuthenticationOptions(requestId: string, existing: WebauthnCredential[]) {
        const options = await generateAuthenticationOptions({
            rpID: getRpID(),
            userVerification: 'required',
            allowCredentials: existing.map((c) => ({
                id: c.credentialId,
                transports: c.transports as any,
            })),
        });

        WebauthnService.storeChallenge(requestId, options.challenge);
        return options;
    }

    async verifyAuthentication(requestId: string, response: AuthenticationResponseJSON) {
        const expectedChallenge = WebauthnService.consumeChallenge(requestId);

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

        if (!verification.verified) {
            throw new ApiError('Verification failed', 401);
        }

        cred.counter = String(verification.authenticationInfo.newCounter);
        await this.repo.save(cred);

        return { verified: true };
    }
}
