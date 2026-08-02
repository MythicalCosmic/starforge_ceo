import { useCallback, useEffect, useRef, useState } from 'react';

// Toggle state for a popover that closes on outside interaction, focus departure, or Escape.
export function usePopover(initial = false) {
  const [open, setOpen] = useState(initial);
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const focusFrameRef = useRef(null);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (focusFrameRef.current) {
      cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = null;
    }
    if (restoreFocus) {
      focusFrameRef.current = requestAnimationFrame(() => {
        focusFrameRef.current = null;
        triggerRef.current?.focus();
      });
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) close(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      }
    };
    const onFocus = (e) => {
      if (ref.current && !ref.current.contains(e.target)) close(false);
    };
    const onCloseAll = () => close(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    window.addEventListener('sf-close-popovers', onCloseAll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('sf-close-popovers', onCloseAll);
    };
  }, [close, open]);

  useEffect(
    () => () => {
      if (focusFrameRef.current) cancelAnimationFrame(focusFrameRef.current);
    },
    [],
  );

  return {
    open,
    setOpen,
    close,
    toggle: () => setOpen((value) => !value),
    ref,
    triggerRef,
  };
}
