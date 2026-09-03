import { useToast } from "../../context/ToastContext";

export function ToastContainer() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2" role="status" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => dismiss(toast.id)}
          className={`toast-enter max-w-[400px] cursor-pointer rounded-lg p-3.5 font-sans text-sm leading-relaxed text-white shadow-lg ${toast.isError ? "bg-[#8c3a31]" : "bg-night"}`}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
