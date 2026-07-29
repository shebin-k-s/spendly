import { useRef, useState } from 'react';
import axios from 'axios';
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleShowGross } from '@/store/prefsSlice';
import { webauthnApi, type WebauthnChallenge } from '../api/webauthnApi';

/**
 * Gates turning cashback view ON behind a biometric (Face ID/fingerprint/device
 * lock) check via WebAuthn — first use registers this device, later uses just
 * verify. Turning it back OFF never needs verification.
 */
export function useToggleCashback() {
  const dispatch = useAppDispatch();
  const showGross = useAppSelector((state) => state.prefs.showGross);
  const [verifying, setVerifying] = useState(false);
  const prefetchRef = useRef<Promise<WebauthnChallenge> | null>(null);

  // Call this the instant a press starts (before the long-press threshold
  // even fires) — overlaps the challenge fetch with the hold time itself, so
  // by the time the long-press confirms, the network wait is often already
  // done. Not done on page load: the challenge is single-use and short-lived
  // server-side, so prefetching long before the actual gesture would just
  // make it stale or get clobbered by another page's prefetch.
  const prefetchChallenge = () => {
    if (showGross || !navigator.onLine || !browserSupportsWebAuthn()) {
      prefetchRef.current = null;
      return;
    }
    const promise = webauthnApi.getChallenge();
    // If the press is released before the long-press threshold, `toggle()`
    // never awaits this — attach a no-op catch so an unused, later-rejecting
    // prefetch doesn't log as an unhandled rejection. Doesn't affect what
    // `toggle()` itself sees when it does await the same promise.
    promise.catch(() => {});
    prefetchRef.current = promise;
  };

  const toggle = async () => {
    if (showGross) {
      dispatch(toggleShowGross());
      return;
    }

    // WebAuthn always needs a server round trip for the challenge — that's a
    // web-platform constraint (native apps can check biometrics fully offline
    // via their OS's local biometric API; websites only get WebAuthn, which
    // can't). Since this app is offline-first and the cashback data itself
    // isn't gated behind this check anyway, don't block the toggle when
    // there's no connectivity — just skip verification.
    if (!navigator.onLine) {
      prefetchRef.current = null;
      dispatch(toggleShowGross());
      toast('Offline — showing cashback without verification', { duration: 2000 });
      return;
    }

    if (!browserSupportsWebAuthn()) {
      toast.error('Biometric unlock isn’t supported on this device/browser');
      return;
    }

    setVerifying(true);
    try {
      // Reuse the challenge kicked off at press-start if one's in flight,
      // instead of always starting a fresh request here.
      const challenge = await (prefetchRef.current ?? webauthnApi.getChallenge());
      prefetchRef.current = null;

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
      prefetchRef.current = null;
      // navigator.onLine can be wrong (e.g. connected to wifi with no real
      // internet) — if the challenge request itself never got a response,
      // treat it the same as the offline case above rather than blocking.
      if (axios.isAxiosError(err) && !err.response) {
        dispatch(toggleShowGross());
        toast('Offline — showing cashback without verification', { duration: 2000 });
      } else if ((err as { name?: string })?.name !== 'NotAllowedError') {
        toast.error('Could not verify — cashback view stays hidden');
      }
      // NotAllowedError = user cancelled the prompt; stay silent.
    } finally {
      setVerifying(false);
    }
  };

  return { toggle, verifying, prefetchChallenge };
}
