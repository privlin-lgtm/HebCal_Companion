import { useCallback, useRef, useState } from "react";

export type ToastMessage = { id: number; text: string; isError: boolean };

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const counter = useRef(0);

  const showToast = useCallback((text: string, isError = false) => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, text, isError }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showToast, dismiss };
}
