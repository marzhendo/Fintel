import { useState, useEffect } from "react";
import { useTranslation } from "./useTranslation";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useStore, Transaction, BalanceResult, Category, BudgetOverview, Account, Transfer, SavingGoal } from "./store";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { AIChat } from "./components/AIChat";
import { Settings } from "./components/Settings";
import { Debts } from "./components/Debts";
import { Budget } from "./components/Budget";
import { Accounts } from "./components/Accounts";
import { SpendingCalendar } from "./components/SpendingCalendar";
import { ConfirmationModal } from "./components/ConfirmationModal";
import { Toast, useToast } from "./components/Toast";
import { TransactionModal } from "./components/TransactionModal";
import { TransferModal } from "./components/TransferModal";
import { SavingGoalModal } from "./components/SavingGoalModal";
import { getCategoryIcon } from "./utils/categoryIcons";
import "./App.css";

interface ConfirmState {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "primary";
  requireTyping?: string;
  onConfirm: () => void;
}

const DEFAULT_CONFIRM: ConfirmState = {
  isOpen: false,
  title: "",
  onConfirm: () => {},
};

function App() {
  const { t } = useTranslation();
  const {
    categories,
    transactions,
    transfers,
    balance,
    budgetStatus,
    budgetOverview,
    savingGoals,
    accounts,
    setCategories,
    setTransactions,
    setTransfers,
    setBalance,
    setBudgetStatus,
    setBudgetOverview,
    setSavingGoals,
    setAccounts,
    refreshFlag,
    fintelAdvice,
    setFintelAdvice,
  } = useStore();

  const [activeTab, setActiveTab] = useState("Dashboard");
  const [showModal, setShowModal] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingGoal | null>(null);

  // Filters for Transactions
  const [filterType, setFilterType] = useState<"all" | "income" | "expense" | "transfer">("all");
  const [filterRangeMode, setFilterRangeMode] = useState<"all" | "today" | "7days" | "month" | "custom">("all");
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);
  const [filterAccountId, setFilterAccountId] = useState<number | null>(null);
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");

  // Confirmation Modal
  const [confirmState, setConfirmState] = useState<ConfirmState>(DEFAULT_CONFIRM);

  // Chart data
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartPeriod, setChartPeriod] = useState<"daily" | "monthly">("daily");

  // Toast
  const { toasts, showToast, dismissToast } = useToast();

  const applyRangeFilter = (mode: "all" | "today" | "7days" | "month" | "custom") => {
    setFilterRangeMode(mode);
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    if (mode === "all") {
      setFilterStartDate("");
      setFilterEndDate("");
    } else if (mode === "today") {
      setFilterStartDate(todayStr);
      setFilterEndDate(todayStr);
    } else if (mode === "7days") {
      const past = new Date();
      past.setDate(past.getDate() - 7);
      const pastStr = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, "0")}-${String(past.getDate()).padStart(2, "0")}`;
      setFilterStartDate(pastStr);
      setFilterEndDate(todayStr);
    } else if (mode === "month") {
      const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const lastDayObj = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const lastDay = `${lastDayObj.getFullYear()}-${String(lastDayObj.getMonth() + 1).padStart(2, "0")}-${String(lastDayObj.getDate()).padStart(2, "0")}`;
      setFilterStartDate(firstDay);
      setFilterEndDate(lastDay);
    }
  };

  const fetchData = async () => {
    try {
      const cats = await invoke<Category[]>("get_categories");
      setCategories(cats);

      const accs = await invoke<Account[]>("list_accounts", { includeArchived: false });
      setAccounts(accs);

      const typeFilterParam = (filterType === "income" || filterType === "expense") ? filterType : null;
      const txs = (filterType === "transfer") ? [] : await invoke<Transaction[]>("list_transactions", {
        dateFilter: null,
        typeFilter: typeFilterParam,
        categoryIdFilter: filterCategoryId,
        startDate: filterStartDate || null,
        endDate: filterEndDate || null,
        accountIdFilter: filterAccountId,
      });
      setTransactions(txs);

      const trs = await invoke<Transfer[]>("list_transfers", {
        startDate: filterStartDate || null,
        endDate: filterEndDate || null,
        accountId: filterAccountId,
      });
      setTransfers(trs);

      const goals = await invoke<any[]>("list_saving_goals");
      setSavingGoals(goals);

      const d = new Date();
      const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bal = await invoke<BalanceResult>("get_balance", { currentMonth });
      setBalance(bal);

      const bs = await invoke<any>("get_budget_status", { currentMonth });
      setBudgetStatus(bs);

      const bo = await invoke<BudgetOverview>("get_budget_overview", { currentMonth });
      setBudgetOverview(bo);

      const cData = await invoke<any[]>("get_chart_data", { currentDate: currentMonth, periodType: chartPeriod });
      setChartData(cData);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterType, filterCategoryId, filterAccountId, filterStartDate, filterEndDate, chartPeriod, refreshFlag]);

  useEffect(() => {
    const unlisten = listen("tray-hint", () => {
      showToast(t("tray_hint_desc"), "info", 5000);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [t]);

  const openConfirm = (opts: Omit<ConfirmState, "isOpen">) => {
    setConfirmState({ ...opts, isOpen: true });
  };

  const closeConfirm = () => setConfirmState(DEFAULT_CONFIRM);

  const checkBudgetAlerts = (newTxAmount: number, categoryId: number) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;

    if (budgetOverview) {
      const allCats = [
        ...budgetOverview.fixed.categories,
        ...budgetOverview.wants.categories,
        ...budgetOverview.savings.categories,
      ];
      const catBudget = allCats.find((c) => c.category_id === categoryId);
      if (catBudget && catBudget.monthly_limit > 0) {
        if (catBudget.spent + newTxAmount > catBudget.monthly_limit) {
          showToast(`Peringatan: Kategori "${cat.name}" telah melampaui plafon anggaran!`, "warning");
        }
        return;
      }
    }

    if (!budgetStatus) return;
    let currentSpent = 0;
    let ideal = 0;
    if (cat.group_type === "needs" || cat.group_type === "fixed") {
      currentSpent = budgetStatus.real.needs_spent;
      ideal = budgetStatus.ideal.needs;
    } else if (cat.group_type === "wants") {
      currentSpent = budgetStatus.real.wants_spent;
      ideal = budgetStatus.ideal.wants;
    } else if (cat.group_type === "savings") {
      currentSpent = budgetStatus.real.savings_amount;
      ideal = budgetStatus.ideal.savings;
    }

    if (currentSpent + newTxAmount > ideal && ideal > 0) {
      showToast(`Peringatan: Kategori "${cat.name || cat.group_type}" telah melampaui alokasi 100%!`, "warning");
    }
  };

  const openNewTransaction = () => {
    setEditingTx(null);
    setShowModal(true);
  };

  const openEditTransaction = (tx: Transaction) => {
    setEditingTx(tx);
    setShowModal(true);
  };

  const handleSaveTransaction = async (data: {
    amount: number;
    type: "income" | "expense";
    categoryId: number;
    note: string;
    date: string;
    savingGoalId: number | null;
    accountId?: number | null;
  }) => {
    try {
      if (data.type === "expense" && !editingTx) {
        checkBudgetAlerts(data.amount, data.categoryId);
      }

      if (editingTx) {
        await invoke("update_transaction", {
          id: editingTx.id,
          amount: data.amount,
          transactionType: data.type,
          categoryId: data.categoryId,
          note: data.note,
          transactionDate: data.date,
          savingGoalId: data.savingGoalId,
          accountId: data.accountId,
        });
        showToast("Transaksi berhasil diperbarui!", "success");
      } else {
        await invoke("create_transaction", {
          amount: data.amount,
          transactionType: data.type,
          categoryId: data.categoryId,
          note: data.note,
          transactionDate: data.date,
          savingGoalId: data.savingGoalId,
          accountId: data.accountId,
        });
        showToast("Transaksi berhasil disimpan!", "success");
      }
      setShowModal(false);
      setEditingTx(null);
      fetchData();
    } catch (e) {
      showToast("Gagal menyimpan transaksi: " + String(e), "error");
      throw e;
    }
  };

  const handleDelete = (id: number) => {
    openConfirm({
      title: t("confirm_del_tx_title"),
      description: t("confirm_del_tx_desc"),
      confirmLabel: t("confirm_del_tx_yes"),
      confirmVariant: "danger",
      onConfirm: async () => {
        closeConfirm();
        try {
          await invoke("delete_transaction", { id });
          fetchData();
          showToast("Transaksi berhasil dihapus.", "success");
        } catch (e) {
          showToast("Gagal menghapus transaksi: " + String(e), "error");
        }
      },
    });
  };

  const handleDeleteTransfer = (id: number) => {
    openConfirm({
      title: "Hapus Pindah Dana?",
      description: "Saldo akun dan progres target goal terkait akan dikembalikan seperti semula.",
      confirmLabel: t("confirm_del_tx_yes"),
      confirmVariant: "danger",
      onConfirm: async () => {
        closeConfirm();
        try {
          await invoke("delete_transfer", { id });
          fetchData();
          showToast("Pindah dana berhasil dihapus.", "success");
        } catch (e) {
          showToast("Gagal menghapus transfer: " + String(e), "error");
        }
      },
    });
  };

  const handleDeleteGoal = (goalId: number, goalName: string) => {
    openConfirm({
      title: `Hapus target "${goalName}"?`,
      description: "Data progres tabungan untuk target ini akan ikut terhapus.",
      confirmLabel: t("confirm_del_tx_yes"),
      confirmVariant: "danger",
      onConfirm: async () => {
        closeConfirm();
        try {
          await invoke("delete_saving_goal", { id: goalId });
          fetchData();
          showToast(`Target "${goalName}" berhasil dihapus.`, "success");
        } catch (e) {
          showToast("Gagal menghapus target tabungan: " + String(e), "error");
        }
      },
    });
  };

  const navTabs = [
    { id: "Dashboard", label: t("nav_dashboard"), icon: "dashboard" },
    { id: "Transactions", label: t("nav_transactions"), icon: "receipt_long" },
    { id: "Accounts", label: t("nav_accounts"), icon: "account_balance" },
    { id: "Budget", label: t("nav_budget"), icon: "pie_chart" },
    { id: "Debts", label: t("nav_debts"), icon: "account_balance_wallet" },
    { id: "AI Chat", label: t("nav_ai_chat"), icon: "smart_toy" },
    { id: "Settings", label: t("nav_settings"), icon: "settings" },
  ];

  const [autoOpenAllocationModal, setAutoOpenAllocationModal] = useState(false);

  const weeklyCategories = budgetOverview
    ? [
        ...budgetOverview.fixed.categories,
        ...budgetOverview.wants.categories,
        ...budgetOverview.savings.categories,
      ].filter((c) => c.period === "weekly" && c.base_limit > 0)
    : [];

  const hasUnsetBudgetCategories = budgetOverview
    ? [...budgetOverview.fixed.categories, ...budgetOverview.wants.categories].some(
        (c) => c.status === "unset" || c.base_limit === 0
      )
    : false;

  return (
    <div className="min-h-screen flex bg-surface text-on-surface">
      {/* Sidebar Navigation */}
      <nav className="hidden md:flex flex-col h-full p-6 space-y-4 fixed left-0 top-0 w-[280px] bg-surface-container-lowest shadow-md z-40 border-r border-surface-container-high/60">
        <div className="flex items-center gap-3 mb-8">
          <img src="/icon.png" alt="Fintel Logo" className="w-10 h-10 rounded-xl" />
          <div>
            <h1 className="font-bold text-2xl text-primary">Fintel</h1>
            <p className="text-xs text-on-surface-variant font-medium">Financial Wellness</p>
          </div>
        </div>

        <div className="flex-1 space-y-1.5">
          {navTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all text-sm ${
                activeTab === tab.id
                  ? "bg-primary-container text-on-primary-container shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-rounded text-xl">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <button
            onClick={openNewTransaction}
            className="w-full py-3.5 bg-primary text-on-primary rounded-full font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary-container hover:text-on-primary-container shadow-md active:scale-95 transition-all"
          >
            <span className="material-symbols-rounded text-lg">add</span> {t("tx_new_transaction")}
          </button>
          <button
            onClick={() => setShowTransferModal(true)}
            className="w-full py-2.5 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-full font-bold text-xs flex items-center justify-center gap-2 border border-surface-container-high transition-all"
          >
            <span className="material-symbols-rounded text-base text-indigo-600">sync_alt</span>
            {t("transfer_title")}
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 ml-0 md:ml-[280px] p-6 sm:p-8 max-w-[1440px] mx-auto w-full space-y-8">
        {/* DASHBOARD TAB */}
        {activeTab === "Dashboard" && (
          <>
            <header className="mb-6">
              <h2 className="text-3xl font-bold text-primary mb-6">{t("nav_dashboard")}</h2>
              <div className="bg-[#e2f5f1] rounded-3xl shadow-sm p-8 relative overflow-hidden border border-teal-200/50">
                <div className="absolute top-8 right-8 w-14 h-14 rounded-2xl bg-[#c5ece3] flex items-center justify-center">
                  <span className="material-symbols-rounded text-teal-800 text-3xl">account_balance_wallet</span>
                </div>

                <div className="flex flex-col md:flex-row gap-8 md:gap-12 relative z-10">
                  <div>
                    <p className="text-xs text-teal-800 uppercase tracking-wider mb-2 font-bold">
                      {t("dash_total_balance")}
                    </p>
                    <p className="text-4xl font-black text-teal-950 font-mono">
                      Rp {(balance?.balance || 0).toLocaleString("id-ID")}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-white/80 text-teal-900 border border-teal-300/60 shadow-xs">
                        <span className="material-symbols-rounded text-sm text-teal-700">account_balance_wallet</span>
                        {t("dash_balance_available")}: Rp {(balance?.available_balance || 0).toLocaleString("id-ID")}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-indigo-100/90 text-indigo-900 border border-indigo-200/80 shadow-xs">
                        <span className="material-symbols-rounded text-sm text-indigo-700">savings</span>
                        {t("dash_balance_savings")}: Rp {(balance?.savings_balance || 0).toLocaleString("id-ID")}
                      </span>
                    </div>
                  </div>
                  <div className="md:border-l md:border-teal-300/50 md:pl-12">
                    <p className="text-xs text-teal-800 uppercase tracking-wider mb-2 font-bold">
                      Monthly Balance
                    </p>
                    <p className="text-3xl font-extrabold text-teal-900 font-mono">
                      Rp {(balance?.monthly_balance || 0).toLocaleString("id-ID")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Saldo per Akun (Mini-card pastel di bawah kartu Balance) */}
              {accounts.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-rounded text-sm">account_balance</span>
                      {t("dash_accounts_balance")}
                    </h4>
                    <button
                      onClick={() => setActiveTab("Accounts")}
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      {t("nav_accounts")} →
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {accounts.map((acc) => (
                      <div
                        key={acc.id}
                        onClick={() => {
                          setFilterAccountId(acc.id);
                          setActiveTab("Transactions");
                        }}
                        className="p-3.5 rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${acc.color || "#0284c7"}1a`, color: acc.color || "#0284c7" }}
                            >
                              <span className="material-symbols-rounded text-base">{acc.icon || "account_balance"}</span>
                            </div>
                            <div className="truncate">
                              <p className="text-xs font-bold text-on-surface truncate">{acc.name}</p>
                              <p className="text-[10px] text-on-surface-variant capitalize">{acc.account_type}</p>
                            </div>
                          </div>
                          {acc.is_default && (
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-primary/10 text-primary shrink-0">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-black font-mono text-on-surface">
                          Rp {acc.current_balance.toLocaleString("id-ID")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </header>

            {/* Target Tabungan Card */}
            <section className="bg-blue-50/80 rounded-3xl shadow-sm p-6 relative overflow-hidden border border-blue-100">
              <div className="flex justify-between items-center mb-4 relative z-10">
                <h3 className="font-bold flex items-center gap-3 text-blue-900 text-base">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <span className="material-symbols-rounded text-blue-700 text-xl">flag</span>
                  </div>
                  {t("dash_saving_goals")}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setEditingGoal(null);
                    setShowGoalModal(true);
                  }}
                  className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-3.5 py-1.5 rounded-full font-bold ml-auto transition-colors flex items-center gap-1 shadow-xs"
                >
                  <span className="material-symbols-rounded text-sm">add</span>
                  {t("dash_add_goal")}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {savingGoals.map((goal) => {
                  const pct = Math.min((goal.current_amount / goal.target_amount) * 100, 100);
                  return (
                    <div key={goal.id} className="bg-surface p-4 rounded-2xl border border-surface-container-high hover:border-blue-200 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-on-surface">{goal.name}</span>
                            {goal.account_name && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-800 flex items-center gap-1">
                                <span className="material-symbols-rounded text-xs">savings</span>
                                {goal.account_name}
                              </span>
                            )}
                          </div>
                          {goal.target_date && (
                            <p className="text-[10px] text-on-surface-variant font-medium mt-0.5">
                              Target: {goal.target_date}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-blue-600 font-mono">{pct.toFixed(0)}%</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingGoal(goal);
                              setShowGoalModal(true);
                            }}
                            className="text-on-surface-variant hover:text-primary transition-colors p-1"
                            title="Edit Target"
                          >
                            <span className="material-symbols-rounded text-sm">edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGoal(goal.id, goal.name)}
                            className="text-red-400 hover:text-red-600 transition-colors p-1"
                            title="Hapus Target"
                          >
                            <span className="material-symbols-rounded text-sm">delete</span>
                          </button>
                        </div>
                      </div>
                      <div className="w-full bg-blue-100 rounded-full h-2 mb-2 overflow-hidden">
                        <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                      </div>
                      <div className="flex justify-between text-xs text-on-surface-variant font-medium">
                        <span className="font-bold text-blue-900 font-mono">
                          Rp {goal.current_amount.toLocaleString("id-ID")}
                        </span>
                        <span className="font-mono">
                          {t("dash_goal_target")} Rp {goal.target_amount.toLocaleString("id-ID")}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {savingGoals.length === 0 && (
                  <p className="text-sm text-on-surface-variant col-span-2">Belum ada target tabungan.</p>
                )}
              </div>
            </section>

            {/* 3 Budget Cards (Envelope Realization) */}
            {((budgetOverview && budgetOverview.monthly_income > 0) || (budgetStatus && budgetStatus.income > 0)) && (
              <section>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Bulanan Tetap / Fixed */}
                  {(() => {
                    const spent = budgetOverview ? budgetOverview.fixed.total_spent : (budgetStatus?.real.needs_spent || 0);
                    const limit = budgetOverview ? budgetOverview.fixed.total_limit : (budgetStatus?.ideal.needs || 0);
                    const rawPct = limit > 0 ? (spent / limit) * 100 : 0;
                    const pct = Math.min(rawPct, 100);
                    const barColor = rawPct > 100 ? "bg-red-500" : rawPct >= 80 ? "bg-amber-500" : "bg-emerald-500";
                    return (
                      <div className={`bg-rose-50 rounded-3xl shadow-sm p-6 relative overflow-hidden border ${rawPct > 100 ? "border-2 border-red-400" : "border-rose-100"}`}>
                        <div className="absolute top-6 right-6 w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center">
                          <span className="material-symbols-rounded text-rose-700 text-2xl">home</span>
                        </div>
                        <h3 className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-2">
                          {t("dash_fixed")}
                        </h3>
                        <p className={`text-3xl font-black mb-1 font-mono ${rawPct > 100 ? "text-red-600" : "text-rose-950"}`}>
                          {rawPct.toFixed(1)}%
                        </p>
                        <p className="text-xs text-rose-800 font-medium mb-4 font-mono">
                          Rp {spent.toLocaleString("id-ID")} / {limit.toLocaleString("id-ID")}
                        </p>
                        <div className="w-full h-2 rounded-full bg-rose-200 overflow-hidden">
                          <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Keinginan / Wants */}
                  {(() => {
                    const spent = budgetOverview ? budgetOverview.wants.total_spent : (budgetStatus?.real.wants_spent || 0);
                    const limit = budgetOverview ? budgetOverview.wants.total_limit : (budgetStatus?.ideal.wants || 0);
                    const rawPct = limit > 0 ? (spent / limit) * 100 : 0;
                    const pct = Math.min(rawPct, 100);
                    const barColor = rawPct > 100 ? "bg-red-500" : rawPct >= 80 ? "bg-amber-500" : "bg-emerald-500";
                    return (
                      <div className={`bg-amber-50 rounded-3xl shadow-sm p-6 relative overflow-hidden border ${rawPct > 100 ? "border-2 border-red-400" : "border-amber-100"}`}>
                        <div className="absolute top-6 right-6 w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
                          <span className="material-symbols-rounded text-amber-700 text-2xl">shopping_cart</span>
                        </div>
                        <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">
                          {t("dash_wants")}
                        </h3>
                        <p className={`text-3xl font-black mb-1 font-mono ${rawPct > 100 ? "text-red-600" : "text-amber-950"}`}>
                          {rawPct.toFixed(1)}%
                        </p>
                        <p className="text-xs text-amber-800 font-medium mb-4 font-mono">
                          Rp {spent.toLocaleString("id-ID")} / {limit.toLocaleString("id-ID")}
                        </p>
                        <div className="w-full h-2 rounded-full bg-amber-200 overflow-hidden">
                          <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Tabungan / Savings */}
                  {(() => {
                    const spent = budgetOverview ? budgetOverview.savings.total_spent : (budgetStatus?.real.savings_amount || 0);
                    const limit = budgetOverview ? budgetOverview.savings.total_limit : (budgetStatus?.ideal.savings || 0);
                    const rawPct = limit > 0 ? (spent / limit) * 100 : 0;
                    const pct = Math.min(rawPct, 100);
                    const barColor = rawPct < 80 ? "bg-red-500" : rawPct < 100 ? "bg-amber-500" : "bg-emerald-500";
                    return (
                      <div className={`bg-blue-50 rounded-3xl shadow-sm p-6 relative overflow-hidden border ${rawPct < 100 ? "border-2 border-amber-400" : "border-blue-100"}`}>
                        <div className="absolute top-6 right-6 w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
                          <span className="material-symbols-rounded text-blue-700 text-2xl">savings</span>
                        </div>
                        <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">
                          {t("dash_savings")}
                        </h3>
                        <p className={`text-3xl font-black mb-1 font-mono ${rawPct < 100 ? "text-amber-600" : "text-blue-950"}`}>
                          {rawPct.toFixed(1)}%
                        </p>
                        <p className="text-xs text-blue-800 font-medium mb-4 font-mono">
                          Rp {spent.toLocaleString("id-ID")} / {limit.toLocaleString("id-ID")}
                        </p>
                        <div className="w-full h-2 rounded-full bg-blue-200 overflow-hidden">
                          <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </section>
            )}

            {/* Kartu Jatah Mingguan & Tombol Alokasi Otomatis */}
            <section className="bg-emerald-50/80 rounded-3xl shadow-sm p-6 relative overflow-hidden border border-emerald-100">
              <div className="flex flex-wrap justify-between items-center gap-3 mb-4 relative z-10">
                <h3 className="font-bold flex items-center gap-3 text-emerald-950 text-base">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <span className="material-symbols-rounded text-emerald-700 text-xl">date_range</span>
                  </div>
                  {t("dash_weekly_envelopes")}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-100/90 px-3 py-1.5 rounded-full">
                    {(() => {
                      const days = (8 - new Date().getDay()) % 7 || 7;
                      return days === 1
                        ? t("dash_weekly_reset_tomorrow")
                        : t("dash_weekly_reset_days").replace("{days}", String(days));
                    })()}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAutoOpenAllocationModal(true);
                      setActiveTab("Budget");
                    }}
                    className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-1.5 rounded-full font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <span className="material-symbols-rounded text-sm">auto_awesome</span>
                    {t("budget_auto_allocate_btn")}
                  </button>
                </div>
              </div>

              {hasUnsetBudgetCategories && (
                <div className="mb-3 bg-amber-50/90 border border-amber-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-amber-950 font-medium flex items-center gap-2">
                    <span className="material-symbols-rounded text-amber-700 text-base">lightbulb</span>
                    {t("budget_unset_banner_desc")}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setAutoOpenAllocationModal(true);
                      setActiveTab("Budget");
                    }}
                    className="text-xs font-bold text-amber-950 bg-amber-200/80 hover:bg-amber-300/80 px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors self-end sm:self-auto"
                  >
                    {t("budget_auto_allocate_btn")} →
                  </button>
                </div>
              )}

              {weeklyCategories.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {weeklyCategories.map((c) => {
                    const pct = Math.min(c.percentage, 100);
                    const barColor =
                      c.status === "over"
                        ? "bg-red-500"
                        : c.status === "waspada"
                        ? "bg-amber-500"
                        : "bg-emerald-500";
                    return (
                      <div
                        key={c.category_id}
                        className="bg-surface p-3.5 rounded-2xl border border-surface-container-high shadow-xs"
                      >
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="font-bold text-xs text-on-surface truncate">
                            {c.category_name}
                          </span>
                          <span
                            className={`text-[11px] font-bold font-mono ${
                              c.remaining >= 0 ? "text-emerald-700" : "text-rose-600"
                            }`}
                          >
                            {c.remaining >= 0
                              ? `sisa Rp ${c.remaining.toLocaleString("id-ID")}`
                              : `lebih Rp ${Math.abs(c.remaining).toLocaleString("id-ID")}`}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden mb-1">
                          <div
                            className={`h-1.5 rounded-full ${barColor}`}
                            style={{ width: `${pct}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-[10px] text-on-surface-variant font-medium">
                          <span>{c.percentage.toFixed(0)}% terpakai</span>
                          <span>plafon Rp {c.effective_limit.toLocaleString("id-ID")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface p-4 rounded-2xl border border-surface-container-high">
                  <p className="text-xs text-on-surface-variant font-medium">
                    {t("dash_no_weekly_categories")}
                  </p>
                  <button
                    onClick={() => setActiveTab("Budget")}
                    className="text-xs font-bold text-primary hover:underline whitespace-nowrap flex items-center gap-1"
                  >
                    {t("dash_go_to_budget")}
                  </button>
                </div>
              )}
            </section>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <section className="bg-surface-container-lowest rounded-3xl shadow-sm p-6 lg:col-span-2 border border-surface-container-high">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-base text-on-surface">Income vs Expense</h3>
                  <div className="flex bg-surface-container rounded-xl p-1 border border-surface-container-high">
                    <button
                      onClick={() => setChartPeriod("daily")}
                      className={`px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                        chartPeriod === "daily" ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant"
                      }`}
                    >
                      {t("dash_chart_daily")}
                    </button>
                    <button
                      onClick={() => setChartPeriod("monthly")}
                      className={`px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                        chartPeriod === "monthly" ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant"
                      }`}
                    >
                      {t("dash_chart_monthly")}
                    </button>
                  </div>
                </div>
                <div className="h-64 w-full text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" stroke="#64748b" tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" tickLine={false} axisLine={false} tickFormatter={(val) => `Rp${val / 1000}k`} />
                      <Tooltip formatter={(value: any) => `Rp ${value.toLocaleString("id-ID")}`} />
                      <Legend />
                      <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Income" />
                      <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Expense" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="bg-surface-container-lowest rounded-3xl shadow-sm p-6 flex flex-col border border-surface-container-high">
                <h3 className="font-bold text-base mb-4 text-on-surface">{t("dash_spending_composition")}</h3>
                <div className="flex-1 min-h-[250px] relative">
                  {budgetStatus && (budgetStatus.real.needs_spent > 0 || budgetStatus.real.wants_spent > 0 || budgetStatus.real.savings_amount > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: t("dash_fixed"), value: budgetStatus.real.needs_spent, color: "#f43f5e" },
                            { name: t("dash_wants"), value: budgetStatus.real.wants_spent, color: "#eab308" },
                            { name: t("dash_savings"), value: budgetStatus.real.savings_amount, color: "#3b82f6" },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {[
                            { name: t("dash_fixed"), value: budgetStatus.real.needs_spent, color: "#f43f5e" },
                            { name: t("dash_wants"), value: budgetStatus.real.wants_spent, color: "#eab308" },
                            { name: t("dash_savings"), value: budgetStatus.real.savings_amount, color: "#3b82f6" },
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => `Rp ${value.toLocaleString("id-ID")}`} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-on-surface-variant text-center">
                      No spending data for this period
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Kalender Pengeluaran (Heatmap) */}
            <SpendingCalendar
              onDateClick={(clickedDate) => {
                setFilterStartDate(clickedDate);
                setFilterEndDate(clickedDate);
                setFilterRangeMode("custom");
                setActiveTab("Transactions");
              }}
            />

            {/* Saran Fintel */}
            <section className="bg-purple-50/70 border border-purple-100 rounded-3xl p-6 sm:p-8 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                    <span className="material-symbols-rounded text-purple-700 text-2xl">auto_awesome</span>
                  </div>
                  <h3 className="text-xl font-bold text-purple-950">{t("dash_fintel_advice")}</h3>
                </div>
                <button
                  onClick={async () => {
                    try {
                      setFintelAdvice("Sedang menganalisis data...");
                      const d = new Date();
                      const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                      const advice = await invoke<string>("generate_fintel_advice", { currentMonth });
                      setFintelAdvice(advice);
                    } catch (e) {
                      setFintelAdvice(t("dash_advice_error"));
                      showToast(String(e), "error");
                    }
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full font-bold text-xs transition-colors shadow-sm"
                >
                  {t("dash_refresh_advice")}
                </button>
              </div>

              <div className="text-sm text-purple-900 leading-relaxed font-medium">
                {fintelAdvice === "Sedang menganalisis data..." ? (
                  <div className="flex items-center gap-3 animate-pulse">
                    <span className="material-symbols-rounded animate-spin">sync</span>
                    {t("dash_fetching_advice")}
                  </div>
                ) : fintelAdvice ? (
                  <p className="whitespace-pre-wrap">{fintelAdvice}</p>
                ) : (
                  <p>Klik "{t("dash_refresh_advice")}" untuk meminta saran cerdas dari asisten AI Anda.</p>
                )}
              </div>
            </section>
          </>
        )}

        {/* TRANSACTIONS TAB */}
        {activeTab === "Transactions" && (
          <div className="h-full space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-3xl font-bold text-primary">{t("nav_transactions")}</h2>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(true)}
                  className="px-4 py-2.5 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-full font-bold text-xs flex items-center gap-1.5 border border-surface-container-high transition-all"
                >
                  <span className="material-symbols-rounded text-base text-indigo-600">sync_alt</span>
                  {t("transfer_title")}
                </button>
                <button
                  type="button"
                  onClick={openNewTransaction}
                  className="px-5 py-2.5 bg-primary text-on-primary rounded-full font-bold text-sm flex items-center gap-2 hover:bg-primary-container hover:text-on-primary-container shadow-sm transition-all active:scale-95"
                >
                  <span className="material-symbols-rounded text-base">add</span> {t("tx_new_transaction")}
                </button>
              </div>
            </div>

            <section className="bg-surface-container-lowest rounded-3xl shadow-sm border border-surface-container-high overflow-hidden">
              {/* Header Filters: Segmented Type + Quick Range Chips + Category Chips */}
              <div className="p-6 border-b border-surface-container-high space-y-4 bg-surface-container/20">
                {/* Segmented All / Income / Expense / Transfer */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h3 className="font-bold text-base text-on-surface">Riwayat Transaksi & Mutasi</h3>

                  <div className="inline-flex p-1 bg-surface-container rounded-2xl border border-surface-container-high self-start sm:self-auto">
                    <button
                      onClick={() => setFilterType("all")}
                      className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all ${
                        filterType === "all" ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {t("tx_all")}
                    </button>
                    <button
                      onClick={() => setFilterType("income")}
                      className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all ${
                        filterType === "income" ? "bg-white shadow-sm text-emerald-700" : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {t("tx_income")}
                    </button>
                    <button
                      onClick={() => setFilterType("expense")}
                      className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all ${
                        filterType === "expense" ? "bg-white shadow-sm text-rose-700" : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {t("tx_expense")}
                    </button>
                    <button
                      onClick={() => setFilterType("transfer")}
                      className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all ${
                        filterType === "transfer" ? "bg-white shadow-sm text-indigo-700" : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {t("transfer_title")}
                    </button>
                  </div>
                </div>

                {/* Quick Date Range Chips */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-on-surface-variant mr-1">Rentang:</span>
                  <button
                    onClick={() => applyRangeFilter("all")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      filterRangeMode === "all" ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                    }`}
                  >
                    {t("filter_range_all")}
                  </button>
                  <button
                    onClick={() => applyRangeFilter("today")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      filterRangeMode === "today" ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                    }`}
                  >
                    {t("filter_range_today")}
                  </button>
                  <button
                    onClick={() => applyRangeFilter("7days")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      filterRangeMode === "7days" ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                    }`}
                  >
                    {t("filter_range_7days")}
                  </button>
                  <button
                    onClick={() => applyRangeFilter("month")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      filterRangeMode === "month" ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                    }`}
                  >
                    {t("filter_range_this_month")}
                  </button>
                  <button
                    onClick={() => applyRangeFilter("custom")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                      filterRangeMode === "custom" ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                    }`}
                  >
                    <span className="material-symbols-rounded text-xs">calendar_month</span>
                    {t("filter_range_custom")}
                  </button>

                  {filterRangeMode === "custom" && (
                    <div className="flex items-center gap-2 ml-2 animate-in fade-in">
                      <input
                        type="date"
                        value={filterStartDate}
                        onChange={(e) => setFilterStartDate(e.target.value)}
                        className="p-1.5 rounded-xl border border-surface-container-high bg-surface text-xs font-medium"
                      />
                      <span className="text-on-surface-variant text-xs">-</span>
                      <input
                        type="date"
                        value={filterEndDate}
                        onChange={(e) => setFilterEndDate(e.target.value)}
                        className="p-1.5 rounded-xl border border-surface-container-high bg-surface text-xs font-medium"
                      />
                    </div>
                  )}
                </div>

                {/* Category Filter Chips (Only when not filtering transfers) */}
                {filterType !== "transfer" && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-surface-container-high/60">
                    <span className="text-xs font-bold text-on-surface-variant mr-1">Kategori:</span>
                    <button
                      onClick={() => setFilterCategoryId(null)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        filterCategoryId === null ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                      }`}
                    >
                      {t("filter_all_categories")}
                    </button>
                    {categories
                      .filter((c) => filterType === "all" || c.transaction_type === filterType)
                      .map((cat) => {
                        const isSelected = filterCategoryId === cat.id;
                        const icon = getCategoryIcon(cat.name, cat.group_type);
                        return (
                          <button
                            key={cat.id}
                            onClick={() => setFilterCategoryId(isSelected ? null : cat.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                              isSelected
                                ? "bg-primary text-on-primary shadow-sm"
                                : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                            }`}
                          >
                            <span className="material-symbols-rounded text-sm">{icon}</span>
                            <span>{cat.name}</span>
                          </button>
                        );
                      })}
                  </div>
                )}

                {/* Account Filter Chips */}
                {accounts.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-surface-container-high/60">
                    <span className="text-xs font-bold text-on-surface-variant mr-1">{t("form_account")}:</span>
                    <button
                      onClick={() => setFilterAccountId(null)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        filterAccountId === null
                          ? "bg-primary text-on-primary shadow-sm"
                          : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                      }`}
                    >
                      {t("filter_all_accounts")}
                    </button>
                    {accounts.map((acc) => {
                      const isSelected = filterAccountId === acc.id;
                      return (
                        <button
                          key={acc.id}
                          onClick={() => setFilterAccountId(isSelected ? null : acc.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            isSelected
                              ? "bg-primary text-on-primary shadow-sm"
                              : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                          }`}
                        >
                          <span className="material-symbols-rounded text-xs">{acc.icon || "account_balance"}</span>
                          <span>{acc.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Transaction & Transfer Unified List */}
              <div className="divide-y divide-surface-container-high">
                {(() => {
                  type HistoryItem =
                    | { kind: "tx"; data: Transaction; date: string; id: number }
                    | { kind: "transfer"; data: Transfer; date: string; id: number };

                  const items: HistoryItem[] = [];

                  if (filterType !== "transfer") {
                    transactions.forEach((tx) =>
                      items.push({ kind: "tx", data: tx, date: tx.transaction_date, id: tx.id })
                    );
                  }

                  if ((filterType === "all" || filterType === "transfer") && filterCategoryId === null) {
                    transfers.forEach((tr) =>
                      items.push({ kind: "transfer", data: tr, date: tr.transfer_date, id: tr.id })
                    );
                  }

                  items.sort((a, b) => {
                    if (a.date !== b.date) return b.date.localeCompare(a.date);
                    return b.id - a.id;
                  });

                  if (items.length === 0) {
                    return (
                      <div className="p-12 text-center text-on-surface-variant">
                        <span className="material-symbols-rounded text-4xl mb-2 text-on-surface-variant/40">
                          receipt_long
                        </span>
                        <p className="text-sm font-medium">
                          Tidak ada riwayat transaksi atau pindah dana yang cocok dengan filter.
                        </p>
                      </div>
                    );
                  }

                  return items.map((item) => {
                    if (item.kind === "tx") {
                      const tx = item.data;
                      return (
                        <div
                          key={`tx-${tx.id}`}
                          className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-surface-container-low group transition-colors"
                        >
                          <div className="col-span-2 text-xs font-medium text-on-surface-variant font-mono">
                            {tx.transaction_date}
                          </div>
                          <div className="col-span-5 flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                                tx.transaction_type === "income"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-rose-100 text-rose-700"
                              }`}
                            >
                              <span className="material-symbols-rounded">
                                {tx.transaction_type === "income" ? "arrow_upward" : "arrow_downward"}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-on-surface truncate">
                                {tx.note?.replace("AI: ", "") || t("tx_no_description")}
                              </p>
                              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                <span className="text-[11px] text-on-surface-variant">
                                  {tx.source === "ai_chat" ? "AI Chat" : t("tx_manual_entry")}
                                </span>
                                {tx.related_debt_id && (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-md font-bold text-[10px]">
                                    Utang/Piutang
                                  </span>
                                )}
                                {tx.account_name && (
                                  <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200/60 rounded-full font-bold text-[10px] flex items-center gap-1">
                                    <span className="material-symbols-rounded text-[11px]">account_balance</span>
                                    {tx.account_name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="col-span-2">
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-surface-container text-on-surface">
                              {categories.find((c) => c.id === tx.category_id)?.name}
                            </span>
                          </div>
                          <div className="col-span-3 flex items-center justify-end gap-3">
                            <span
                              className={`font-black text-sm font-mono ${
                                tx.transaction_type === "income" ? "text-emerald-600" : "text-rose-600"
                              }`}
                            >
                              {tx.transaction_type === "income" ? "+" : "-"}Rp {tx.amount.toLocaleString("id-ID")}
                            </span>
                            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                              <button
                                onClick={() => openEditTransaction(tx)}
                                className="p-1.5 text-on-surface-variant hover:text-primary rounded-lg hover:bg-surface-container"
                              >
                                <span className="material-symbols-rounded text-sm">edit</span>
                              </button>
                              <button
                                onClick={() => handleDelete(tx.id)}
                                className="p-1.5 text-on-surface-variant hover:text-rose-500 rounded-lg hover:bg-surface-container"
                              >
                                <span className="material-symbols-rounded text-sm">delete</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      // Transfer Row (Neutral styling)
                      const tr = item.data;
                      return (
                        <div
                          key={`tr-${tr.id}`}
                          className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-indigo-50/40 bg-surface-container/10 group transition-colors"
                        >
                          <div className="col-span-2 text-xs font-medium text-on-surface-variant font-mono">
                            {tr.transfer_date}
                          </div>
                          <div className="col-span-5 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-indigo-100 text-indigo-700">
                              <span className="material-symbols-rounded">sync_alt</span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-on-surface truncate">
                                {tr.saving_effect === "deposit"
                                  ? `Nabung → ${tr.saving_goal_name || "Goal"}`
                                  : tr.saving_effect === "withdrawal"
                                  ? `Tarik ← ${tr.saving_goal_name || "Goal"}`
                                  : `${tr.from_account_name} → ${tr.to_account_name}`}
                              </p>
                              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200/60 rounded-full font-bold text-[10px] flex items-center gap-1">
                                  <span className="material-symbols-rounded text-[11px]">sync_alt</span>
                                  {tr.from_account_name} → {tr.to_account_name}
                                </span>
                                {tr.note && (
                                  <span className="text-[11px] text-on-surface-variant truncate">
                                    {tr.note}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="col-span-2">
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                              {tr.saving_effect === "deposit"
                                ? "Nabung"
                                : tr.saving_effect === "withdrawal"
                                ? "Tarik Tabungan"
                                : "Pindah Dana"}
                            </span>
                          </div>
                          <div className="col-span-3 flex items-center justify-end gap-3">
                            <span className="font-black text-sm font-mono text-indigo-950">
                              Rp {tr.amount.toLocaleString("id-ID")}
                            </span>
                            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                              <button
                                onClick={() => handleDeleteTransfer(tr.id)}
                                className="p-1.5 text-on-surface-variant hover:text-rose-500 rounded-lg hover:bg-surface-container"
                                title="Hapus Transfer"
                              >
                                <span className="material-symbols-rounded text-sm">delete</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  });
                })()}
              </div>
            </section>
          </div>
        )}

        {/* ACCOUNTS TAB */}
        {activeTab === "Accounts" && (
          <div className="h-full">
            <Accounts
              showToast={showToast}
              onCreateGoalRequested={() => {
                setEditingGoal(null);
                setShowGoalModal(true);
              }}
            />
          </div>
        )}

        {/* BUDGET TAB */}
        {activeTab === "Budget" && (
          <div className="h-full">
            <Budget
              showToast={showToast}
              autoOpenAllocationModal={autoOpenAllocationModal}
              onAllocationModalOpened={() => setAutoOpenAllocationModal(false)}
            />
          </div>
        )}

        {/* DEBTS TAB */}
        {activeTab === "Debts" && (
          <div className="h-full">
            <Debts showToast={showToast} openConfirm={openConfirm} closeConfirm={closeConfirm} />
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === "Settings" && (
          <Settings showToast={showToast} openConfirm={openConfirm} closeConfirm={closeConfirm} />
        )}

        {/* AI CHAT TAB */}
        {activeTab === "AI Chat" && (
          <div className="h-full">
            <AIChat showToast={showToast} />
          </div>
        )}
      </main>

      {/* Toast Notifications */}
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        confirmVariant={confirmState.confirmVariant}
        requireTyping={confirmState.requireTyping}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />

      {/* Progressive Transaction Modal */}
      <TransactionModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingTx(null);
        }}
        editingTx={editingTx}
        onSave={handleSaveTransaction}
        categories={categories}
        savingGoals={savingGoals}
        budgetOverview={budgetOverview}
        accounts={accounts}
      />

      {/* Standalone Transfer Modal */}
      <TransferModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onSuccess={() => {
          fetchData();
          showToast(t("transfer_success"), "success");
        }}
        onCreateGoalRequested={() => {
          setShowTransferModal(false);
          setEditingGoal(null);
          setShowGoalModal(true);
        }}
      />

      {/* Saving Goal Modal */}
      <SavingGoalModal
        isOpen={showGoalModal}
        onClose={() => {
          setShowGoalModal(false);
          setEditingGoal(null);
        }}
        editingGoal={editingGoal}
        onSuccess={() => {
          fetchData();
          showToast("Target tabungan berhasil disimpan!", "success");
        }}
        onNavigateToAccounts={() => setActiveTab("Accounts")}
      />
    </div>
  );
}

export default App;
