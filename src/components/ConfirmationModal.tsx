import { useEffect, useRef } from "react";

export interface ConfirmationModalProps {
  isOpen: boolean;
  /** Judul modal, mis. "Hapus Transaksi?" */
  title: string;
  /** Pesan/deskripsi tambahan */
  description?: string;
  /** Label tombol aksi utama (default: "Ya, Hapus") */
  confirmLabel?: string;
  /** Label tombol batal (default: "Batal") */
  cancelLabel?: string;
  /** Varian warna tombol konfirmasi */
  confirmVariant?: "danger" | "primary";
  /** Apakah ada input konfirmasi teks (untuk aksi super-destruktif) */
  requireTyping?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

import { useState } from "react";

export function ConfirmationModal({
  isOpen,
  title,
  description,
  confirmLabel = "Ya, Hapus",
  cancelLabel = "Batal",
  confirmVariant = "danger",
  requireTyping,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const [typedValue, setTypedValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset typed value setiap kali modal dibuka
  useEffect(() => {
    if (isOpen) {
      setTypedValue("");
      if (requireTyping) {
        // Fokus input setelah animasi masuk (sedikit delay)
        setTimeout(() => inputRef.current?.focus(), 120);
      }
    }
  }, [isOpen, requireTyping]);

  // Tutup modal saat tekan Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isConfirmDisabled = requireTyping
    ? typedValue !== requireTyping
    : false;

  const confirmBtnClass =
    confirmVariant === "danger"
      ? "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
      : "bg-primary text-on-primary hover:bg-primary-container";

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(11, 28, 48, 0.35)", backdropFilter: "blur(2px)" }}
      onClick={(e) => {
        // Tutup saat klik overlay (bukan konten modal)
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      {/* Panel modal */}
      <div
        className="bg-surface-container-lowest rounded-2xl shadow-lg w-full max-w-sm mx-4 overflow-hidden"
        style={{ boxShadow: "0 16px 48px rgba(0,0,0,0.10), 0 4px 16px rgba(0,0,0,0.06)" }}
      >
        {/* Stripe atas berwarna */}
        <div
          className={`h-1 w-full ${confirmVariant === "danger" ? "bg-red-300" : "bg-primary"}`}
        />

        <div className="p-6">
          {/* Ikon + Judul */}
          <div className="flex items-start gap-3 mb-3">
            {confirmVariant === "danger" ? (
              <span
                className="material-symbols-rounded text-red-400 text-2xl mt-0.5 flex-shrink-0"
              >
                delete
              </span>
            ) : (
              <span
                className="material-symbols-rounded text-primary text-2xl mt-0.5 flex-shrink-0"
              >
                info
              </span>
            )}
            <h3 className="text-lg font-bold text-on-surface leading-snug">{title}</h3>
          </div>

          {/* Deskripsi */}
          {description && (
            <p className="text-sm text-on-surface-variant leading-relaxed mb-4 pl-9">
              {description}
            </p>
          )}

          {/* Input konfirmasi teks (untuk aksi paling destruktif) */}
          {requireTyping && (
            <div className="mb-5 pl-9">
              <p className="text-xs text-on-surface-variant mb-2">
                Ketik{" "}
                <span className="font-mono font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                  {requireTyping}
                </span>{" "}
                untuk melanjutkan:
              </p>
              <input
                ref={inputRef}
                type="text"
                value={typedValue}
                onChange={(e) => setTypedValue(e.target.value)}
                className="w-full p-2.5 border border-surface-container-high rounded-xl bg-surface text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-200"
                placeholder={requireTyping}
                autoComplete="off"
              />
            </div>
          )}

          {/* Tombol aksi */}
          <div className="flex gap-3 justify-end mt-2">
            <button
              onClick={onCancel}
              className="px-5 py-2 rounded-full border border-surface-container-high text-sm font-bold text-on-surface-variant hover:bg-surface-container-low transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={isConfirmDisabled}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${confirmBtnClass}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
