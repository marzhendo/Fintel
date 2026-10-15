import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../useTranslation";
import { useStore, Account } from "../store";
import { ConfirmationModal } from "./ConfirmationModal";
import { TransferModal } from "./TransferModal";

interface AccountsProps {
  showToast: (msg: string, type?: "success" | "error" | "warning") => void;
  onCreateGoalRequested?: () => void;
}

const QUICK_NAMES = [
  { name: "BCA", type: "bank" as const, color: "#2563EB", icon: "account_balance" },
  { name: "BRI", type: "bank" as const, color: "#1D4ED8", icon: "account_balance" },
  { name: "BNI", type: "bank" as const, color: "#F97316", icon: "account_balance" },
  { name: "Mandiri", type: "bank" as const, color: "#0284C7", icon: "account_balance" },
  { name: "SeaBank", type: "bank" as const, color: "#EA580C", icon: "account_balance" },
  { name: "GoPay", type: "ewallet" as const, color: "#06B6D4", icon: "smartphone" },
  { name: "OVO", type: "ewallet" as const, color: "#7C3AED", icon: "smartphone" },
  { name: "DANA", type: "ewallet" as const, color: "#3B82F6", icon: "smartphone" },
  { name: "ShopeePay", type: "ewallet" as const, color: "#EE4D2D", icon: "smartphone" },
];

const QUICK_AMOUNTS = [0, 50000, 100000, 500000, 1000000, 2000000, 5000000];

