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
      // One round trip gets whichever options apply (register vs authenticate),
      // instead of a status check followed by a second call — halves the wait
      // before the biometric prompt appears.
      const challenge = await webauthnApi.getChallenge();

      if (challenge.type === 'register') {
        const attResp = await startRegistration({ optionsJSON: challenge.options });
        // Flip the UI the instant the biometric ceremony itself succeeds, rather
        // than waiting on a further round trip to verify it server-side — that
        // verification still happens, just in the background, and reverts the
        // toggle on the rare chance it fails.
        dispatch(toggleShowGross());
        webauthnApi.verifyRegistration(attResp).catch(() => {
          dispatch(toggleShowGross());
          toast.error('Could not verify — cashback view hidden again');
        });
      } else {
        const authResp = await startAuthentication({ optionsJSON: challenge.options });
        dispatch(toggleShowGross());
        webauthnApi.verifyAuthentication(authResp).catch(() => {
          dispatch(toggleShowGross());
          toast.error('Could not verify — cashback view hidden again');
        });
      }
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
