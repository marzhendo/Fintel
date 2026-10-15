import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../useTranslation";
import {
  useStore,
  EnvelopePreview,
  AutoAllocationInputItem,
  AutoAllocationPreview,
  AllocationPercentItem,
} from "../store";
import { getCategoryIcon } from "../utils/categoryIcons";
import { ConfirmationModal } from "./ConfirmationModal";

interface CategoryBudgetSettingItem {
  category_id: number;
  category_name: string;
  group_type: string | null;
  limit_amount: number;
  period: "weekly" | "monthly";
  anchor_date: string | null;
  monthly_limit: number;
}

interface DraftItem {
  period: "weekly" | "monthly";
  amount: number;
}

interface AutoDraftItem {
  bp: number; // integer basis points (1% = 100 bp, 0.5% = 50 bp)
  period: "weekly" | "monthly";
  inputStr: string;
}

interface BudgetProps {
  showToast: (msg: string, variant?: "success" | "error" | "info" | "warning") => void;
  autoOpenAllocationModal?: boolean;
  onAllocationModalOpened?: () => void;
}

export function Budget({
  showToast,
  autoOpenAllocationModal,
  onAllocationModalOpened,
}: BudgetProps) {
  const { t, language } = useTranslation();
  const { budgetOverview, budgetStatus, triggerRefresh, refreshFlag } = useStore();

  const [categories, setCategories] = useState<CategoryBudgetSettingItem[]>([]);
  const [drafts, setDrafts] = useState<Record<number, DraftItem>>({});
  const [savedItems, setSavedItems] = useState<Record<number, DraftItem>>({});

  const [income, setIncome] = useState<number>(0);
  const [isEditingIncome, setIsEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Live preview state from Rust preview_envelope
  const [preview, setPreview] = useState<EnvelopePreview | null>(null);

  // Confirmation modal state for carry-over reset
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmCarryAmount, setConfirmCarryAmount] = useState(0);
  const [pendingSaveList, setPendingSaveList] = useState<
    { category_id: number; period: "weekly" | "monthly"; amount: number }[]
  >([]);

  // Auto Allocation Modal State
  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);
  const [autoDrafts, setAutoDrafts] = useState<Record<number, AutoDraftItem>>({});
  const [autoPreview, setAutoPreview] = useState<AutoAllocationPreview | null>(null);
  const [isApplyingAuto, setIsApplyingAuto] = useState(false);

  // Load category budget settings
  const loadData = async () => {
    try {
      const items = await invoke<CategoryBudgetSettingItem[]>("get_category_budgets");
      setCategories(items);

      const draftMap: Record<number, DraftItem> = {};
      const savedMap: Record<number, DraftItem> = {};
      items.forEach((item) => {
        const period = item.period === "weekly" ? "weekly" : "monthly";
        const amount = item.limit_amount ?? item.monthly_limit ?? 0;
        draftMap[item.category_id] = { period, amount };
        savedMap[item.category_id] = { period, amount };
      });
      setDrafts(draftMap);
      setSavedItems(savedMap);

      const curIncome = budgetOverview?.monthly_income ?? budgetStatus?.income ?? 0;
      setIncome(curIncome);
      setIncomeInput(curIncome.toString());
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  useEffect(() => {
    loadData();
  }, [refreshFlag, budgetOverview?.monthly_income, budgetStatus?.income]);

  // Open Auto Allocation Modal and load saved allocation_percents from Rust
  const openAutoAllocationModal = async () => {
    try {
      const savedPercents = await invoke<AllocationPercentItem[]>("get_allocation_percents");
      const bpMap = new Map<number, number>();
      savedPercents.forEach((p) => {
        if (p.bp > 0) bpMap.set(p.category_id, p.bp);
      });

      const nextAutoDrafts: Record<number, AutoDraftItem> = {};
      const previewInputs: AutoAllocationInputItem[] = [];

      categories.forEach((cat) => {
        const bp = bpMap.get(cat.category_id) ?? 0;
        const period = drafts[cat.category_id]?.period || "monthly";
        nextAutoDrafts[cat.category_id] = {
          bp,
          period,
          inputStr: bp > 0 ? (bp / 100).toString() : "",
        };
        previewInputs.push({
          category_id: cat.category_id,
          bp,
          period,
        });
      });

      setAutoDrafts(nextAutoDrafts);
      setIsAutoModalOpen(true);

      const initialPrev = await invoke<AutoAllocationPreview>("preview_auto_allocation", {
        income,
        items: previewInputs,
      });
      setAutoPreview(initialPrev);
    } catch (e) {
      showToast("Gagal memuat alokasi otomatis: " + String(e), "error");
    }
  };

  // Trigger auto-open if requested from Dashboard
  useEffect(() => {
    if (autoOpenAllocationModal && categories.length > 0) {
      openAutoAllocationModal();
      onAllocationModalOpened?.();
    }
  }, [autoOpenAllocationModal, categories.length]);

  // Debounced live preview for Auto Allocation dialog (200 ms)
  useEffect(() => {
    if (!isAutoModalOpen) return;

    const timer = setTimeout(async () => {
      const items: AutoAllocationInputItem[] = categories.map((cat) => {
        const d = autoDrafts[cat.category_id];
        return {
          category_id: cat.category_id,
          bp: d ? d.bp : 0,
          period: d ? d.period : "monthly",
        };
      });

      try {
        const res = await invoke<AutoAllocationPreview>("preview_auto_allocation", {
          income,
          items,
        });
        setAutoPreview(res);
      } catch (e) {
        console.error("preview_auto_allocation failed:", e);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [isAutoModalOpen, autoDrafts, income, categories]);

  // Stepper for Auto Allocation percent (-1%, -0.5%, +0.5%, +1% -> in basis points: -100, -50, +50, +100)
  const handleAutoStepBp = (catId: number, deltaBp: number) => {
    setAutoDrafts((prev) => {
      const cur = prev[catId] || { bp: 0, period: "monthly", inputStr: "" };
      const nextBp = Math.max(0, Math.min(10000, cur.bp + deltaBp));
      return {
        ...prev,
        [catId]: {
          ...cur,
          bp: nextBp,
          inputStr: nextBp > 0 ? (nextBp / 100).toString() : "",
        },
      };
    });
  };

  // Direct input for Auto Allocation percent (snaps to 0.5% = 50 bp precision)
  const handleAutoPercentInput = (catId: number, rawVal: string) => {
    const normalized = rawVal.replace(",", ".");
    if (normalized.trim() === "") {
      setAutoDrafts((prev) => ({
        ...prev,
        [catId]: {
          ...(prev[catId] || { period: "monthly" }),
          bp: 0,
          inputStr: "",
        },
      }));
      return;
    }

    const parsed = parseFloat(normalized);
    if (isNaN(parsed) || parsed < 0) {
      return;
    }
    const clampedPct = Math.min(100, Math.max(0, parsed));
    // Snap to 0.5% (50 basis points)
    const snappedBp = Math.round(clampedPct * 2) * 50;

    setAutoDrafts((prev) => ({
      ...prev,
      [catId]: {
        ...(prev[catId] || { period: "monthly" }),
        bp: snappedBp,
        inputStr: rawVal,
      },
    }));
  };

  // Toggle period inside Auto Allocation dialog
  const handleAutoPeriodToggle = (catId: number, period: "weekly" | "monthly") => {
    setAutoDrafts((prev) => {
      const cur = prev[catId] || { bp: 0, period: "monthly", inputStr: "" };
      return {
        ...prev,
        [catId]: {
          ...cur,
          period,
        },
      };
    });
  };

  // Apply Auto Allocation -> save_allocation_percents & load into Budget drafts
  const handleApplyAutoAllocation = async () => {
    if (income <= 0) {
      showToast(t("budget_auto_no_income_error"), "error");
      return;
    }

    try {
      setIsApplyingAuto(true);
      const previewInputs: AutoAllocationInputItem[] = categories.map((cat) => {
        const d = autoDrafts[cat.category_id];
        return {
          category_id: cat.category_id,
          bp: d ? d.bp : 0,
          period: d ? d.period : "monthly",
        };
      });

      const finalPreview = await invoke<AutoAllocationPreview>("preview_auto_allocation", {
        income,
        items: previewInputs,
      });

      if (finalPreview.error) {
        showToast(finalPreview.error, "error");
        return;
      }

      const savePercentItems: AllocationPercentItem[] = previewInputs.map((i) => ({
        category_id: i.category_id,
        bp: i.bp,
      }));

      await invoke("save_allocation_percents", { items: savePercentItems });

      // Apply only non-zero allocated items into Budget page drafts
      // Categories with 0% are skipped so they remain untouched / 'unset'
      setDrafts((prev) => {
        const next = { ...prev };
        finalPreview.items.forEach((item) => {
          next[item.category_id] = {
            period: item.period,
            amount: item.amount,
          };
        });
        return next;
      });

      setIsAutoModalOpen(false);
      showToast(t("budget_auto_loaded_toast"), "info");
    } catch (e) {
      showToast("Gagal menerapkan alokasi otomatis: " + String(e), "error");
    } finally {
      setIsApplyingAuto(false);
    }
  };

  // Check if draft has unsaved changes
  const isDirty = useMemo(() => {
    return categories.some((c) => {
      const d = drafts[c.category_id];
      const s = savedItems[c.category_id];
      if (!d || !s) return false;
      return d.amount !== s.amount || d.period !== s.period;
    });
  }, [categories, drafts, savedItems]);

  // Debounced live preview call to Rust preview_envelope (200 ms)
  useEffect(() => {
    const timer = setTimeout(async () => {
      const draftList = Object.entries(drafts).map(([catId, d]) => ({
        category_id: Number(catId),
        period: d.period,
        amount: d.amount,
      }));
      if (draftList.length === 0) return;

      try {
        const res = await invoke<EnvelopePreview>("preview_envelope", {
          income,
          drafts: draftList,
        });
        setPreview(res);
      } catch (e) {
        console.error("preview_envelope failed:", e);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [drafts, income]);

  // Change amount in draft
  const handleAmountChange = (catId: number, val: number) => {
    setDrafts((prev) => ({
      ...prev,
      [catId]: {
        period: prev[catId]?.period || "monthly",
        amount: Math.max(0, val),
      },
    }));
  };

  // Step +/- amount
  const handleStep = (catId: number, delta: number) => {
    setDrafts((prev) => {
      const cur = prev[catId] || { period: "monthly", amount: 0 };
      return {
        ...prev,
        [catId]: {
          ...cur,
          amount: Math.max(0, cur.amount + delta),
        },
      };
    });
  };

  // Toggle period in draft
  const handlePeriodToggle = (catId: number, period: "weekly" | "monthly") => {
    setDrafts((prev) => {
      const cur = prev[catId] || { period: "monthly", amount: 0 };
      return {
        ...prev,
        [catId]: {
          ...cur,
          period,
        },
      };
    });
  };

  // Discard draft changes
  const handleDiscard = () => {
    setDrafts({ ...savedItems });
    showToast(t("budget_discard_changes"), "info");
  };

  // Save monthly income
  const handleSaveIncome = async () => {
    const parsed = parseInt(incomeInput, 10);
    if (isNaN(parsed) || parsed < 0) {
      showToast("Nominal pendapatan tidak valid", "error");
      return;
    }
    try {
      await invoke("set_monthly_income", { amount: parsed });
      setIncome(parsed);
      setIsEditingIncome(false);
      triggerRefresh();
      showToast(t("toast_saved"), "success");
    } catch (e) {
      showToast("Gagal menyimpan pendapatan: " + String(e), "error");
    }
  };

  // Execute database save for changed rows
  const executeSave = async (
    itemsToSave: { category_id: number; period: "weekly" | "monthly"; amount: number }[]
  ) => {
    try {
      setIsSaving(true);
      for (const item of itemsToSave) {
        await invoke("set_category_budget", {
          categoryId: item.category_id,
          period: item.period,
          amount: item.amount,
        });
      }
      // Update saved items map
      const newSaved = { ...savedItems };
      itemsToSave.forEach((item) => {
        newSaved[item.category_id] = { period: item.period, amount: item.amount };
      });
      setSavedItems(newSaved);
      triggerRefresh();
      showToast(t("budget_save_success"), "success");
    } catch (e) {
      showToast("Gagal menyimpan anggaran: " + String(e), "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Save All button click with carry-over confirmation
  const handleSaveClick = async () => {
    if (preview?.exceeds_income) {
      showToast(t("budget_error_exceeded"), "error");
      return;
    }

    const changed = categories.filter((c) => {
      const d = drafts[c.category_id];
      const s = savedItems[c.category_id];
      if (!d || !s) return false;
      return d.amount !== s.amount || d.period !== s.period;
    });

    if (changed.length === 0) return;

    // Check if any changed category has carry_in > 0
    const allOverview = [
      ...(budgetOverview?.fixed.categories || []),
      ...(budgetOverview?.wants.categories || []),
      ...(budgetOverview?.savings.categories || []),
    ];

    let carryTotal = 0;
    changed.forEach((c) => {
      const item = allOverview.find((o) => o.category_id === c.category_id);
      if (item && item.carry_in > 0) {
        carryTotal += item.carry_in;
      }
    });

    const savePayload = changed.map((c) => ({
      category_id: c.category_id,
      period: drafts[c.category_id].period,
      amount: drafts[c.category_id].amount,
    }));

    if (carryTotal > 0) {
      setConfirmCarryAmount(carryTotal);
      setPendingSaveList(savePayload);
      setIsConfirmOpen(true);
    } else {
      await executeSave(savePayload);
    }
  };

  // Grouping categories
  const fixedCategories = categories.filter((c) => c.group_type === "fixed");
  const wantsCategories = categories.filter((c) => c.group_type === "wants");

  // Lookup overview item for category
  const getOverviewItem = (catId: number) => {
    if (!budgetOverview) return null;
    const all = [
      ...budgetOverview.fixed.categories,
      ...budgetOverview.wants.categories,
      ...budgetOverview.savings.categories,
    ];
    return all.find((c) => c.category_id === catId) || null;
  };

  // Check if any category has status 'unset'
  const hasUnsetCategories = useMemo(() => {
    if (!budgetOverview) {
      return categories.some((c) => (savedItems[c.category_id]?.amount ?? 0) === 0);
    }
    const all = [
      ...budgetOverview.fixed.categories,
      ...budgetOverview.wants.categories,
    ];
    return all.some((c) => c.status === "unset" || c.base_limit === 0);
  }, [budgetOverview, categories, savedItems]);

  // Helper date range formatters
  const formatWeekRange = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return "";
    try {
      const [, sm, sd] = startStr.split("-").map(Number);
      const [, em, ed] = endStr.split("-").map(Number);
      const monthsId = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      const monthsEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const mList = language === "en" ? monthsEn : monthsId;
      const sMonth = mList[sm - 1];
      const eMonth = mList[em - 1];
      if (sMonth === eMonth) {
        return `${sd}-${ed} ${sMonth}`;
      }
      return `${sd} ${sMonth} - ${ed} ${eMonth}`;
    } catch {
      return `${startStr} - ${endStr}`;
    }
  };

  const formatMonthYear = (startStr: string) => {
    if (!startStr) return "";
    try {
      const [sy, sm] = startStr.split("-").map(Number);
      const monthsId = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      const monthsEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const mList = language === "en" ? monthsEn : monthsId;
      return `${mList[sm - 1]} ${sy}`;
    } catch {
      return startStr;
    }
  };

  // Values from live preview or fallback
  const totalAllocated = preview ? preview.total_monthly_equivalent : 0;
  const savingsRemaining = preview ? preview.savings_target : income;
  const savingsRatio = preview ? preview.savings_ratio * 100 : 0;
  const isExceeded = preview?.exceeds_income ?? false;
  const meetsGuideline = preview?.meets_guideline ?? false;

  // Auto allocation summary values (purely from Rust preview_auto_allocation)
  const autoTotalBp = autoPreview?.total_bp ?? 0;
  const autoUsedPct = autoTotalBp / 100;
  const autoUnallocatedPct = (autoPreview?.unallocated_bp ?? 0) / 100;
  const isAutoOver80 = autoTotalBp > 8000;
  const isAutoInvalid = isAutoOver80 || Boolean(autoPreview?.error) || income <= 0;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Confirmation Modal for Carry-over Reset */}
      <ConfirmationModal
        isOpen={isConfirmOpen}
        title={t("budget_confirm_carry_reset_title")}
        description={t("budget_confirm_carry_reset_desc").replace(
          "{amount}",
          `Rp ${confirmCarryAmount.toLocaleString("id-ID")}`
        )}
        confirmLabel={t("budget_confirm_continue")}
        cancelLabel={t("form_cancel")}
        confirmVariant="primary"
        onConfirm={async () => {
          setIsConfirmOpen(false);
          await executeSave(pendingSaveList);
        }}
        onCancel={() => {
          setIsConfirmOpen(false);
          setPendingSaveList([]);
        }}
      />

      {/* Header with Alokasi Otomatis Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-primary mb-2">{t("budget_title")}</h2>
          <p className="text-sm text-on-surface-variant">{t("budget_desc")}</p>
        </div>

        <button
          type="button"
          onClick={openAutoAllocationModal}
          className="self-start sm:self-auto px-5 py-3 rounded-2xl bg-primary text-on-primary font-bold text-xs sm:text-sm shadow-sm hover:bg-primary-container hover:text-on-primary-container transition-all flex items-center gap-2 active:scale-95"
        >
          <span className="material-symbols-rounded text-lg">auto_awesome</span>
          {t("budget_auto_allocate_btn")}
        </button>
      </div>

      {/* Banner Ajakan dari Status 'unset' */}
      {hasUnsetCategories && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <span className="material-symbols-rounded text-xl">lightbulb</span>
            </div>
            <p className="text-xs sm:text-sm text-amber-950 font-medium">
              {t("budget_unset_banner_desc")}
            </p>
          </div>
          <button
            type="button"
            onClick={openAutoAllocationModal}
            className="px-4 py-2 rounded-xl bg-amber-200/80 hover:bg-amber-300/80 text-amber-950 font-bold text-xs whitespace-nowrap transition-colors self-end sm:self-auto flex items-center gap-1.5"
          >
            <span className="material-symbols-rounded text-base">auto_awesome</span>
            {t("budget_auto_allocate_btn")}
          </button>
        </div>
      )}

      {/* Uang Bulanan / Pendapatan Card */}
      <div className="bg-[#e2f5f1] rounded-3xl shadow-sm p-6 sm:p-8 relative overflow-hidden border border-teal-200/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-rounded text-teal-800 text-xl">payments</span>
              <p className="text-xs font-bold text-teal-800 uppercase tracking-wider">
                {t("budget_income_title")}
              </p>
            </div>
            {isEditingIncome ? (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  min="0"
                  value={incomeInput}
                  onChange={(e) => setIncomeInput(e.target.value)}
                  className="p-2 border rounded-xl bg-surface text-lg font-bold w-48 text-teal-950 font-mono"
                />
                <button
                  onClick={handleSaveIncome}
                  className="px-4 py-2 bg-teal-800 text-white rounded-xl text-xs font-bold hover:bg-teal-900 transition-colors"
                >
                  {t("form_save")}
                </button>
                <button
                  onClick={() => setIsEditingIncome(false)}
                  className="px-3 py-2 bg-surface text-teal-800 rounded-xl text-xs font-bold hover:bg-teal-50 transition-colors"
                >
                  {t("form_cancel")}
                </button>
              </div>
            ) : (
              <div className="flex items-baseline gap-3">
                <p className="text-3xl sm:text-4xl font-black text-teal-950 font-mono">
                  Rp {income.toLocaleString("id-ID")}
                </p>
                <button
                  onClick={() => {
                    setIncomeInput(income.toString());
                    setIsEditingIncome(true);
                  }}
                  className="text-xs font-bold text-teal-800 hover:text-teal-950 underline underline-offset-4"
                >
                  Ubah
                </button>
              </div>
            )}
            <p className="text-xs text-teal-900/80 mt-1 font-medium">{t("budget_income_desc")}</p>
          </div>
        </div>
      </div>

      {/* STICKY LIVE SUMMARY PANEL */}
      <div className="sticky top-4 z-30 bg-surface-container-lowest/95 backdrop-blur-md rounded-2xl p-5 shadow-lg border border-surface-container-high transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 flex-1">
            {/* Total Jatah Setara Bulanan */}
            <div>
              <p className="text-xs text-on-surface-variant font-medium mb-1">
                {t("budget_total_allocated")}
              </p>
              <p className="text-2xl font-black text-on-surface font-mono">
                Rp {totalAllocated.toLocaleString("id-ID")}
              </p>
            </div>

            {/* Sisa untuk Tabungan (Live) */}
            <div>
              <p className="text-xs text-on-surface-variant font-medium mb-1">
                {t("budget_savings_remaining")}
              </p>
              <p
                className={`text-2xl font-black font-mono ${
                  savingsRemaining >= 0 ? "text-primary" : "text-rose-600"
                }`}
              >
                Rp {savingsRemaining.toLocaleString("id-ID")}
              </p>
            </div>

            {/* Rasio Tabungan & Status Badge */}
            <div className="flex flex-col justify-center">
              <p className="text-xs text-on-surface-variant font-medium mb-1">
                {t("budget_savings_ratio")}: <span className="font-bold">{savingsRatio.toFixed(1)}%</span>
              </p>
              <div>
                {isExceeded ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                    <span className="material-symbols-rounded text-sm">warning</span>
                    {t("budget_badge_exceeded")}
                  </span>
                ) : meetsGuideline ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <span className="material-symbols-rounded text-sm">check_circle</span>
                    {t("budget_badge_healthy")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    <span className="material-symbols-rounded text-sm">info</span>
                    {t("budget_badge_warning")}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons (Save Changes & Discard) */}
          <div className="flex items-center gap-3 pt-2 lg:pt-0 border-t lg:border-t-0 border-surface-container-high justify-end">
            {isDirty && (
              <button
                type="button"
                onClick={handleDiscard}
                disabled={isSaving}
                className="px-4 py-2.5 rounded-full font-bold text-xs bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-colors"
              >
                {t("budget_discard_changes")}
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveClick}
              disabled={isExceeded || isSaving || !isDirty}
              className={`px-6 py-2.5 rounded-full font-bold text-xs shadow-md transition-all flex items-center gap-2 whitespace-nowrap ${
                isExceeded || isSaving || !isDirty
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed opacity-60 shadow-none"
                  : "bg-teal-900 text-white hover:bg-teal-950 hover:shadow-lg active:scale-95"
              }`}
            >
              {isSaving && <span className="material-symbols-rounded text-sm animate-spin">sync</span>}
              <span className="material-symbols-rounded text-base">save</span>
              {t("budget_save_changes")}
            </button>
          </div>
        </div>

        {isExceeded && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
            <span className="material-symbols-rounded text-base">error</span>
            {t("budget_error_exceeded")}
          </div>
        )}
      </div>

      {/* RENDER CATEGORY GROUP HELPER */}
      {["fixed", "wants"].map((groupKey) => {
        const groupCats = groupKey === "fixed" ? fixedCategories : wantsCategories;
        const isFixed = groupKey === "fixed";
        const title = isFixed ? t("budget_group_fixed") : t("budget_group_wants");
        const iconName = isFixed ? "home" : "shopping_cart";
        const accentBg = isFixed ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700";
        const groupTitleColor = isFixed ? "text-rose-950" : "text-amber-950";

        return (
          <section key={groupKey} className="space-y-4">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg ${accentBg} flex items-center justify-center`}>
                <span className="material-symbols-rounded text-lg">{iconName}</span>
              </div>
              <h3 className={`text-lg font-bold ${groupTitleColor}`}>{title}</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupCats.map((cat) => {
                const draft = drafts[cat.category_id] || { period: "monthly", amount: 0 };
                const overviewItem = getOverviewItem(cat.category_id);
                const icon = getCategoryIcon(cat.category_name, groupKey);

                // Information from overview
                const isWeekly = draft.period === "weekly";
                const spent = overviewItem ? overviewItem.spent_in_period : 0;
                const remaining = overviewItem ? overviewItem.remaining : 0;
                const carryIn = overviewItem ? overviewItem.carry_in : 0;
                const status =
                  overviewItem?.status || (draft.amount === 0 ? "unset" : "aman");

                // Status styling
                const progressBarColor =
                  status === "over"
                    ? "bg-rose-500"
                    : status === "waspada"
                    ? "bg-amber-500"
                    : status === "unset"
                    ? "bg-gray-300"
                    : "bg-emerald-500";

                // Window label
                const windowLabel = isWeekly
                  ? overviewItem
                    ? `${t("budget_window_this_week")} · ${formatWeekRange(
                        overviewItem.window_start,
                        overviewItem.window_end
                      )}`
                    : t("budget_window_this_week")
                  : overviewItem
                  ? `${t("budget_window_this_month")} · ${formatMonthYear(overviewItem.window_start)}`
                  : t("budget_window_this_month");

                // Progress percentage from backend
                const progressWidth =
                  overviewItem && overviewItem.effective_limit > 0
                    ? Math.min(100, Math.max(0, overviewItem.percentage))
                    : 0;

                // Monthly equivalent from Rust preview_envelope response
                const monthlyEquiv =
                  preview?.category_equivalents?.[cat.category_id] ?? draft.amount;

                return (
                  <div
                    key={cat.category_id}
                    className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm border border-surface-container-high hover:border-primary/30 transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Row: Category icon, Name, and Status Badge */}
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl ${accentBg} flex items-center justify-center`}>
                            <span className="material-symbols-rounded">{icon}</span>
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-on-surface">{cat.category_name}</h4>
                            <p className="text-[11px] text-on-surface-variant font-medium">{windowLabel}</p>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                            status === "over"
                              ? "bg-rose-100 text-rose-800 border-rose-300"
                              : status === "waspada"
                              ? "bg-amber-100 text-amber-800 border-amber-300"
                              : status === "unset"
                              ? "bg-surface-container text-on-surface-variant border-surface-container-high"
                              : "bg-emerald-100 text-emerald-800 border-emerald-300"
                          }`}
                        >
                          {status === "unset" ? t("budget_status_unset") : status.toUpperCase()}
                        </span>
                      </div>

                      {/* Details: Base + Carry (if weekly & carry > 0) */}
                      {isWeekly && carryIn > 0 && overviewItem && (
                        <p className="text-[11px] font-semibold text-teal-800 mb-1">
                          {t("budget_hint_base_plus_carry")
                            .replace("{base}", `Rp${overviewItem.base_limit.toLocaleString("id-ID")}`)
                            .replace("{carry}", `Rp${carryIn.toLocaleString("id-ID")}`)}
                        </p>
                      )}

                      {/* Spent & Remaining */}
                      <div className="flex justify-between text-xs text-on-surface-variant font-medium mb-1.5">
                        <span>
                          {t("budget_spent_label")} Rp {spent.toLocaleString("id-ID")}
                        </span>
                        <span
                          className={`font-bold ${
                            status === "unset"
                              ? "text-on-surface-variant"
                              : remaining < 0
                              ? "text-rose-600"
                              : "text-on-surface"
                          }`}
                        >
                          {status === "unset"
                            ? t("budget_status_unset")
                            : `${t("budget_remaining_label")} Rp ${remaining.toLocaleString("id-ID")}`}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden mb-4">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${progressBarColor}`}
                          style={{ width: `${progressWidth}%` }}
                        />
                      </div>
                    </div>

                    {/* Bottom Controls: Segmented Chip & Input */}
                    <div className="space-y-3 pt-2 border-t border-surface-container-high/60">
                      {/* Segmented Chip "Mingguan | Bulanan" */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                          Periode
                        </span>
                        <div className="inline-flex p-0.5 bg-surface-container rounded-xl border border-surface-container-high text-xs">
                          <button
                            type="button"
                            onClick={() => handlePeriodToggle(cat.category_id, "weekly")}
                            className={`px-3 py-1 rounded-lg font-bold transition-all ${
                              draft.period === "weekly"
                                ? "bg-primary text-on-primary shadow-xs"
                                : "text-on-surface-variant hover:text-on-surface"
                            }`}
                          >
                            {t("budget_period_weekly")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePeriodToggle(cat.category_id, "monthly")}
                            className={`px-3 py-1 rounded-lg font-bold transition-all ${
                              draft.period === "monthly"
                                ? "bg-primary text-on-primary shadow-xs"
                                : "text-on-surface-variant hover:text-on-surface"
                            }`}
                          >
                            {t("budget_period_monthly")}
                          </button>
                        </div>
                      </div>

                      {/* Nominal Jatah: Step Buttons & Input */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStep(cat.category_id, -10000)}
                          className="px-2 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
                          title="- Rp10.000"
                        >
                          -10k
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStep(cat.category_id, -5000)}
                          className="px-2 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
                          title="- Rp5.000"
                        >
                          -5k
                        </button>

                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface-variant">
                            Rp
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="5000"
                            value={draft.amount || ""}
                            onChange={(e) =>
                              handleAmountChange(cat.category_id, parseInt(e.target.value, 10) || 0)
                            }
                            className="w-full pl-8 pr-2 py-1.5 text-xs sm:text-sm font-bold rounded-xl border border-surface-container-high bg-surface text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                            placeholder="0"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleStep(cat.category_id, 5000)}
                          className="px-2 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
                          title="+ Rp5.000"
                        >
                          +5k
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStep(cat.category_id, 10000)}
                          className="px-2 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
                          title="+ Rp10.000"
                        >
                          +10k
                        </button>
                      </div>

                      {/* Hint for Weekly Categories: ≈ Rp xxx/bulan */}
                      {isWeekly && (
                        <p className="text-[11px] text-on-surface-variant font-medium text-right">
                          {t("budget_hint_monthly_equiv").replace(
                            "{amount}",
                            `Rp ${monthlyEquiv.toLocaleString("id-ID")}`
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* DIALOG ALOKASI OTOMATIS */}
      {isAutoModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-4xl shadow-2xl border border-surface-container-high overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Dialog Header */}
            <div className="px-6 py-5 border-b border-surface-container-high bg-surface-container/30 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary-container text-on-primary-container flex items-center justify-center">
                  <span className="material-symbols-rounded text-xl">auto_awesome</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-on-surface">
                    {t("budget_auto_modal_title")}
                  </h3>
                  <p className="text-xs text-on-surface-variant">
                    {t("budget_auto_modal_desc")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAutoModalOpen(false)}
                className="w-9 h-9 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant"
              >
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>

            {/* Income, Locked Savings 20%, and 80% Pool Banner */}
            <div className="px-6 py-4 bg-[#e2f5f1]/70 border-b border-teal-200/60 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white/90 rounded-2xl p-3.5 border border-teal-200/60">
                <p className="text-[11px] font-bold text-teal-800 uppercase tracking-wider">
                  {t("budget_income_title")}
                </p>
                <p className="text-lg font-black text-teal-950 font-mono mt-0.5">
                  Rp {income.toLocaleString("id-ID")}
                </p>
              </div>

              <div className="bg-blue-50/90 rounded-2xl p-3.5 border border-blue-200/70 flex items-center gap-2.5">
                <span className="material-symbols-rounded text-blue-700 text-xl">lock</span>
                <div>
                  <p className="text-xs font-bold text-blue-950">
                    {t("budget_auto_locked_savings").replace(
                      "{amount}",
                      `Rp ${(autoPreview?.locked_savings_amount ?? 0).toLocaleString("id-ID")}`
                    )}
                  </p>
                </div>
              </div>

              <div className="bg-emerald-50/90 rounded-2xl p-3.5 border border-emerald-200/70 flex items-center gap-2.5">
                <span className="material-symbols-rounded text-emerald-700 text-xl">pie_chart</span>
                <div>
                  <p className="text-xs font-bold text-emerald-950">
                    {t("budget_auto_pool_80").replace(
                      "{amount}",
                      `Rp ${(autoPreview?.pool_amount ?? 0).toLocaleString("id-ID")}`
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Scrollable Body: Bulanan Tetap & Wants */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {income <= 0 && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                  <span className="material-symbols-rounded text-base">error</span>
                  {t("budget_auto_no_income_error")}
                </div>
              )}

              {["fixed", "wants"].map((groupKey) => {
                const groupCats = groupKey === "fixed" ? fixedCategories : wantsCategories;
                const isFixed = groupKey === "fixed";
                const title = isFixed ? t("budget_group_fixed") : t("budget_group_wants");
                const iconName = isFixed ? "home" : "shopping_cart";
                const accentBg = isFixed
                  ? "bg-rose-100 text-rose-700"
                  : "bg-amber-100 text-amber-700";
                const groupTitleColor = isFixed ? "text-rose-950" : "text-amber-950";

                return (
                  <div key={groupKey} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg ${accentBg} flex items-center justify-center`}>
                        <span className="material-symbols-rounded text-base">{iconName}</span>
                      </div>
                      <h4 className={`text-sm font-bold ${groupTitleColor}`}>{title}</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {groupCats.map((cat) => {
                        const ad = autoDrafts[cat.category_id] || {
                          bp: 0,
                          period: "monthly",
                          inputStr: "",
                        };
                        const icon = getCategoryIcon(cat.category_name, groupKey);
                        const previewItem = autoPreview?.items.find(
                          (i) => i.category_id === cat.category_id
                        );

                        return (
                          <div
                            key={cat.category_id}
                            className={`p-4 rounded-2xl border transition-all ${
                              ad.bp > 0
                                ? "bg-surface border-primary/40 shadow-xs"
                                : "bg-surface-container-low/60 border-surface-container-high"
                            }`}
                          >
                            {/* Top row: Icon + Name + Period Segmented Chip */}
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-9 h-9 rounded-xl ${accentBg} flex items-center justify-center shrink-0`}
                                >
                                  <span className="material-symbols-rounded text-lg">{icon}</span>
                                </div>
                                <span className="font-bold text-sm text-on-surface">
                                  {cat.category_name}
                                </span>
                              </div>

                              <div className="inline-flex p-0.5 bg-surface-container rounded-xl border border-surface-container-high text-[11px]">
                                <button
                                  type="button"
                                  onClick={() => handleAutoPeriodToggle(cat.category_id, "weekly")}
                                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                                    ad.period === "weekly"
                                      ? "bg-primary text-on-primary shadow-xs"
                                      : "text-on-surface-variant hover:text-on-surface"
                                  }`}
                                >
                                  {t("budget_period_weekly")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAutoPeriodToggle(cat.category_id, "monthly")}
                                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                                    ad.period === "monthly"
                                      ? "bg-primary text-on-primary shadow-xs"
                                      : "text-on-surface-variant hover:text-on-surface"
                                  }`}
                                >
                                  {t("budget_period_monthly")}
                                </button>
                              </div>
                            </div>

                            {/* Percent Stepper (-1%, -0.5%, input, +0.5%, +1%) */}
                            <div className="flex items-center gap-1.5 mb-2">
                              <button
                                type="button"
                                onClick={() => handleAutoStepBp(cat.category_id, -100)}
                                className="px-2 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
                              >
                                -1%
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAutoStepBp(cat.category_id, -50)}
                                className="px-2 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
                              >
                                -0,5%
                              </button>

                              <div className="relative flex-1">
                                <input
                                  type="number"
                                  min="0"
                                  max="80"
                                  step="0.5"
                                  value={ad.inputStr}
                                  onChange={(e) =>
                                    handleAutoPercentInput(cat.category_id, e.target.value)
                                  }
                                  placeholder="0"
                                  className="w-full pl-3 pr-7 py-1.5 text-xs sm:text-sm font-bold rounded-xl border border-surface-container-high bg-surface text-on-surface text-center focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface-variant">
                                  %
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleAutoStepBp(cat.category_id, 50)}
                                className="px-2 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
                              >
                                +0,5%
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAutoStepBp(cat.category_id, 100)}
                                className="px-2 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
                              >
                                +1%
                              </button>
                            </div>

                            {/* Live Nominal Result from preview_auto_allocation */}
                            <div className="text-right">
                              {previewItem && ad.bp > 0 ? (
                                <span className="text-xs font-bold text-primary font-mono">
                                  {ad.period === "weekly"
                                    ? t("budget_auto_weekly_preview")
                                        .replace(
                                          "{amount}",
                                          `Rp ${previewItem.amount.toLocaleString("id-ID")}`
                                        )
                                        .replace(
                                          "{equiv}",
                                          `Rp ${previewItem.monthly_equivalent.toLocaleString("id-ID")}`
                                        )
                                    : t("budget_auto_monthly_preview").replace(
                                        "{amount}",
                                        `Rp ${previewItem.amount.toLocaleString("id-ID")}`
                                      )}
                                </span>
                              ) : (
                                <span className="text-[11px] text-on-surface-variant italic">
                                  {t("budget_auto_zero_skipped")}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sticky Dialog Footer: Counter "Terpakai X% / 80%" & Action Buttons */}
            <div className="px-6 py-4 border-t border-surface-container-high bg-surface-container-lowest flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold border ${
                    isAutoOver80
                      ? "bg-rose-100 text-rose-800 border-rose-300"
                      : "bg-emerald-100 text-emerald-800 border-emerald-300"
                  }`}
                >
                  {t("budget_auto_used_counter").replace("{used}", autoUsedPct.toString())}
                </span>

                {isAutoOver80 ? (
                  <span className="text-xs font-bold text-rose-600 flex items-center gap-1">
                    <span className="material-symbols-rounded text-sm">warning</span>
                    {autoPreview?.error || t("budget_auto_exceeded_error")}
                  </span>
                ) : (
                  autoUnallocatedPct > 0 && (
                    <span className="text-xs font-medium text-teal-800">
                      {t("budget_auto_unallocated_note").replace(
                        "{rem}",
                        autoUnallocatedPct.toString()
                      )}
                    </span>
                  )
                )}
              </div>

              <div className="flex items-center gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setIsAutoModalOpen(false)}
                  className="px-4 py-2.5 rounded-full font-bold text-xs bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-colors"
                >
                  {t("form_cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleApplyAutoAllocation}
                  disabled={isAutoInvalid || isApplyingAuto}
                  className={`px-6 py-2.5 rounded-full font-bold text-xs shadow-md transition-all flex items-center gap-2 ${
                    isAutoInvalid || isApplyingAuto
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed opacity-60 shadow-none"
                      : "bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container active:scale-95"
                  }`}
                >
                  <span className="material-symbols-rounded text-base">auto_awesome</span>
                  {t("budget_auto_apply_btn")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
