import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleShowGross } from '@/store/prefsSlice';
import { webauthnApi, type WebauthnChallenge } from '../api/webauthnApi';

// How fresh a prefetched challenge needs to be to reuse — comfortably under
// the backend's own 2-minute expiry, so a stale one is never handed to
// startRegistration/startAuthentication only to fail server-side.
const PREFETCH_MAX_AGE_MS = 90 * 1000;
// While the toggle is off, keep a challenge ready in case the user presses —
// re-prefetch periodically so a long-open page doesn't go stale.
const PREFETCH_REFRESH_INTERVAL_MS = 60 * 1000;

interface PendingPrefetch {
  requestId: string;
  promise: Promise<WebauthnChallenge>;
  fetchedAt: number;
}

/**
 * Gates turning cashback view ON behind a biometric (Face ID/fingerprint/device
 * lock) check via WebAuthn — first use registers this device, later uses just
 * verify. Turning it back OFF never needs verification.
 */
export function useToggleCashback() {
  const dispatch = useAppDispatch();
  const showGross = useAppSelector((state) => state.prefs.showGross);
  const [verifying, setVerifying] = useState(false);
  const prefetchRef = useRef<PendingPrefetch | null>(null);

  // Call this the instant a press starts (before the long-press threshold
  // even fires), and also proactively on mount/periodically while the toggle
  // is off — either way it overlaps the challenge fetch with time the user
  // would otherwise spend just looking at the page or holding the press, so
  // by the time they actually confirm, the network wait is often already
  // done. Each prefetch gets its own request ID so an earlier one prefetched
  // from another page (or a previous interval tick) is never clobbered.
  const prefetchChallenge = () => {
    if (showGross || !navigator.onLine || !browserSupportsWebAuthn()) {
      prefetchRef.current = null;
      return;
    }
    // Don't clobber an already-fresh prefetch (e.g. from page mount, or the
    // periodic refresh) just because a press started — that would throw away
    // an already-resolved challenge in favor of a brand new, not-yet-resolved
    // one, defeating the whole point of prefetching ahead of the press.
    const existing = prefetchRef.current;
    if (existing && Date.now() - existing.fetchedAt < PREFETCH_MAX_AGE_MS) {
      return;
    }
    const requestId = crypto.randomUUID();
    const promise = webauthnApi.getChallenge(requestId);
    // If this prefetch never gets used (press released early, or superseded
    // by a fresher one), don't let a later rejection log as unhandled.
    promise.catch(() => {});
    prefetchRef.current = { requestId, promise, fetchedAt: Date.now() };
  };

  useEffect(() => {
    if (showGross) return;
    prefetchChallenge();
    const interval = setInterval(prefetchChallenge, PREFETCH_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGross]);

  const toggle = async () => {
    if (showGross) {
      dispatch(toggleShowGross());
      return;
    }

    // WebAuthn always needs a server round trip for the challenge — that's a
    // web-platform constraint (native apps can check biometrics fully offline
    // via their OS's local biometric API; websites only get WebAuthn, which
    // can't). Verification is a hard requirement here — no connection means
    // no way to prove it's really you, so the toggle simply doesn't happen.
    if (!navigator.onLine) {
      prefetchRef.current = null;
      toast.error('No internet — can’t verify, so cashback view stays hidden');
      return;
    }

    if (!browserSupportsWebAuthn()) {
      toast.error('Biometric unlock isn’t supported on this device/browser');
      return;
    }

    setVerifying(true);
    // If the challenge is taking a while, it's most likely Render's free tier
    // waking a spun-down backend up (can take 30s+) rather than anything
    // actually broken — say so instead of leaving the spinner unexplained.
    const wakeupTimer = setTimeout(() => {
      toast('Waking up the server — this can take a bit on first use…', { duration: 4000 });
    }, 2500);
    try {
      // Reuse a still-fresh prefetch (kicked off at press-start, on mount, or
      // on the periodic refresh) instead of always starting a fresh request.
      const pending = prefetchRef.current;
      const isFresh = pending && Date.now() - pending.fetchedAt < PREFETCH_MAX_AGE_MS;
      const requestId = isFresh ? pending!.requestId : crypto.randomUUID();
      const challenge = isFresh ? await pending!.promise : await webauthnApi.getChallenge(requestId);
      clearTimeout(wakeupTimer);
      prefetchRef.current = null;

      if (challenge.type === 'register') {
        const attResp = await startRegistration({ optionsJSON: challenge.options });
        // Flip the UI the instant the biometric ceremony itself succeeds, rather
        // than waiting on a further round trip to verify it server-side — that
        // verification still happens, just in the background, and reverts the
        // toggle on the rare chance it fails.
        dispatch(toggleShowGross());
        webauthnApi.verifyRegistration(requestId, attResp).catch(() => {
          dispatch(toggleShowGross());
          toast.error('Could not verify — cashback view hidden again');
        });
      } else {
        const authResp = await startAuthentication({ optionsJSON: challenge.options });
        dispatch(toggleShowGross());
        webauthnApi.verifyAuthentication(requestId, authResp).catch(() => {
          dispatch(toggleShowGross());
          toast.error('Could not verify — cashback view hidden again');
        });
      }
    } catch (err) {
      clearTimeout(wakeupTimer);
      prefetchRef.current = null;
      // navigator.onLine can be wrong (e.g. connected to wifi with no real
      // internet) — if the challenge request itself never got a response,
      // treat it the same as the offline case above: no verification, no toggle.
      if (axios.isAxiosError(err) && !err.response) {
        toast.error('No internet — can’t verify, so cashback view stays hidden');
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
