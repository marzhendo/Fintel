import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { locales, LocaleKey } from "../locales";

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultSourceAccountId?: number | null;
  defaultDestinationAccountId?: number | null;
  defaultGoalId?: number | null;
  onCreateGoalRequested?: () => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultSourceAccountId,
  defaultDestinationAccountId,
  defaultGoalId,
  onCreateGoalRequested,
}) => {
  const { language, accounts, savingGoals } = useStore();
  const t = (k: LocaleKey) => locales[language][k] || k;

  const [fromAccountId, setFromAccountId] = useState<number>(() => {
    if (defaultSourceAccountId) return defaultSourceAccountId;
    // Default to first non-savings account
    const daily = accounts.find((a) => !a.is_savings && !a.is_archived);
    return daily ? daily.id : (accounts[0]?.id ?? 1);
  });

  const [toAccountId, setToAccountId] = useState<number>(() => {
    if (defaultDestinationAccountId) return defaultDestinationAccountId;
    // Default to first savings account if available, or next daily account
    const sav = accounts.find((a) => a.is_savings && !a.is_archived);
    if (sav) return sav.id;
    const otherDaily = accounts.find((a) => !a.is_savings && !a.is_archived && a.id !== fromAccountId);
    return otherDaily ? otherDaily.id : (accounts[1]?.id ?? 1);
  });

  const [amount, setAmount] = useState<string>("");
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(() => defaultGoalId ?? null);
  const [note, setNote] = useState<string>("");
  const [transferDate, setTransferDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const fromAccount = accounts.find((a) => a.id === fromAccountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);

  const isFromSavings = fromAccount?.is_savings ?? false;
  const isToSavings = toAccount?.is_savings ?? false;
  const isSavingsToSavings = isFromSavings && isToSavings;

  // Active goals for destination savings (deposit) or source savings (withdrawal)
  const relevantSavingsAccountId = isToSavings ? toAccountId : isFromSavings ? fromAccountId : null;
  const relevantGoals = savingGoals.filter((g) => g.account_id === relevantSavingsAccountId);

  const numericAmount = parseInt(amount.replace(/[^0-9]/g, ""), 10) || 0;

  // Check overdraw warning for withdrawal
  const selectedGoal = savingGoals.find((g) => g.id === selectedGoalId);
  const isOverdrawingGoal = isFromSavings && selectedGoal && numericAmount > selectedGoal.current_amount;

  const handleAdjustAmount = (delta: number) => {
    const next = Math.max(0, numericAmount + delta);
    setAmount(next > 0 ? next.toString() : "");
  };

  const handleQuickAmount = (val: number) => {
    setAmount(val.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (numericAmount <= 0) {
      setErrorMsg(language === "id" ? "Nominal harus lebih dari Rp 0" : "Amount must be greater than 0");
      return;
    }

    if (fromAccountId === toAccountId) {
      setErrorMsg(language === "id" ? "Akun asal dan akun tujuan tidak boleh sama." : "Source and destination accounts must be different.");
      return;
    }

    if (isSavingsToSavings) {
      setErrorMsg(t("transfer_savings_to_savings_blocked"));
      return;
    }

    if ((isToSavings || isFromSavings) && !selectedGoalId) {
      setErrorMsg(
        isToSavings
          ? t("transfer_goal_for_deposit")
          : t("transfer_goal_for_withdrawal")
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await invoke("create_transfer", {
        fromAccountId,
        toAccountId,
        amount: numericAmount,
        transferDate,
        note: note.trim() || null,
        savingGoalId: (isToSavings || isFromSavings) ? selectedGoalId : null,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(typeof err === "string" ? err : err?.message || "Gagal melakukan transfer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-surface-container-lowest rounded-3xl max-w-lg w-full p-6 shadow-xl border border-surface-container-high my-8 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-surface-container-high">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shadow-xs">
              <span className="material-symbols-rounded text-xl">sync_alt</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">{t("transfer_title")}</h2>
              <p className="text-xs text-on-surface-variant">
                {isToSavings
                  ? t("transfer_history_deposit").replace("{goal}", selectedGoal?.name || "...")
                  : isFromSavings
                  ? t("transfer_history_withdrawal").replace("{goal}", selectedGoal?.name || "...")
                  : t("acc_transfer_btn")}
              </p>
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

        {errorMsg && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <span className="material-symbols-rounded text-base shrink-0">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {isSavingsToSavings && (
          <div className="mt-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
            <span className="material-symbols-rounded text-base shrink-0 text-amber-600">warning</span>
            <span>{t("transfer_savings_to_savings_blocked")}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Akun Asal */}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              {t("transfer_from_account")}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {accounts
                .filter((a) => !a.is_archived)
                .map((acc) => {
                  const isSelected = acc.id === fromAccountId;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setFromAccountId(acc.id);
                        if (acc.id === toAccountId) {
                          // swap or pick another
                          const alt = accounts.find((a) => a.id !== acc.id && !a.is_archived);
                          if (alt) setToAccountId(alt.id);
                        }
                        setSelectedGoalId(null);
                      }}
                      className={`p-2.5 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                        isSelected
                          ? "bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20"
                          : "bg-surface-container-low border-surface-container-high hover:border-outline-variant"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-on-surface truncate">{acc.name}</span>
                        {acc.is_savings && (
                          <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
                            {t("acc_badge_savings")}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-on-surface-variant">
                        Rp {acc.current_balance.toLocaleString("id-ID")}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Icon Divider */}
          <div className="flex items-center justify-center -my-1">
            <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-rounded text-lg">arrow_downward</span>
            </div>
          </div>

          {/* Akun Tujuan */}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              {t("transfer_to_account")}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {accounts
                .filter((a) => !a.is_archived)
                .map((acc) => {
                  const isSelected = acc.id === toAccountId;
                  const isSame = acc.id === fromAccountId;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      disabled={isSame}
                      onClick={() => {
                        setToAccountId(acc.id);
                        setSelectedGoalId(null);
                      }}
                      className={`p-2.5 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                        isSame
                          ? "opacity-40 cursor-not-allowed bg-surface-container"
                          : isSelected
                          ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20"
                          : "bg-surface-container-low border-surface-container-high hover:border-outline-variant"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-on-surface truncate">{acc.name}</span>
                        {acc.is_savings && (
                          <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
                            {t("acc_badge_savings")}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-on-surface-variant">
                        Rp {acc.current_balance.toLocaleString("id-ID")}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Pemilih Target Goal (jika salah satu akun adalah Tabungan) */}
          {(isToSavings || isFromSavings) && !isSavingsToSavings && (
            <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-100">
              <label className="block text-xs font-bold text-purple-950 mb-1.5">
                {isToSavings ? t("transfer_goal_for_deposit") : t("transfer_goal_for_withdrawal")}
              </label>

              {relevantGoals.length === 0 ? (
                <div className="text-xs text-purple-700 flex flex-col gap-2 py-1">
                  <span>{t("transfer_no_goals_in_savings")}</span>
                  {onCreateGoalRequested && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onCreateGoalRequested();
                      }}
                      className="self-start px-3 py-1.5 rounded-xl bg-purple-600 text-white font-bold text-xs shadow-xs hover:bg-purple-700"
                    >
                      {t("transfer_create_goal_btn")}
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {relevantGoals.map((g) => {
                    const isSelected = g.id === selectedGoalId;
                    const pct = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setSelectedGoalId(g.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "bg-purple-100 border-purple-500 ring-2 ring-purple-500/20"
                            : "bg-white/80 border-purple-200 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-purple-950 truncate">{g.name}</span>
                          <span className="text-[10px] font-black text-purple-700">{pct.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-purple-100 h-1.5 rounded-full overflow-hidden mb-1">
                          <div
                            className="bg-purple-600 h-full rounded-full transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-purple-800">
                          Rp {g.current_amount.toLocaleString("id-ID")} / Rp {g.target_amount.toLocaleString("id-ID")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {isOverdrawingGoal && (
                <div className="mt-2 text-[11px] text-amber-800 bg-amber-100/70 p-2 rounded-xl flex items-center gap-1.5">
                  <span className="material-symbols-rounded text-sm shrink-0 text-amber-700">info</span>
                  <span>
                    {t("transfer_soft_warning_overdraw").replace(
                      "{amount}",
                      `Rp ${(selectedGoal?.current_amount || 0).toLocaleString("id-ID")}`
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Nominal */}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
              {t("transfer_amount")}
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant">
                Rp
              </span>
              <input
                type="text"
                value={amount ? parseInt(amount, 10).toLocaleString("id-ID") : ""}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-surface-container-low border border-surface-container-high focus:outline-none focus:border-primary text-base font-bold text-on-surface"
              />
            </div>

            {/* Quick buttons */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[-100000, -50000, 50000, 100000].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleAdjustAmount(d)}
                  className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-surface-container border border-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors"
                >
                  {d > 0 ? `+${d / 1000}k` : `${d / 1000}k`}
                </button>
              ))}
              <div className="h-4 w-px bg-surface-container-high self-center mx-1" />
              {[100000, 500000, 1000000].map((quickVal) => (
                <button
                  key={quickVal}
                  type="button"
                  onClick={() => handleQuickAmount(quickVal)}
                  className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  {quickVal >= 1000000 ? `${quickVal / 1000000}jt` : `${quickVal / 1000}k`}
                </button>
              ))}
            </div>
          </div>

          {/* Tanggal & Catatan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                {t("transfer_date")}
              </label>
              <input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-surface-container-low border border-surface-container-high focus:outline-none focus:border-primary text-xs font-semibold text-on-surface"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                {t("transfer_note")}
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Catatan transfer"
                className="w-full px-3.5 py-2.5 rounded-2xl bg-surface-container-low border border-surface-container-high focus:outline-none focus:border-primary text-xs font-medium text-on-surface"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-container-high">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-2xl border border-surface-container-high text-xs font-bold text-on-surface hover:bg-surface-container transition-colors"
            >
              {t("form_cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isSavingsToSavings || numericAmount <= 0}
              className={`px-6 py-2.5 rounded-2xl text-xs font-bold text-white shadow-xs transition-all ${
                isSubmitting || isSavingsToSavings || numericAmount <= 0
                  ? "bg-slate-300 cursor-not-allowed"
                  : "bg-primary hover:bg-primary/90 hover:shadow-md"
              }`}
            >
              {isSubmitting ? "..." : t("form_save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
