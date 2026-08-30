import { create } from "zustand";

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
};

export type BalanceResult = {
  total_income: number;
  total_expense: number;
  balance: number;
  monthly_income: number;
  monthly_expense: number;
  monthly_balance: number;
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
  ideal: IdealAllocation;
  real: BudgetRealization;
  income: number;
};

export type SavingGoal = {
  id: number;
  name: string;
  target_amount: number;
  target_date: string | null;
  current_amount: number;
};

type State = {
  categories: Category[];
  transactions: Transaction[];
  balance: BalanceResult | null;
  budgetStatus: BudgetStatus | null;
  setCategories: (categories: Category[]) => void;
  setTransactions: (transactions: Transaction[]) => void;
  setBalance: (bal: BalanceResult) => void;
  setBudgetStatus: (bs: BudgetStatus) => void;
  refreshFlag: number;
  triggerRefresh: () => void;
  fintelAdvice: string | null;
  setFintelAdvice: (insight: string | null) => void;
  savingGoals: SavingGoal[];
  setSavingGoals: (goals: SavingGoal[]) => void;
};

export const useStore = create<State>((set) => ({
  categories: [],
  transactions: [],
  balance: null,
  budgetStatus: null,
  setCategories: (cats) => set({ categories: cats }),
  setTransactions: (txs) => set({ transactions: txs }),
  setBalance: (bal) => set({ balance: bal }),
  setBudgetStatus: (bs) => set({ budgetStatus: bs }),
  refreshFlag: 0,
  triggerRefresh: () => set((state) => ({ refreshFlag: state.refreshFlag + 1 })),
  fintelAdvice: null,
  setFintelAdvice: (insight) => set({ fintelAdvice: insight }),
  savingGoals: [],
  setSavingGoals: (goals) => set({ savingGoals: goals })
}));

