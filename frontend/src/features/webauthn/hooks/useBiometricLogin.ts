import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { toast } from 'sonner';
import { notifySwToken } from '@/lib/apiClient';
import { webauthnLoginApi } from '../api/webauthnApi';

const NOT_REGISTERED_MESSAGE = 'No biometric device registered yet';

/**
 * Drives the "sign in with fingerprint/Face ID" option on the unlock page.
 * Only ever authenticates against a device registered earlier (from the
 * cashback-toggle flow) — this can't be used to register a brand new device,
 * since that must happen while already logged in. The button always shows
 * (as long as the browser supports WebAuthn at all) — if nothing's
 * registered yet, tapping it just explains that instead of silently hiding.
 */
export function useBiometricLogin() {
  const navigate = useNavigate();
  const [verifying, setVerifying] = useState(false);

  const login = async () => {
    setVerifying(true);
    // Same Render free-tier cold-start concern as the cashback toggle.
    const wakeupTimer = setTimeout(() => {
      toast('Waking up the server — this can take a bit on first use…', { duration: 4000 });
    }, 2500);

    try {
      const requestId = crypto.randomUUID();
      const { options } = await webauthnLoginApi.getChallenge(requestId);
      // Clear right after the actual network round trip — startAuthentication()
      // below just waits on the user's fingerprint prompt, which has nothing to
      // do with the server being slow to wake up.
      clearTimeout(wakeupTimer);
      const authResp = await startAuthentication({ optionsJSON: options });

      const { accessToken } = await webauthnLoginApi.login(requestId, authResp);
      localStorage.setItem('accessToken', accessToken);
      notifySwToken(accessToken);
      navigate('/', { replace: true });
    } catch (err) {
      clearTimeout(wakeupTimer);
      if (axios.isAxiosError(err) && err.response?.data?.message === NOT_REGISTERED_MESSAGE) {
        toast('No fingerprint set up yet — unlock with your access key first', { duration: 3500 });
      } else if (axios.isAxiosError(err) && !err.response) {
        toast.error('No internet — can’t verify right now');
      } else if ((err as { name?: string })?.name !== 'NotAllowedError') {
        toast.error('Fingerprint sign-in failed — use your access key instead');
      }
      // NotAllowedError = user cancelled the prompt; stay silent.
    } finally {
      setVerifying(false);
    }
  };

  return { supported: browserSupportsWebAuthn(), verifying, login };
}
