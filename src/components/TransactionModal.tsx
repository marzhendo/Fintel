import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../useTranslation";
import { Category, SavingGoal, Transaction, BudgetOverview, Account, useStore } from "../store";
import { getCategoryIcon } from "../utils/categoryIcons";

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTx?: Transaction | null;
  onSave: (data: {
    amount: number;
    type: "income" | "expense";
    categoryId: number;
    note: string;
    date: string;
    savingGoalId: number | null;
    accountId?: number | null;
  }) => Promise<void>;
  categories: Category[];
  savingGoals: SavingGoal[];
  budgetOverview: BudgetOverview | null;
  accounts: Account[];
}

export function TransactionModal({
  isOpen,
  onClose,
  editingTx,
  onSave,
  categories,
  savingGoals,
  budgetOverview,
  accounts,
}: TransactionModalProps) {
  const { t } = useTranslation();
  const { triggerRefresh, language } = useStore();

  // Mode: "expense" | "income" | "savings"
  const [mode, setMode] = useState<"expense" | "income" | "savings">("expense");
  const [selectedGroup, setSelectedGroup] = useState<"fixed" | "wants">("fixed");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [amountStr, setAmountStr] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [dateMode, setDateMode] = useState<"today" | "yesterday" | "custom">("today");
  const [note, setNote] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // Inisialisasi form saat modal terbuka atau editingTx berubah
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);

    if (editingTx) {
      const cat = categories.find((c) => c.id === editingTx.category_id);
      if (editingTx.saving_goal_id) {
        setMode("savings");
        setSelectedGoalId(editingTx.saving_goal_id);
        setSelectedCategoryId(editingTx.category_id);
      } else if (editingTx.transaction_type === "income") {
        setMode("income");
        setSelectedCategoryId(editingTx.category_id);
      } else {
        setMode("expense");
        setSelectedCategoryId(editingTx.category_id);
        if (cat?.group_type === "wants") {
          setSelectedGroup("wants");
        } else {
          setSelectedGroup("fixed");
        }
      }

      setAmount(editingTx.amount);
      setAmountStr(editingTx.amount.toLocaleString("id-ID"));
      setDate(editingTx.transaction_date);
      setNote(editingTx.note || "");
      setSelectedAccountId(editingTx.account_id ?? null);

      const today = getTodayStr();
      const yesterday = getYesterdayStr();
      if (editingTx.transaction_date === today) {
        setDateMode("today");
      } else if (editingTx.transaction_date === yesterday) {
        setDateMode("yesterday");
      } else {
        setDateMode("custom");
      }
    } else {
      // Reset form default
      setMode("expense");
      setSelectedGroup("fixed");
      setSelectedCategoryId(null);
      setSelectedGoalId(null);
      setAmount(0);
      setAmountStr("");
      const today = getTodayStr();
      setDate(today);
      setDateMode("today");
      setNote("");
      // Default to first non-savings account
      const def = accounts.find((a) => a.is_default && !a.is_archived && !a.is_savings) ||
                  accounts.find((a) => !a.is_archived && !a.is_savings);
      setSelectedAccountId(def ? def.id : null);
    }
  }, [isOpen, editingTx, categories, accounts]);

  if (!isOpen) return null;

  // Handle Mode Change
  const handleModeChange = (newMode: "expense" | "income" | "savings") => {
    setMode(newMode);
    setSelectedCategoryId(null);
    setSelectedGoalId(null);
    setErrorMessage(null);

    if (newMode === "savings") {
      // Pick first daily account for source
      const daily = accounts.find((a) => !a.is_savings && !a.is_archived);
      if (daily) setSelectedAccountId(daily.id);
      // Pick first goal if available
      if (savingGoals.length > 0) {
        setSelectedGoalId(savingGoals[0].id);
      }
    } else {
      const def = accounts.find((a) => a.is_default && !a.is_archived && !a.is_savings) ||
                  accounts.find((a) => !a.is_archived && !a.is_savings);
      if (def) setSelectedAccountId(def.id);
    }
  };

  // Handle Quick Nominal Add
  const handleAddNominal = (addValue: number) => {
    const next = (amount || 0) + addValue;
    setAmount(next);
    setAmountStr(next.toLocaleString("id-ID"));
  };

  // Handle Amount Text Input
  const handleAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/\D/g, "");
    if (!rawDigits) {
      setAmount(0);
      setAmountStr("");
      return;
    }
    const val = parseInt(rawDigits, 10);
    setAmount(val);
    setAmountStr(val.toLocaleString("id-ID"));
  };

  // Handle Date Chip Click
  const handleDateModeChange = (modeVal: "today" | "yesterday" | "custom") => {
    setDateMode(modeVal);
    if (modeVal === "today") {
      setDate(getTodayStr());
    } else if (modeVal === "yesterday") {
      setDate(getYesterdayStr());
    }
  };

  // Hitung sisa jatah per kategori dari budgetOverview
  const getCategoryRemainingInfo = (catId: number): { period: "weekly" | "monthly"; remaining: number } | null => {
    if (!budgetOverview) return null;
    const all = [
      ...budgetOverview.fixed.categories,
      ...budgetOverview.wants.categories,
      ...budgetOverview.savings.categories,
    ];
    const item = all.find((c) => c.category_id === catId);
    if (!item || item.effective_limit === 0) return null;
    return {
      period: item.period,
      remaining: item.remaining,
    };
  };

  // Validasi form
  const isFormValid =
    amount > 0 &&
    date.trim() !== "" &&
    ((mode === "savings" && selectedGoalId !== null && selectedAccountId !== null) ||
      (mode !== "savings" && selectedCategoryId !== null));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      if (mode === "savings") {
        const goal = savingGoals.find((g) => g.id === selectedGoalId);
        if (!goal || !goal.account_id) {
          setErrorMessage("Target goal yang dipilih belum terhubung ke Akun Tabungan.");
          return;
        }

        await invoke("create_transfer", {
          fromAccountId: selectedAccountId,
          toAccountId: goal.account_id,
          amount,
          transferDate: date,
          note: note.trim() || null,
          savingGoalId: selectedGoalId,
        });

        triggerRefresh();
        onClose();
        return;
      }

      const targetType = mode === "income" ? "income" : "expense";
      await onSave({
        amount,
        type: targetType,
        categoryId: selectedCategoryId!,
        note,
        date,
        savingGoalId: null,
        accountId: selectedAccountId,
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(typeof err === "string" ? err : err?.message || "Gagal menyimpan transaksi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Kategori yang difilter sesuai mode & group
  // Sembunyikan kategori bawaan "Tabungan" / "Investasi" dari picker kategori expense
  const filteredCategories = categories.filter((c) => {
    if (mode === "expense") {
      return (
        c.transaction_type === "expense" &&
        c.group_type === selectedGroup &&
        c.name !== "Tabungan" &&
        c.name !== "Investasi"
      );
    }
    if (mode === "income") {
      return c.transaction_type === "income";
    }
    return false;
  });

  // Untuk mode Tabungan: Akun asal hanya akun Harian (bukan tabungan)
  const availableAccounts = mode === "savings"
    ? accounts.filter((a) => !a.is_savings && !a.is_archived)
    : accounts.filter((a) => !a.is_archived || a.id === selectedAccountId);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-surface-container-lowest rounded-3xl w-full max-w-lg shadow-2xl border border-surface-container-high overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header Modal */}
        <div className="px-6 py-5 border-b border-surface-container-high flex justify-between items-center bg-surface-container/30">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-rounded text-xl">
                {editingTx ? "edit_note" : mode === "savings" ? "savings" : "add_circle"}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-on-surface">
                {editingTx
                  ? t("form_edit_tx")
                  : mode === "savings"
                  ? `${t("form_type_savings")} (Shortcut)`
                  : t("tx_new_transaction")}
              </h2>
              {mode === "savings" && (
                <p className="text-xs text-on-surface-variant">Dari Harian → Goal Tabungan</p>
              )}
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

        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <span className="material-symbols-rounded text-base shrink-0">error</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* STEP 1: Segmented Control Tipe Transaksi */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              1. {t("form_type")}
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-surface-container-low rounded-2xl border border-surface-container-high">
              <button
                type="button"
                onClick={() => handleModeChange("expense")}
                className={`flex flex-col sm:flex-row items-center justify-center gap-2 py-3 px-2 rounded-xl font-bold text-sm transition-all ${
                  mode === "expense"
                    ? "bg-rose-600 text-white shadow-sm shadow-rose-600/20"
                    : "text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                <span className="material-symbols-rounded text-lg">trending_down</span>
                <span>{t("form_type_expense")}</span>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange("income")}
                className={`flex flex-col sm:flex-row items-center justify-center gap-2 py-3 px-2 rounded-xl font-bold text-sm transition-all ${
                  mode === "income"
                    ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20"
                    : "text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                <span className="material-symbols-rounded text-lg">trending_up</span>
                <span>{t("form_type_income")}</span>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange("savings")}
                className={`flex flex-col sm:flex-row items-center justify-center gap-2 py-3 px-2 rounded-xl font-bold text-sm transition-all ${
                  mode === "savings"
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                    : "text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                <span className="material-symbols-rounded text-lg">savings</span>
                <span>{t("form_type_savings")}</span>
              </button>
            </div>
          </div>

          {/* MODE TABUNGAN SHORTCUT FLOW: Dari (Harian) -> Kartu Goal -> Nominal -> Tanggal -> Catatan */}
          {mode === "savings" ? (
            <>
              {/* Step 2A: Dari (Akun Harian) */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                  2. {language === "id" ? "Dari (Akun Harian)" : "From (Daily Account)"}
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableAccounts.map((acc) => {
                    const isSelected = selectedAccountId === acc.id;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => setSelectedAccountId(acc.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                          isSelected
                            ? "bg-primary text-on-primary shadow-sm ring-2 ring-primary/40 scale-[1.02]"
                            : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: acc.color || "#10B981" }}
                        />
                        <span className="truncate">{acc.name}</span>
                        <span className="text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">
                          Rp {acc.current_balance.toLocaleString("id-ID")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2B: Kartu Goal (Otomatis mengisi Akun Tabungan tujuan) */}
              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                  3. {t("form_select_goal_title")}
                </label>
                {savingGoals.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 text-xs text-blue-800 text-center">
                    Belum ada target tabungan. Tambahkan target di Dashboard terlebih dahulu.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                    {savingGoals.map((goal) => {
                      const isSelected = selectedGoalId === goal.id;
                      const pct = Math.min((goal.current_amount / goal.target_amount) * 100, 100);

                      return (
                        <button
                          key={goal.id}
                          type="button"
                          onClick={() => setSelectedGoalId(goal.id)}
                          className={`p-3 rounded-2xl border text-left transition-all relative ${
                            isSelected
                              ? "bg-blue-50 border-2 border-blue-500 shadow-sm ring-2 ring-blue-500/20"
                              : "bg-surface-container hover:bg-surface-container-high border-surface-container-high"
                          }`}
                        >
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="font-bold text-xs truncate max-w-[120px]">{goal.name}</span>
                            <span className="text-[11px] font-black text-blue-600">{pct.toFixed(0)}%</span>
                          </div>
                          {goal.account_name && (
                            <div className="mb-1.5">
                              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
                                {goal.account_name}
                              </span>
                            </div>
                          )}
                          <div className="w-full bg-blue-100 rounded-full h-1.5 mb-2 overflow-hidden">
                            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                          </div>
                          <div className="flex justify-between text-[10px] text-on-surface-variant">
                            <span>Rp {goal.current_amount.toLocaleString("id-ID")}</span>
                            <span>/ Rp {goal.target_amount.toLocaleString("id-ID")}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* STEP 2: Grup (Untuk Pengeluaran) & Kategori Cards */}
              {mode === "expense" && (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                    2. {t("form_group")} & {t("form_category")}
                  </label>

                  {/* Grup Chips (Bulanan Tetap / Keinginan) */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGroup("fixed");
                        setSelectedCategoryId(null);
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs transition-all ${
                        selectedGroup === "fixed"
                          ? "bg-rose-100 text-rose-900 border-2 border-rose-400"
                          : "bg-surface-container hover:bg-surface-container-high text-on-surface border-2 border-transparent"
                      }`}
                    >
                      <span className="material-symbols-rounded text-sm">home</span>
                      {t("form_group_fixed")}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGroup("wants");
                        setSelectedCategoryId(null);
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs transition-all ${
                        selectedGroup === "wants"
                          ? "bg-amber-100 text-amber-900 border-2 border-amber-400"
                          : "bg-surface-container hover:bg-surface-container-high text-on-surface border-2 border-transparent"
                      }`}
                    >
                      <span className="material-symbols-rounded text-sm">shopping_cart</span>
                      {t("form_group_wants")}
                    </button>
                  </div>

                  {/* Chips Kategori */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {filteredCategories.map((cat) => {
                      const isSelected = selectedCategoryId === cat.id;
                      const remainingInfo = getCategoryRemainingInfo(cat.id);
                      const icon = getCategoryIcon(cat.name, cat.group_type);

                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategoryId(cat.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left ${
                            isSelected
                              ? "bg-primary text-on-primary shadow-sm scale-[1.02]"
                              : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                          }`}
                        >
                          <span className="material-symbols-rounded text-base">{icon}</span>
                          <span>{cat.name}</span>
                          {remainingInfo !== null && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                isSelected
                                  ? "bg-white/20 text-white"
                                  : remainingInfo.remaining >= 0
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {remainingInfo.remaining >= 0
                                ? `${remainingInfo.period === "weekly" ? t("form_remaining_this_week") : t("form_remaining_this_month")} Rp${remainingInfo.remaining.toLocaleString("id-ID")}`
                                : `${t("form_category_over")} Rp${Math.abs(remainingInfo.remaining).toLocaleString("id-ID")}`}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {mode === "income" && (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                    2. {t("form_category")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {filteredCategories.map((cat) => {
                      const isSelected = selectedCategoryId === cat.id;
                      const icon = getCategoryIcon(cat.name, cat.group_type);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategoryId(cat.id)}
                          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                            isSelected
                              ? "bg-emerald-600 text-white shadow-sm scale-[1.02]"
                              : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                          }`}
                        >
                          <span className="material-symbols-rounded text-base">{icon}</span>
                          <span>{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 3: Pilih Akun / Dompet */}
              {availableAccounts.length > 0 && (
                <div className="space-y-2.5">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                    3. {t("form_account")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableAccounts.map((acc) => {
                      const isSelected = selectedAccountId === acc.id;
                      const isNeg = acc.current_balance < 0;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => setSelectedAccountId(acc.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all max-w-full ${
                            isSelected
                              ? "bg-primary text-on-primary shadow-sm ring-2 ring-primary/40 scale-[1.02]"
                              : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: acc.color || "#10B981" }}
                          />
                          <span className="truncate">{acc.name}</span>
                          <span
                            className={`text-[11px] font-mono font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
                              isSelected
                                ? "bg-black/20 text-white"
                                : isNeg
                                ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                : "bg-surface-container-highest text-on-surface-variant"
                            }`}
                          >
                            Rp {acc.current_balance.toLocaleString("id-ID")}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Soft warning jika pengeluaran melebihi saldo akun */}
                  {(() => {
                    if (mode === "expense" && selectedAccountId && amount > 0) {
                      const acc = accounts.find((a) => a.id === selectedAccountId);
                      if (acc && amount > acc.current_balance) {
                        return (
                          <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200 animate-in fade-in duration-150">
                            <span className="material-symbols-rounded text-base text-amber-600 dark:text-amber-400 flex-shrink-0">
                              warning
                            </span>
                            <span>
                              Pengeluaran (Rp {amount.toLocaleString("id-ID")}) melebihi saldo akun{" "}
                              <strong>{acc.name}</strong> saat ini (Rp {acc.current_balance.toLocaleString("id-ID")}). Tetap dapat disimpan.
                            </span>
                          </div>
                        );
                      }
                    }
                    return null;
                  })()}
                </div>
              )}
            </>
          )}

          {/* Nominal Input & Tombol Cepat */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              {mode === "savings" ? "4. " : "4. "}{t("tx_amount")}
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-lg text-on-surface-variant">
                Rp
              </span>
              <input
                type="text"
                value={amountStr}
                onChange={handleAmountInputChange}
                placeholder="0"
                className="w-full pl-12 pr-4 py-3.5 bg-surface-container-low border border-surface-container-high rounded-2xl font-black text-2xl text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-on-surface-variant/40"
              />
            </div>

            {/* Quick Chips Nominal (+5k, +10k, +20k, +50k, +100k) */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[5000, 10000, 20000, 50000, 100000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleAddNominal(val)}
                  className="px-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
                >
                  +{val >= 1000 ? `${val / 1000}k` : val}
                </button>
              ))}
              {amount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setAmount(0);
                    setAmountStr("");
                  }}
                  className="px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold transition-colors ml-auto"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Tanggal Chips & Custom Picker */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              5. {t("form_date")}
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDateModeChange("today")}
                className={`px-4 py-2 rounded-full font-bold text-xs transition-all ${
                  dateMode === "today"
                    ? "bg-primary text-on-primary shadow-sm"
                    : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                }`}
              >
                {t("form_date_today")}
              </button>

              <button
                type="button"
                onClick={() => handleDateModeChange("yesterday")}
                className={`px-4 py-2 rounded-full font-bold text-xs transition-all ${
                  dateMode === "yesterday"
                    ? "bg-primary text-on-primary shadow-sm"
                    : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                }`}
              >
                {t("form_date_yesterday")}
              </button>

              <button
                type="button"
                onClick={() => handleDateModeChange("custom")}
                className={`px-4 py-2 rounded-full font-bold text-xs transition-all ${
                  dateMode === "custom"
                    ? "bg-primary text-on-primary shadow-sm"
                    : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                }`}
              >
                {t("form_date_pick")}
              </button>
            </div>

            {dateMode === "custom" && (
              <div className="pt-2 animate-in fade-in duration-150">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-surface-container-low border border-surface-container-high rounded-xl text-sm font-semibold text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
            )}
          </div>

          {/* Catatan (Opsional) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              6. {t("form_note")}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Misal: Makan Siang / Gaji Freelance"
              className="w-full px-4 py-2.5 bg-surface-container-low border border-surface-container-high rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/40"
            />
          </div>

          {/* Action Footer */}
          <div className="pt-4 border-t border-surface-container-high flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-full font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              {t("form_cancel")}
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className={`px-6 py-2.5 rounded-full font-bold text-sm shadow-md transition-all ${
                isFormValid && !isSubmitting
                  ? "bg-primary text-on-primary hover:bg-primary/90 hover:scale-[1.02]"
                  : "bg-surface-container-high text-on-surface-variant/40 cursor-not-allowed shadow-none"
              }`}
            >
              {isSubmitting ? "..." : t("form_save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
