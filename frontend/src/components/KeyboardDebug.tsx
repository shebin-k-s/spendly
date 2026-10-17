import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// TEMPORARY: on-screen log of what the phone reports while the keyboard opens/closes,
// so the sheet's movement can be diagnosed from a screenshot. Remove once fixed.
export function KeyboardDebug({ open }: { open: boolean }) {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const t0 = performance.now();
    const sheet = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
    const push = (msg: string) =>
      setLines((l) => [...l.slice(-19), `${Math.round(performance.now() - t0)} ${msg}`]);
    const snap = () => {
      const r = sheet()?.getBoundingClientRect();
      const vv = window.visualViewport;
      return `ih${window.innerHeight} vv${Math.round(vv?.height ?? 0)}+${Math.round(vv?.offsetTop ?? 0)} top${Math.round(r?.top ?? 0)} h${Math.round(r?.height ?? 0)}`;
    };
    push(`open scr${screen.height} dpr${window.devicePixelRatio} ${snap()}`);

    const onResize = () => push(`RESIZE ${snap()}`);
    const onVvResize = () => push(`vvResize ${snap()}`);
    const onFocusIn = (e: FocusEvent) => push(`FOCUS ${(e.target as HTMLElement)?.tagName} ${snap()}`);
    const onFocusOut = () => push(`blur ${snap()}`);

    // Log the sheet's top whenever it changes, so jumps show up even without events.
    let last = -1;
    let raf = 0;
    const frame = () => {
      const top = Math.round(sheet()?.getBoundingClientRect().top ?? 0);
      if (top !== last) {
        if (last !== -1) push(`move ${last}->${top}`);
        last = top;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onVvResize);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onVvResize);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <pre
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, margin: 0, padding: 4,
        fontSize: 9, lineHeight: 1.15, color: '#0f0', background: 'rgba(0,0,0,0.85)',
        pointerEvents: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      }}
    >
      {lines.join('\n')}
    </pre>,
    document.body,
  );
}
