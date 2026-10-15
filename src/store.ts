import { create } from "zustand";

export type Account = {
  id: number;
  name: string;
  account_type: "cash" | "bank" | "ewallet" | "savings";
  opening_balance: number;
  current_balance: number;
  icon: string;
  color: string;
  is_default: boolean;
  is_archived: boolean;
  is_savings: boolean;
  transaction_count: number;
  created_at: string;
};

export type Transfer = {
  id: number;
  from_account_id: number;
  from_account_name: string;
  to_account_id: number;
  to_account_name: string;
  amount: number;
  transfer_date: string;
  note?: string | null;
  saving_goal_id?: number | null;
  saving_goal_name?: string | null;
  saving_effect?: "deposit" | "withdrawal" | null;
  created_at: string;
};

export type Category = {
  id: number;
  name: string;
  group_type: string | null;
  transaction_type: "income" | "expense";
};

export type Transaction = {
  id: number;
  amount: number;
  transaction_type: "income" | "expense";
  category_id: number | null;
  transaction_date: string;
  note?: string;
  source: string;
  saving_goal_id: number | null;
  related_debt_id?: number | null;
  account_id?: number | null;
  account_name?: string | null;
};

export type BalanceResult = {
  total_income: number;
  total_expense: number;
  balance: number;
  monthly_income: number;
  monthly_expense: number;
  monthly_balance: number;
  available_balance: number;
  savings_balance: number;
  monthly_savings_deposit: number;
};

export type BudgetRealization = {
  needs_spent: number;
  wants_spent: number;
  savings_amount: number;
};

export type IdealAllocation = {
  needs: number;
  wants: number;
  savings: number;
};

export type BudgetStatus = {
  language: string;
  reminder_enabled: boolean;
  reminder_time: string;
  ideal: IdealAllocation;
  real: BudgetRealization;
  income: number;
};

export type CategoryBudgetItem = {
  category_id: number;
  category_name: string;
  group_type: string;
  period: "weekly" | "monthly";
  base_limit: number;
  carry_in: number;
  effective_limit: number;
  spent_in_period: number;
  remaining: number;
  percentage: number;
  status: "aman" | "waspada" | "over" | "unset";
  window_start: string;
  window_end: string;
  monthly_limit: number;
  spent: number;
};

export type EnvelopePreview = {
  total_monthly_equivalent: number;
  savings_target: number;
  savings_ratio: number;
  meets_guideline: boolean;
  exceeds_income: boolean;
  category_equivalents?: Record<number, number>;
};

export type AutoAllocationInputItem = {
  category_id: number;
  bp: number;
  period: "weekly" | "monthly";
};

export type AutoAllocationOutputItem = {
  category_id: number;
  period: "weekly" | "monthly";
  amount: number;
  monthly_equivalent: number;
};

export type AutoAllocationPreview = {
  items: AutoAllocationOutputItem[];
  total_bp: number;
  locked_savings_amount: number;
  pool_amount: number;
  unallocated_bp: number;
  error: string | null;
};

export type AllocationPercentItem = {
  category_id: number;
  bp: number;
};

export type CategoryBudgetSetting = {
  category_id: number;
  category_name: string;
  group_type: string | null;
  limit_amount: number;
  period: "weekly" | "monthly";
  anchor_date: string | null;
  monthly_limit: number;
};

export type GroupBudgetOverview = {
  group_type: string;
  total_limit: number;
  total_spent: number;
  percentage: number;
  categories: CategoryBudgetItem[];
};

export type BudgetOverview = {
  monthly_income: number;
  fixed: GroupBudgetOverview;
  wants: GroupBudgetOverview;
  savings: GroupBudgetOverview;
  savings_target: number;
  savings_ratio: number;
  meets_guideline: boolean;
};

export type SavingGoal = {
  id: number;
  name: string;
  target_amount: number;
  target_date: string | null;
  current_amount: number;
  account_id: number | null;
  account_name?: string | null;
};

export interface Debt {
  id: number;
  type: "receivable" | "payable";
  counterparty_name: string;
  amount: number;
  description?: string;
  due_date?: string;
  status: "unpaid" | "paid";
  settled_transaction_id?: number;
  created_at: string;
  paid_at?: string;
}

type State = {
  language: "id" | "en";
  setLanguage: (lang: "id" | "en") => void;
  categories: Category[];
  transactions: Transaction[];
  transfers: Transfer[];
  balance: BalanceResult | null;
  budgetStatus: BudgetStatus | null;
  budgetOverview: BudgetOverview | null;
  setCategories: (categories: Category[]) => void;
  setTransactions: (transactions: Transaction[]) => void;
  setTransfers: (transfers: Transfer[]) => void;
  setBalance: (bal: BalanceResult) => void;
  setBudgetStatus: (bs: BudgetStatus) => void;
  setBudgetOverview: (bo: BudgetOverview | null) => void;
  refreshFlag: number;
  triggerRefresh: () => void;
  fintelAdvice: string | null;
  setFintelAdvice: (insight: string | null) => void;
  savingGoals: SavingGoal[];
  setSavingGoals: (goals: SavingGoal[]) => void;
  accounts: Account[];
  setAccounts: (accounts: Account[]) => void;
};

export const useStore = create<State>((set) => ({
  language: "id",
  setLanguage: (lang) => set({ language: lang }),
  categories: [],
  transactions: [],
  transfers: [],
  balance: null,
  budgetStatus: null,
  budgetOverview: null,
  setCategories: (cats) => set({ categories: cats }),
  setTransactions: (txs) => set({ transactions: txs }),
  setTransfers: (trs) => set({ transfers: trs }),
  setBalance: (bal) => set({ balance: bal }),
  setBudgetStatus: (bs) => set({ budgetStatus: bs, language: bs.language as "id" | "en" }),
  setBudgetOverview: (bo) => set({ budgetOverview: bo }),
  refreshFlag: 0,
  triggerRefresh: () => set((state) => ({ refreshFlag: state.refreshFlag + 1 })),
  fintelAdvice: null,
  setFintelAdvice: (insight) => set({ fintelAdvice: insight }),
  savingGoals: [],
  setSavingGoals: (goals) => set({ savingGoals: goals }),
  accounts: [],
  setAccounts: (accs) => set({ accounts: accs }),
}));
