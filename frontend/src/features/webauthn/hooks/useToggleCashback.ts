import { useState } from 'react';
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleShowGross } from '@/store/prefsSlice';
import { webauthnApi } from '../api/webauthnApi';

/**
 * Gates turning cashback view ON behind a biometric (Face ID/fingerprint/device
 * lock) check via WebAuthn — first use registers this device, later uses just
 * verify. Turning it back OFF never needs verification.
 */
export function useToggleCashback() {
  const dispatch = useAppDispatch();
  const showGross = useAppSelector((state) => state.prefs.showGross);
  const [verifying, setVerifying] = useState(false);

  const toggle = async () => {
    if (showGross) {
      dispatch(toggleShowGross());
      return;
    }

    if (!browserSupportsWebAuthn()) {
      toast.error('Biometric unlock isn’t supported on this device/browser');
      return;
    }

    setVerifying(true);
    try {
      const { registered } = await webauthnApi.getStatus();
      if (!registered) {
        const optionsJSON = await webauthnApi.getRegisterOptions();
        const attResp = await startRegistration({ optionsJSON });
        await webauthnApi.verifyRegistration(attResp);
      } else {
        const optionsJSON = await webauthnApi.getAuthOptions();
        const authResp = await startAuthentication({ optionsJSON });
        await webauthnApi.verifyAuthentication(authResp);
      }
      dispatch(toggleShowGross());
    } catch (err) {
      if ((err as { name?: string })?.name !== 'NotAllowedError') {
        toast.error('Could not verify — cashback view stays hidden');
      }
      // NotAllowedError = user cancelled the prompt; stay silent.
    } finally {
      setVerifying(false);
    }
  };

  return { toggle, verifying };
}
