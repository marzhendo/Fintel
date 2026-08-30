import { useState } from "react";

export type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

const variantStyles: Record<ToastVariant, { bg: string; icon: string; text: string }> = {
  success: {
    bg: "bg-green-50 border border-green-200",
    icon: "check_circle",
    text: "text-green-700",
  },
  error: {
    bg: "bg-red-50 border border-red-200",
    icon: "error",
    text: "text-red-600",
  },
  warning: {
    bg: "bg-yellow-50 border border-yellow-200",
    icon: "warning",
    text: "text-yellow-700",
  },
  info: {
    bg: "bg-surface-container-low border border-surface-container-high",
    icon: "info",
    text: "text-on-surface",
  },
};

export function Toast({ toasts, onDismiss }: ToastProps) {
  return (
    <div className="fixed top-6 right-6 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const style = variantStyles[toast.variant];
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-md text-sm font-medium pointer-events-auto max-w-xs ${style.bg}`}
            style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}
          >
            <span className={`material-symbols-rounded text-[20px] flex-shrink-0 ${style.text}`}>
              {style.icon}
            </span>
            <span className={`flex-1 ${style.text}`}>{toast.message}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              className={`flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity ${style.text}`}
            >
              <span className="material-symbols-rounded text-[16px]">close</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Hook untuk mengelola toast notifications */
let _toastId = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const showToast = (message: string, variant: ToastVariant = "info", duration = 3500) => {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => dismiss(id), duration);
    return id;
  };

  return { toasts, showToast, dismissToast: dismiss };
}
