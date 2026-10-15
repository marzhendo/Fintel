import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../useTranslation";
import { useStore, SavingGoal } from "../store";

interface SavingGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingGoal?: SavingGoal | null;
  onSuccess: () => void;
  onNavigateToAccounts?: () => void;
}

const QUICK_GOAL_NAMES = ["Dana Darurat", "Liburan", "Beli Gadget", "Pendidikan", "Kurban", "Rumah Impian"];
const QUICK_AMOUNTS = [1000000, 5000000, 10000000, 20000000, 50000000];

export const SavingGoalModal: React.FC<SavingGoalModalProps> = ({
  isOpen,
  onClose,
  editingGoal,
  onSuccess,
  onNavigateToAccounts,
}) => {
  const { t } = useTranslation();
  const { accounts } = useStore();

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState<number>(0);
  const [targetAmountStr, setTargetAmountStr] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available savings accounts
  const savingsAccounts = accounts.filter((a) => a.is_savings && !a.is_archived);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);

    if (editingGoal) {
      setName(editingGoal.name);
      setTargetAmount(editingGoal.target_amount);
      setTargetAmountStr(editingGoal.target_amount.toLocaleString("id-ID"));
      setTargetDate(editingGoal.target_date || "");
      setSelectedAccountId(editingGoal.account_id);
    } else {
      setName("");
      setTargetAmount(0);
      setTargetAmountStr("");
      setTargetDate("");
      // Default to first savings account
      if (savingsAccounts.length > 0) {
        setSelectedAccountId(savingsAccounts[0].id);
      } else {
        setSelectedAccountId(null);
      }
    }
  }, [isOpen, editingGoal, accounts]);

  if (!isOpen) return null;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) {
      setTargetAmount(0);
      setTargetAmountStr("");
      return;
    }
    const val = parseInt(raw, 10);
    setTargetAmount(val);
    setTargetAmountStr(val.toLocaleString("id-ID"));
  };

  const handleQuickAmount = (val: number) => {
    setTargetAmount(val);
    setTargetAmountStr(val.toLocaleString("id-ID"));
  };

  const handleAdjustAmount = (delta: number) => {
    const next = Math.max(0, targetAmount + delta);
    setTargetAmount(next);
    setTargetAmountStr(next > 0 ? next.toLocaleString("id-ID") : "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage("Nama target tabungan tidak boleh kosong.");
      return;
    }

    if (targetAmount <= 0) {
      setErrorMessage("Target nominal harus lebih besar dari Rp 0.");
      return;
    }

    if (!selectedAccountId) {
      setErrorMessage(t("goal_no_savings_account"));
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingGoal) {
        await invoke("update_saving_goal", {
          id: editingGoal.id,
          name: name.trim(),
          targetAmount,
          targetDate: targetDate ? targetDate : null,
          accountId: selectedAccountId,
        });
      } else {
        await invoke("create_saving_goal", {
          name: name.trim(),
          targetAmount,
          targetDate: targetDate ? targetDate : null,
          accountId: selectedAccountId,
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(typeof err === "string" ? err : err?.message || "Gagal menyimpan target tabungan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-surface-container-lowest rounded-3xl w-full max-w-lg shadow-2xl border border-surface-container-high overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-surface-container-high flex justify-between items-center bg-surface-container/30">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700">
              <span className="material-symbols-rounded text-xl">flag</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-on-surface">
                {editingGoal ? "Edit Target Tabungan" : t("dash_add_goal")}
              </h2>
              <p className="text-xs text-on-surface-variant">Hubungkan target dengan Akun Tabungan</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-rounded text-lg">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-medium flex items-center gap-2">
              <span className="material-symbols-rounded text-base">error</span>
              {errorMessage}
            </div>
          )}

          {/* Nama Target */}
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
              Nama Target
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Dana Darurat, Beli Laptop..."
              className="w-full px-4 py-3 rounded-2xl bg-surface-container/60 border border-surface-container-high text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-surface"
            />
            {/* Quick Name Chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {QUICK_GOAL_NAMES.map((qName) => (
                <button
                  key={qName}
                  type="button"
                  onClick={() => setName(qName)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all ${
                    name === qName
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                  }`}
                >
                  {qName}
                </button>
              ))}
            </div>
          </div>

          {/* Target Nominal */}
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
              Target Nominal
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant">
                Rp
              </span>
              <input
                type="text"
                value={targetAmountStr}
                onChange={handleAmountChange}
                placeholder="0"
                className="w-full pl-12 pr-4 py-3 rounded-2xl bg-surface-container/60 border border-surface-container-high text-lg font-black font-mono text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-surface"
              />
            </div>

            {/* Quick Adjust Buttons */}
            <div className="flex items-center gap-1.5 mt-2">
              <button
                type="button"
                onClick={() => handleAdjustAmount(500000)}
                className="px-2.5 py-1 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
              >
                +500rb
              </button>
              <button
                type="button"
                onClick={() => handleAdjustAmount(1000000)}
                className="px-2.5 py-1 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
              >
                +1jt
              </button>
              <button
                type="button"
                onClick={() => handleAdjustAmount(5000000)}
                className="px-2.5 py-1 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
              >
                +5jt
              </button>
            </div>

            {/* Quick presets */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleQuickAmount(amt)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all ${
                    targetAmount === amt
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                  }`}
                >
                  Rp {(amt / 1000000).toFixed(0)} Jt
                </button>
              ))}
            </div>
          </div>

          {/* Akun Tabungan (Cards / Chips - TANPA DROPDOWN) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-rounded text-sm">savings</span>
                {t("goal_select_savings_account")}
              </label>
              {savingsAccounts.length === 0 && onNavigateToAccounts && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToAccounts();
                  }}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  {t("goal_create_savings_account_btn")}
                </button>
              )}
            </div>

            {savingsAccounts.length === 0 ? (
              <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-center space-y-2">
                <p className="text-xs text-amber-900 font-medium">
                  {t("goal_no_savings_account")}
                </p>
                {onNavigateToAccounts && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToAccounts();
                    }}
                    className="px-4 py-1.5 rounded-full bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 transition-colors"
                  >
                    {t("goal_create_savings_account_btn")}
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {savingsAccounts.map((acc) => {
                  const isSelected = selectedAccountId === acc.id;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setSelectedAccountId(acc.id)}
                      className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-3 ${
                        isSelected
                          ? "bg-blue-50/80 border-blue-500 shadow-xs ring-2 ring-blue-500/20"
                          : "bg-surface-container/40 border-surface-container-high hover:bg-surface-container"
                      }`}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `${acc.color || "#3B82F6"}1a`,
                          color: acc.color || "#3B82F6",
                        }}
                      >
                        <span className="material-symbols-rounded text-lg">
                          {acc.icon || "savings"}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-on-surface truncate">{acc.name}</p>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-700">
                            Tabungan
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-on-surface-variant font-medium">
                          Rp {acc.current_balance.toLocaleString("id-ID")}
                        </p>
                      </div>
                      {isSelected && (
                        <span className="material-symbols-rounded text-blue-600 text-base shrink-0">
                          check_circle
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Target Tanggal (Opsional) */}
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
              Target Tanggal (Opsional)
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl bg-surface-container/60 border border-surface-container-high text-xs font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-surface"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-container-high">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-full text-xs font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || savingsAccounts.length === 0}
              className="px-6 py-2.5 rounded-full text-xs font-bold bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container shadow-sm active:scale-95 transition-all disabled:opacity-50"
            >
              {isSubmitting ? "Menyimpan..." : "Simpan Target"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
