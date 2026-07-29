import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/browser';
import apiClient from '@/lib/apiClient';

const URL = '/webauthn';

export const webauthnApi = {
  async getStatus(): Promise<{ registered: boolean }> {
    const { data } = await apiClient.get(`${URL}/status`);
    return data;
  },

  async getRegisterOptions(deviceName?: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const { data } = await apiClient.post(`${URL}/register-options`, { deviceName });
    return data;
  },

  async verifyRegistration(response: RegistrationResponseJSON, deviceName?: string): Promise<{ verified: boolean }> {
    const { data } = await apiClient.post(`${URL}/register-verify`, { response, deviceName });
    return data;
  },

  async getAuthOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const { data } = await apiClient.post(`${URL}/auth-options`, {});
    return data;
  },

  async verifyAuthentication(response: AuthenticationResponseJSON): Promise<{ verified: boolean }> {
    const { data } = await apiClient.post(`${URL}/auth-verify`, { response });
    return data;
  },
};
