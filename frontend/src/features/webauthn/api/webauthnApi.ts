import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/browser';
import apiClient from '@/lib/apiClient';

const URL = '/webauthn';

export type WebauthnChallenge =
  | { type: 'register'; options: PublicKeyCredentialCreationOptionsJSON }
  | { type: 'authenticate'; options: PublicKeyCredentialRequestOptionsJSON };

export const webauthnApi = {
  async getStatus(): Promise<{ registered: boolean }> {
    const { data } = await apiClient.get(`${URL}/status`);
    return data;
  },

  // Single round trip that returns registration options (no device yet) or
  // authentication options (device already known) — whichever applies.
  // `requestId` lets the backend track this challenge independently of any
  // other in-flight one (e.g. from a prefetch on another page).
  async getChallenge(requestId: string, deviceName?: string): Promise<WebauthnChallenge> {
    const { data } = await apiClient.post(`${URL}/challenge`, { requestId, deviceName });
    return data;
  },

  async verifyRegistration(
    requestId: string,
    response: RegistrationResponseJSON,
    deviceName?: string,
  ): Promise<{ verified: boolean }> {
    const { data } = await apiClient.post(`${URL}/register-verify`, { requestId, response, deviceName });
    return data;
  },

  async verifyAuthentication(requestId: string, response: AuthenticationResponseJSON): Promise<{ verified: boolean }> {
    const { data } = await apiClient.post(`${URL}/auth-verify`, { requestId, response });
    return data;
  },
};
