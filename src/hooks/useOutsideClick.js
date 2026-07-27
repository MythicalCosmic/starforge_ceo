import { useCallback, useEffect, useRef, useState } from 'react';

// Toggle state for a popover that closes on outside-click or Escape.
export function usePopover(initial = false) {
  const [open, setOpen] = useState(initial);
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const focusFrameRef = useRef(null);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      if (focusFrameRef.current) cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = requestAnimationFrame(() => triggerRef.current?.focus());
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
    const onCloseAll = () => close(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('sf-close-popovers', onCloseAll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
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
