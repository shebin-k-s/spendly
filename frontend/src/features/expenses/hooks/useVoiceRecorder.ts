import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const MAX_SECONDS = 90;

export type RecorderState = 'idle' | 'recording';

/**
 * Microphone recording. start() asks for the mic and begins; stop() resolves
 * the clip through onClip. cancel() (or unmounting) throws the clip away.
 */
export function useVoiceRecorder(onClip: (clip: Blob) => void) {
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRef = useRef(false);
  const onClipRef = useRef(onClip);
  onClipRef.current = onClip;

  const release = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setState('idle');
  }, []);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  const cancel = useCallback(() => {
    discardRef.current = true;
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    else release();
  }, [release]);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Voice recording is not supported on this device');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      discardRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const clip = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const discard = discardRef.current;
        release();
        if (!discard && clip.size > 0) onClipRef.current(clip);
      };
      streamRef.current = stream;
      recorderRef.current = rec;
      rec.start();
      setSeconds(0);
      setState('recording');
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      toast.error('Microphone access was blocked — allow it in your browser settings');
      release();
    }
  }, [release, stop]);

  useEffect(() => () => {
    discardRef.current = true;
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    else release();
  }, [release]);

  return { state, seconds, start, stop, cancel };
}