export const Accounts: React.FC<AccountsProps> = ({ showToast, onCreateGoalRequested }) => {
  const { t } = useTranslation();
  const { accounts, setAccounts, savingGoals, triggerRefresh, refreshFlag } = useStore();

  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferDefaultSourceId, setTransferDefaultSourceId] = useState<number | null>(null);

  // Form states for Add / Edit
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"cash" | "bank" | "ewallet">("bank");
  const [formIsSavings, setFormIsSavings] = useState(false);
  const [formOpeningBalance, setFormOpeningBalance] = useState<number>(0);
  const [formIcon, setFormIcon] = useState("account_balance");
  const [formColor, setFormColor] = useState("#10B981");
  const [formIsDefault, setFormIsDefault] = useState(false);

  // Confirmation Modal states
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    confirmVariant?: "danger" | "primary";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    onConfirm: () => {},
  });

  const loadAccounts = async () => {
    setIsLoading(true);
    try {
      const data: Account[] = await invoke("list_accounts", { includeArchived: true });
      setAccounts(data);
    } catch (e) {
      showToast("Gagal memuat akun: " + String(e), "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, [refreshFlag]);

  const openAddModal = () => {
    setFormName("");
    setFormType("bank");
    setFormIsSavings(false);
    setFormOpeningBalance(0);
    setFormIcon("account_balance");
    setFormColor("#3B82F6");
    setFormIsDefault(accounts.length === 0);
    setShowAddModal(true);
  };

  const openEditModal = (acc: Account) => {
    setEditingAccount(acc);
    setFormName(acc.name);
    setFormType(
      acc.account_type === "cash" || acc.account_type === "bank" || acc.account_type === "ewallet"
        ? (acc.account_type as any)
        : "bank"
    );
    setFormIsSavings(acc.is_savings);
    setFormOpeningBalance(acc.opening_balance);
    setFormIcon(acc.icon || "account_balance");
    setFormColor(acc.color || "#10B981");
    setFormIsDefault(acc.is_default);
  };

  const handleSelectQuickName = (item: (typeof QUICK_NAMES)[0]) => {
    setFormName(item.name);
    setFormType(item.type);
    setFormColor(item.color);
    setFormIcon(item.icon);
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast(t("acc_name") + " tidak boleh kosong", "warning");
      return;
    }

    try {
      await invoke("create_account", {
        name: formName.trim(),
        accountType: formType,
        openingBalance: formOpeningBalance,
        icon: formIcon,
        color: formColor,
        isDefault: formIsDefault,
        isSavings: formIsSavings,
      });
      showToast("Akun berhasil ditambahkan!", "success");
      setShowAddModal(false);
      triggerRefresh();
    } catch (err) {
      showToast("Gagal menambahkan akun: " + String(err), "error");
    }
  };

  const performUpdate = async () => {
    if (!editingAccount) return;
    try {
      await invoke("update_account", {
        id: editingAccount.id,
        name: formName.trim(),
        accountType: formType,
        openingBalance: formOpeningBalance,
        icon: formIcon,
        color: formColor,
        isSavings: formIsSavings,
      });

      if (formIsDefault && !editingAccount.is_default) {
        await invoke("set_default_account", { id: editingAccount.id });
      }

      showToast("Akun berhasil diperbarui!", "success");
      setEditingAccount(null);
      triggerRefresh();
    } catch (err) {
      showToast("Gagal memperbarui akun: " + String(err), "error");
    }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    if (!formName.trim()) {
      showToast(t("acc_name") + " tidak boleh kosong", "warning");
      return;
    }

    // Jika saldo awal diubah, wajib konfirmasi dulu
    if (formOpeningBalance !== editingAccount.opening_balance) {
      setConfirmState({
        isOpen: true,
        title: t("acc_confirm_change_balance_title"),
        description: t("acc_confirm_change_balance_desc"),
        confirmLabel: "Lanjutkan Simpan",
        confirmVariant: "primary",
        onConfirm: () => {
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
          performUpdate();
        },
      });
    } else {
      performUpdate();
    }
  };

  const handleSetDefault = async (acc: Account) => {
    try {
      await invoke("set_default_account", { id: acc.id });
      showToast(`Akun "${acc.name}" dijadikan akun utama.`, "success");
      triggerRefresh();
    } catch (err) {
      showToast("Gagal mengubah akun utama: " + String(err), "error");
    }
  };

  const handleArchive = (acc: Account) => {
    if (acc.current_balance !== 0) {
      showToast(t("acc_archive_error_balance"), "warning");
      return;
    }

    setConfirmState({
      isOpen: true,
      title: t("acc_archive_confirm_title"),
      description: t("acc_archive_confirm_desc"),
      confirmLabel: t("acc_archive"),
      confirmVariant: "danger",
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        try {
          await invoke("archive_account", { id: acc.id });
          showToast(`Akun "${acc.name}" telah diarsipkan.`, "success");
          triggerRefresh();
        } catch (err) {
          showToast("Gagal mengarsipkan akun: " + String(err), "error");
        }
      },
    });
  };

  const handleUnarchive = async (acc: Account) => {
    try {
      await invoke("unarchive_account", { id: acc.id });
      showToast(`Akun "${acc.name}" telah diaktifkan kembali.`, "success");
      triggerRefresh();
    } catch (err) {
      showToast("Gagal membatalkan arsip: " + String(err), "error");
    }
  };

  const activeAccounts = accounts.filter((a) => !a.is_archived);
  const archivedAccounts = accounts.filter((a) => a.is_archived);

  const getAccountTypeLabel = (type: string) => {
    if (type === "cash") return t("acc_type_cash");
    if (type === "bank") return t("acc_type_bank");
    if (type === "ewallet") return t("acc_type_ewallet");
    return type;
  };

  const getAccountIconDefault = (type: string) => {
    if (type === "cash") return "payments";
    if (type === "bank") return "account_balance";
    if (type === "ewallet") return "smartphone";
    return "account_balance_wallet";
  };

  // Editing account connected goals check
  const editingConnectedGoals = editingAccount
    ? savingGoals.filter((g) => g.account_id === editingAccount.id)
    : [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-container-lowest p-6 rounded-3xl border border-surface-container-high/60 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-on-surface tracking-tight flex items-center gap-2">
            <span className="material-symbols-rounded text-primary text-3xl">account_balance</span>
            {t("acc_title")}
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">{t("acc_subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setTransferDefaultSourceId(null);
              setIsTransferModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold text-sm shadow-xs hover:bg-indigo-100 transition-all active:scale-95"
          >
            <span className="material-symbols-rounded text-lg">sync_alt</span>
            <span>{t("acc_transfer_btn")}</span>
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-primary text-on-primary font-semibold text-sm shadow hover:bg-primary/90 transition-all active:scale-95"
          >
            <span className="material-symbols-rounded text-lg">add</span>
            <span>{t("acc_add_btn").replace(/^\+\s*/, "")}</span>
          </button>
        </div>
      </div>

      {/* Active Accounts Grid */}
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant mb-4 px-1">
          {t("acc_title")} ({activeAccounts.length})
        </h3>
        {isLoading && accounts.length === 0 ? (
          <div className="p-12 text-center text-on-surface-variant">Memuat data akun...</div>
        ) : activeAccounts.length === 0 ? (
          <div className="p-12 text-center text-on-surface-variant bg-surface-container-lowest rounded-3xl border border-dashed border-outline-variant">
            {t("dash_no_accounts")}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeAccounts.map((acc) => {
              const iconName = acc.icon || getAccountIconDefault(acc.account_type);
              const isNegative = acc.current_balance < 0;
              const connectedGoals = savingGoals.filter((g) => g.account_id === acc.id);

              return (
                <div
                  key={acc.id}
                  className={`bg-surface-container-lowest p-5 rounded-3xl border shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
                    acc.is_savings
                      ? "border-indigo-200 bg-indigo-50/20"
                      : "border-surface-container-high/60"
                  }`}
                >
                  <div>
                    {/* Card Top: Icon, Name, Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-white shadow-sm"
                          style={{ backgroundColor: acc.color || (acc.is_savings ? "#6366f1" : "#10B981") }}
                        >
                          <span className="material-symbols-rounded text-xl">
                            {acc.is_savings ? "savings" : iconName}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-base text-on-surface truncate">{acc.name}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                              {getAccountTypeLabel(acc.account_type)}
                            </span>
                            {acc.is_savings ? (
                              <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                                {t("acc_badge_savings")}
                              </span>
                            ) : (
                              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {t("acc_badge_daily")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Default Badge */}
                      {acc.is_default && (
                        <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <span className="material-symbols-rounded text-xs">star</span>
                          {t("acc_default")}
                        </span>
                      )}
                    </div>

                    {/* Card Body: Balance */}
                    <div className="mt-5 pt-3 border-t border-surface-container-high/40">
                      <p className="text-xs text-on-surface-variant font-medium">{t("acc_current_balance")}</p>
                      <p
                        className={`text-xl font-bold tracking-tight mt-0.5 ${
                          isNegative ? "text-error" : "text-on-surface"
                        }`}
                      >
                        Rp {acc.current_balance.toLocaleString("id-ID")}
                      </p>
                      {acc.opening_balance !== 0 && (
                        <p className="text-[11px] text-on-surface-variant/70 mt-0.5">
                          {t("acc_opening_balance")}: Rp {acc.opening_balance.toLocaleString("id-ID")}
                        </p>
                      )}
                    </div>

                    {/* Akun Tabungan: Daftar Goals Terhubung */}
                    {acc.is_savings && (
                      <div className="mt-4 pt-3 border-t border-indigo-100/80">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-indigo-950 flex items-center gap-1">
                            <span className="material-symbols-rounded text-sm">flag</span>
                            {t("acc_connected_goals")} ({connectedGoals.length})
                          </span>
                        </div>
                        {connectedGoals.length === 0 ? (
                          <p className="text-[11px] text-on-surface-variant italic">
                            {t("acc_no_goals")}
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {connectedGoals.map((g) => {
                              const pct = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
                              return (
                                <div key={g.id} className="bg-white/80 p-2 rounded-xl border border-indigo-100 text-xs">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="font-semibold text-on-surface truncate">{g.name}</span>
                                    <span className="text-[10px] font-bold text-indigo-700">{pct.toFixed(0)}%</span>
                                  </div>
                                  <div className="w-full bg-indigo-100 h-1.5 rounded-full overflow-hidden">
                                    <div
                                      className="bg-indigo-600 h-full rounded-full transition-all"
                                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                                    />
                                  </div>
                                  <div className="flex justify-between text-[10px] text-on-surface-variant mt-1">
                                    <span>Rp {g.current_amount.toLocaleString("id-ID")}</span>
                                    <span>Rp {g.target_amount.toLocaleString("id-ID")}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Bottom Actions */}
                  <div className="mt-5 pt-3 border-t border-surface-container-high/40 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(acc)}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors"
                      >
                        {t("acc_edit")}
                      </button>
                      <button
                        onClick={() => {
                          setTransferDefaultSourceId(acc.id);
                          setIsTransferModalOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-full text-xs font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
                      >
                        {t("acc_transfer_btn")}
                      </button>
                      {!acc.is_default && !acc.is_savings && (
                        <button
                          onClick={() => handleSetDefault(acc)}
                          className="px-3 py-1.5 rounded-full text-xs font-medium text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          {t("acc_set_default")}
                        </button>
                      )}
                    </div>

                    {!acc.is_default && (
                      <button
                        onClick={() => handleArchive(acc)}
                        title={acc.current_balance !== 0 ? t("acc_archive_error_balance") : t("acc_archive")}
                        className={`p-1.5 rounded-full text-on-surface-variant transition-colors ${
                          acc.current_balance === 0
                            ? "hover:bg-error/10 hover:text-error cursor-pointer"
                            : "opacity-40 cursor-not-allowed"
                        }`}
                      >
                        <span className="material-symbols-rounded text-base">archive</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Archived Accounts Section */}
      {archivedAccounts.length > 0 && (
        <div className="pt-6 border-t border-surface-container-high/60">
          <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant mb-4 px-1">
            {t("acc_archived")} ({archivedAccounts.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-75">
            {archivedAccounts.map((acc) => (
              <div
                key={acc.id}
                className="bg-surface-container-lowest p-4 rounded-3xl border border-surface-container-high/40 shadow-none flex items-center justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-surface-container text-on-surface-variant">
                    <span className="material-symbols-rounded text-lg">archive</span>
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm text-on-surface truncate">{acc.name}</h4>
                    <p className="text-xs text-on-surface-variant">
                      Rp {acc.current_balance.toLocaleString("id-ID")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleUnarchive(acc)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-surface-container text-primary hover:bg-primary/10 transition-colors"
                >
                  {t("acc_unarchive")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest w-full max-w-md rounded-3xl p-6 shadow-2xl border border-surface-container-high animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-on-surface">{t("acc_add_btn")}</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant"
              >
                <span className="material-symbols-rounded text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="space-y-4">
              {/* Quick Names Chips */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-2">
                  {t("acc_quick_names")}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_NAMES.map((q) => (
                    <button
                      key={q.name}
                      type="button"
                      onClick={() => handleSelectQuickName(q)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        formName === q.name
                          ? "bg-primary text-on-primary shadow-sm"
                          : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                      }`}
                    >
                      {q.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name Input */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  {t("acc_name")} <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Misal: BCA, GoPay, Tunai Dompet"
                  className="w-full px-4 py-2.5 rounded-2xl bg-surface-container border-none text-on-surface font-medium text-sm focus:ring-2 focus:ring-primary outline-none"
                  required
                />
              </div>

              {/* Fungsi Akun: Harian | Tabungan (Segmented Chips) */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  {t("acc_function")}
                </label>
                <div className="grid grid-cols-2 bg-surface-container p-1 rounded-2xl gap-1">
                  <button
                    type="button"
                    onClick={() => setFormIsSavings(false)}
                    className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                      !formIsSavings
                        ? "bg-surface-container-lowest text-emerald-700 shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    <span className="material-symbols-rounded text-base">payments</span>
                    <span>{t("acc_function_daily")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormIsSavings(true)}
                    className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                      formIsSavings
                        ? "bg-surface-container-lowest text-indigo-700 shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    <span className="material-symbols-rounded text-base">savings</span>
                    <span>{t("acc_function_savings")}</span>
                  </button>
                </div>
                <p className="text-[11px] text-on-surface-variant mt-1.5 px-1 leading-relaxed">
                  {t("acc_function_hint")}
                </p>
              </div>

              {/* Account Type Segmented Chips */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  {t("acc_type")}
                </label>
                <div className="flex bg-surface-container p-1 rounded-2xl gap-1">
                  {(["cash", "bank", "ewallet"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setFormType(type);
                        setFormIcon(getAccountIconDefault(type));
                      }}
                      className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all ${
                        formType === type
                          ? "bg-surface-container-lowest text-primary shadow-sm"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {getAccountTypeLabel(type)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Opening Balance with Quick Chips */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  {t("acc_opening_balance")}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={formOpeningBalance === 0 ? "" : formOpeningBalance}
                  onChange={(e) => setFormOpeningBalance(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full px-4 py-2.5 rounded-2xl bg-surface-container border-none text-on-surface font-bold text-sm focus:ring-2 focus:ring-primary outline-none"
                />

                <div className="flex flex-wrap gap-1 mt-2">
                  {QUICK_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setFormOpeningBalance(amt)}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                        formOpeningBalance === amt
                          ? "bg-secondary-container text-on-secondary-container"
                          : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                      }`}
                    >
                      {amt === 0 ? "Rp 0" : `Rp ${(amt / 1000).toLocaleString("id-ID")}k`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Is Default Checkbox (only for daily accounts) */}
              {!formIsSavings && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="add_is_default"
                    checked={formIsDefault}
                    onChange={(e) => setFormIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                  <label htmlFor="add_is_default" className="text-xs font-medium text-on-surface cursor-pointer">
                    {t("acc_set_default")}
                  </label>
                </div>
              )}

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-surface-container-high">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  {t("acc_cancel")}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-primary text-on-primary font-semibold text-xs shadow hover:bg-primary/90 transition-all active:scale-95"
                >
                  {t("acc_save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest w-full max-w-md rounded-3xl p-6 shadow-2xl border border-surface-container-high animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-on-surface">{t("acc_edit")}</h3>
              <button
                onClick={() => setEditingAccount(null)}
                className="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant"
              >
                <span className="material-symbols-rounded text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  {t("acc_name")} <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-surface-container border-none text-on-surface font-medium text-sm focus:ring-2 focus:ring-primary outline-none"
                  required
                />
              </div>

              {/* Fungsi Akun: Harian | Tabungan */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  {t("acc_function")}
                </label>
                <div className="grid grid-cols-2 bg-surface-container p-1 rounded-2xl gap-1">
                  <button
                    type="button"
                    disabled={editingAccount.is_savings && editingConnectedGoals.length > 0}
                    onClick={() => setFormIsSavings(false)}
                    className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                      !formIsSavings
                        ? "bg-surface-container-lowest text-emerald-700 shadow-sm"
                        : editingAccount.is_savings && editingConnectedGoals.length > 0
                        ? "opacity-40 cursor-not-allowed text-on-surface-variant"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    <span className="material-symbols-rounded text-base">payments</span>
                    <span>{t("acc_function_daily")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormIsSavings(true)}
                    className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                      formIsSavings
                        ? "bg-surface-container-lowest text-indigo-700 shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    <span className="material-symbols-rounded text-base">savings</span>
                    <span>{t("acc_function_savings")}</span>
                  </button>
                </div>
                {editingAccount.is_savings && editingConnectedGoals.length > 0 && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-xl border border-amber-200 mt-2 flex items-start gap-1">
                    <span className="material-symbols-rounded text-sm shrink-0">info</span>
                    <span>{t("acc_cannot_change_to_daily_warning")}</span>
                  </p>
                )}
                <p className="text-[11px] text-on-surface-variant mt-1.5 px-1 leading-relaxed">
                  {t("acc_function_hint")}
                </p>
              </div>

              {/* Account Type Segmented Chips */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  {t("acc_type")}
                </label>
                <div className="flex bg-surface-container p-1 rounded-2xl gap-1">
                  {(["cash", "bank", "ewallet"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormType(type)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all ${
                        formType === type
                          ? "bg-surface-container-lowest text-primary shadow-sm"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {getAccountTypeLabel(type)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Opening Balance */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-on-surface-variant">
                    {t("acc_opening_balance")}
                  </label>
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    * Perubahan memerlukan konfirmasi
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={formOpeningBalance === 0 ? "" : formOpeningBalance}
                  onChange={(e) => setFormOpeningBalance(Number(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-surface-container border-none text-on-surface font-bold text-sm focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              {/* Is Default Checkbox */}
              {!editingAccount.is_default && !formIsSavings && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="edit_is_default"
                    checked={formIsDefault}
                    onChange={(e) => setFormIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                  <label htmlFor="edit_is_default" className="text-xs font-medium text-on-surface cursor-pointer">
                    {t("acc_set_default")}
                  </label>
                </div>
              )}

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-surface-container-high">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  {t("acc_cancel")}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-primary text-on-primary font-semibold text-xs shadow hover:bg-primary/90 transition-all active:scale-95"
                >
                  {t("acc_save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        cancelLabel={t("acc_cancel")}
        confirmVariant={confirmState.confirmVariant}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Transfer Modal */}
      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        defaultSourceAccountId={transferDefaultSourceId}
        onSuccess={() => {
          showToast(t("transfer_success"), "success");
          triggerRefresh();
        }}
        onCreateGoalRequested={onCreateGoalRequested}
      />
    </div>
  );
};
