import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../useTranslation";
import { useStore, Debt } from "../store";

export function Debts(props: any) {
  const { showToast, openConfirm, closeConfirm } = props;
  const { t } = useTranslation();
  const { refreshFlag, triggerRefresh, accounts } = useStore();

  const [allDebts, setAllDebts] = useState<Debt[]>([]);
  const [viewType, setViewType] = useState<"receivable" | "payable">("receivable");

  // Form states
  const [formType, setFormType] = useState<"receivable" | "payable">("receivable");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueMode, setDueMode] = useState<"today" | "tomorrow" | "1week" | "custom" | "none">("none");
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);

  useEffect(() => {
    if (accounts.length > 0 && selectedAccountId === null) {
      const def = accounts.find((a) => a.is_default && !a.is_archived) || accounts.find((a) => !a.is_archived);
      if (def) setSelectedAccountId(def.id);
    }
  }, [accounts, selectedAccountId]);

  const formatDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const handleDueChipClick = (mode: "today" | "tomorrow" | "1week" | "custom") => {
    setDueMode(mode);
    if (mode === "today") {
      setDueDate(formatDate(0));
    } else if (mode === "tomorrow") {
      setDueDate(formatDate(1));
    } else if (mode === "1week") {
      setDueDate(formatDate(7));
    }
  };

  const fetchDebts = async () => {
    try {
      const data = await invoke<Debt[]>("list_debts", { filterType: null, filterStatus: null });
      setAllDebts(data);
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  useEffect(() => {
    fetchDebts();
  }, [viewType, refreshFlag]);

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    try {
      await invoke("create_debt", {
        type: formType,
        counterpartyName: name,
        amount: parseInt(amount, 10),
        description: description || null,
        dueDate: dueDate || null,
        accountId: selectedAccountId,
      });
      setName("");
      setAmount("");
      setDescription("");
      setDueDate("");
      setDueMode("none");
      triggerRefresh();
      showToast("Berhasil ditambahkan", "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const handleMarkPaid = (id: number, counterparty: string) => {
    openConfirm({
      title: t("debts_confirm_paid_title"),
      description: t("debts_confirm_paid_desc") + " (" + counterparty + ")",
      confirmLabel: t("debts_mark_paid"),
      confirmVariant: "primary",
      requireTyping: undefined,
      onConfirm: async () => {
        closeConfirm();
        try {
          await invoke("mark_debt_paid", { id, accountId: selectedAccountId });
          triggerRefresh();
          showToast("Berhasil dilunasi", "success");
        } catch (e) {
          showToast(String(e), "error");
        }
      },
    });
  };

  const displayedDebts = allDebts.filter((d) => d.type === viewType);
  const totalReceivable = allDebts
    .filter((d) => d.type === "receivable" && d.status === "unpaid")
    .reduce((acc, d) => acc + d.amount, 0);
  const totalPayable = allDebts
    .filter((d) => d.type === "payable" && d.status === "unpaid")
    .reduce((acc, d) => acc + d.amount, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-blue-50/80 rounded-3xl shadow-sm p-6 relative overflow-hidden border border-blue-100">
          <div className="absolute top-6 right-6 w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
            <span className="material-symbols-rounded text-blue-700 text-2xl">arrow_upward</span>
          </div>
          <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wider mb-2">
            {t("debts_receivable")} ({t("debts_status_unpaid")})
          </h3>
          <p className="text-3xl font-black text-blue-950 font-mono">
            Rp {totalReceivable.toLocaleString("id-ID")}
          </p>
        </div>

        <div className="bg-rose-50/80 rounded-3xl shadow-sm p-6 relative overflow-hidden border border-rose-100">
          <div className="absolute top-6 right-6 w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center">
            <span className="material-symbols-rounded text-rose-700 text-2xl">arrow_downward</span>
          </div>
          <h3 className="text-sm font-bold text-rose-800 uppercase tracking-wider mb-2">
            {t("debts_payable")} ({t("debts_status_unpaid")})
          </h3>
          <p className="text-3xl font-black text-rose-950 font-mono">
            Rp {totalPayable.toLocaleString("id-ID")}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <h2 className="text-3xl font-bold text-primary">{t("nav_debts")}</h2>

        {/* View Filter: Segmented Button */}
        <div className="inline-flex p-1 bg-surface-container rounded-2xl border border-surface-container-high self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewType("receivable")}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm transition-all ${
              viewType === "receivable"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-rounded text-base">arrow_upward</span>
            {t("debts_receivable")}
          </button>
          <button
            type="button"
            onClick={() => setViewType("payable")}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm transition-all ${
              viewType === "payable"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-rounded text-base">arrow_downward</span>
            {t("debts_payable")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List of Debts */}
        <div className="lg:col-span-2 space-y-4">
          {displayedDebts.length === 0 ? (
            <div className="p-12 text-center text-on-surface-variant bg-surface-container-lowest rounded-3xl border border-surface-container-high shadow-sm">
              <span className="material-symbols-rounded text-4xl mb-2 text-on-surface-variant/50">
                account_balance_wallet
              </span>
              <p className="font-medium text-sm">{t("debts_empty")}</p>
            </div>
          ) : (
            displayedDebts.map((d) => (
              <div
                key={d.id}
                className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm border border-surface-container-high flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow-md transition-shadow"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="font-bold text-base text-on-surface">{d.counterparty_name}</h3>
                    <span
                      className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
                        d.status === "paid"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {d.status === "paid" ? t("debts_status_paid") : t("debts_status_unpaid")}
                    </span>
                  </div>
                  <p className="text-2xl font-black font-mono text-primary mb-1">
                    Rp {d.amount.toLocaleString("id-ID")}
                  </p>
                  {d.description && (
                    <p className="text-xs text-on-surface-variant">{d.description}</p>
                  )}
                  {d.due_date && (
                    <p className="text-xs font-bold text-rose-500 mt-2 flex items-center gap-1">
                      <span className="material-symbols-rounded text-xs">event</span>
                      Due: {d.due_date}
                    </p>
                  )}
                </div>
                {d.status === "unpaid" && (
                  <button
                    onClick={() => handleMarkPaid(d.id, d.counterparty_name)}
                    className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs rounded-xl transition-colors whitespace-nowrap self-start sm:self-center"
                  >
                    {t("debts_mark_paid")}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add Debt Form with Segmented Type & Chips */}
        <div className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm border border-surface-container-high h-fit">
          <h3 className="font-bold text-lg mb-4 text-on-surface">{t("debts_add_new")}</h3>
          <form onSubmit={handleAddDebt} className="space-y-4">
            {/* Segmented Jenis in Form */}
            <div>
              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                {t("form_type")}
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-surface-container rounded-xl">
                <button
                  type="button"
                  onClick={() => setFormType("receivable")}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                    formType === "receivable"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  <span className="material-symbols-rounded text-sm">arrow_upward</span>
                  {t("debts_receivable")}
                </button>
                <button
                  type="button"
                  onClick={() => setFormType("payable")}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                    formType === "payable"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  <span className="material-symbols-rounded text-sm">arrow_downward</span>
                  {t("debts_payable")}
                </button>
              </div>
            </div>

            {/* Nama Orang */}
            <div>
              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                {t("debts_counterparty")}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Misal: Andi, Budi..."
                className="w-full p-2.5 border rounded-xl bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Nominal */}
            <div>
              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                {t("debts_amount")}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface-variant">
                  Rp
                </span>
                <input
                  type="number"
                  required
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full pl-9 pr-3 py-2.5 border rounded-xl bg-surface text-sm font-bold font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            {/* Pilihan Akun / Dompet */}
            {accounts.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  {t("form_account")}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {accounts
                    .filter((a) => !a.is_archived || a.id === selectedAccountId)
                    .map((acc) => {
                      const isSelected = selectedAccountId === acc.id;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => setSelectedAccountId(acc.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            isSelected
                              ? "bg-primary text-on-primary shadow-sm"
                              : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                          }`}
                        >
                          <span className="material-symbols-rounded text-sm">{acc.icon || "account_balance"}</span>
                          <span>{acc.name}</span>
                          <span
                            className={`text-[10px] font-mono font-medium ${
                              isSelected ? "text-on-primary/80" : "text-on-surface-variant"
                            }`}
                          >
                            (Rp {acc.current_balance.toLocaleString("id-ID")})
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Jatuh Tempo (Due Date Chips) */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                  {t("debts_due_date")}
                </label>
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setDueDate("");
                      setDueMode("none");
                    }}
                    className="text-[11px] text-rose-500 font-bold hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <button
                  type="button"
                  onClick={() => handleDueChipClick("today")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    dueMode === "today"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                  }`}
                >
                  {t("debts_due_today")}
                </button>
                <button
                  type="button"
                  onClick={() => handleDueChipClick("tomorrow")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    dueMode === "tomorrow"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                  }`}
                >
                  {t("debts_due_tomorrow")}
                </button>
                <button
                  type="button"
                  onClick={() => handleDueChipClick("1week")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    dueMode === "1week"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                  }`}
                >
                  {t("debts_due_1week")}
                </button>
                <button
                  type="button"
                  onClick={() => handleDueChipClick("custom")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                    dueMode === "custom"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                  }`}
                >
                  <span className="material-symbols-rounded text-xs">event</span>
                  {t("debts_due_pick")}
                </button>
              </div>

              {dueMode === "custom" && (
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full p-2 border rounded-xl bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1"
                />
              )}
            </div>

            {/* Catatan */}
            <div>
              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                {t("debts_description")}
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Misal: Talangin beli buku..."
                className="w-full p-2.5 border rounded-xl bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-primary text-on-primary font-bold rounded-xl mt-3 hover:bg-primary-container hover:text-on-primary-container shadow-sm active:scale-98 transition-all"
            >
              {t("form_save")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
