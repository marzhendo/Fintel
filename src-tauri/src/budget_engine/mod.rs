use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Transaction {
    pub id: i64,
    pub amount: i64,
    pub transaction_type: String, // "income" or "expense"
    pub category_id: Option<i64>,
    pub note: Option<String>,
    pub transaction_date: String, // YYYY-MM-DD
    pub source: String,
    pub saving_goal_id: Option<i64>,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct BalanceResult {
    pub total_income: i64,
    pub total_expense: i64,
    pub balance: i64,
    pub monthly_income: i64,
    pub monthly_expense: i64,
    pub monthly_balance: i64,
}

pub fn calculate_balance(transactions: &[Transaction], current_month: &str) -> BalanceResult {
    let mut total_income = 0;
    let mut total_expense = 0;
    let mut monthly_income = 0;
    let mut monthly_expense = 0;

    for t in transactions {
        let is_monthly = t.transaction_date.starts_with(current_month);
        
        if t.transaction_type == "income" {
            total_income += t.amount;
            if is_monthly {
                monthly_income += t.amount;
            }
        } else if t.transaction_type == "expense" {
            total_expense += t.amount;
            if is_monthly {
                monthly_expense += t.amount;
            }
        }
    }

    BalanceResult {
        total_income,
        total_expense,
        balance: total_income - total_expense,
        monthly_income,
        monthly_expense,
        monthly_balance: monthly_income - monthly_expense,
    }
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct BudgetRatios {
    pub needs_pct: i64,
    pub wants_pct: i64,
    pub savings_pct: i64,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct IdealAllocation {
    pub needs: i64,
    pub wants: i64,
    pub savings: i64,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct BudgetRealization {
    pub needs_spent: i64,
    pub wants_spent: i64,
    pub savings_amount: i64,
}

/// Category type from the database, used to map group_types for realization
#[derive(Debug, Clone)]
pub struct CategoryInfo {
    pub id: i64,
    pub group_type: String, // "needs", "wants", "savings"
}

pub fn calculate_ideal_allocation(income: i64, ratios: &BudgetRatios) -> IdealAllocation {
    IdealAllocation {
        needs: (income * ratios.needs_pct) / 100,
        wants: (income * ratios.wants_pct) / 100,
        savings: (income * ratios.savings_pct) / 100,
    }
}

pub fn calculate_realization(transactions: &[Transaction], categories: &[CategoryInfo]) -> BudgetRealization {
    let mut needs_spent = 0;
    let mut wants_spent = 0;
    let mut savings_amount = 0;

    for tx in transactions {
        if tx.transaction_type == "expense" {
            if let Some(cat_id) = tx.category_id {
                // Find category group type
                if let Some(cat) = categories.iter().find(|c| c.id == cat_id) {
                    match cat.group_type.as_str() {
                        "needs" => needs_spent += tx.amount,
                        "wants" => wants_spent += tx.amount,
                        "savings" => savings_amount += tx.amount,
                        _ => {}
                    }
                }
            }
        }
    }

    BudgetRealization { needs_spent, wants_spent, savings_amount }
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct ChartDataPoint {
    pub label: String,
    pub income: i64,
    pub expense: i64,
}

pub fn aggregate_chart_data(transactions: &[Transaction], period_type: &str) -> Vec<ChartDataPoint> {
    use std::collections::BTreeMap;
    let mut map: BTreeMap<String, (i64, i64)> = BTreeMap::new();

    for tx in transactions {
        let label = if period_type == "monthly" {
            // "YYYY-MM-DD" -> "YYYY-MM"
            tx.transaction_date.chars().take(7).collect::<String>()
        } else {
            // daily -> "YYYY-MM-DD"
            tx.transaction_date.clone()
        };

        let entry = map.entry(label).or_insert((0, 0));
        if tx.transaction_type == "income" {
            entry.0 += tx.amount;
        } else if tx.transaction_type == "expense" {
            entry.1 += tx.amount;
        }
    }

    let mut result = Vec::new();
    for (label, (income, expense)) in map {
        result.push(ChartDataPoint { label, income, expense });
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aggregate_chart_data_daily() {
        let transactions = vec![
            Transaction { id: 1, amount: 50000, transaction_type: "income".to_string(), category_id: None, note: None, transaction_date: "2026-08-01".to_string() },
            Transaction { id: 2, amount: 15000, transaction_type: "expense".to_string(), category_id: None, note: None, transaction_date: "2026-08-01".to_string() },
            Transaction { id: 3, amount: 10000, transaction_type: "expense".to_string(), category_id: None, note: None, transaction_date: "2026-08-02".to_string() },
        ];

        let result = aggregate_chart_data(&transactions, "daily");
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].label, "2026-08-01");
        assert_eq!(result[0].income, 50000);
        assert_eq!(result[0].expense, 15000);
        
        assert_eq!(result[1].label, "2026-08-02");
        assert_eq!(result[1].income, 0);
        assert_eq!(result[1].expense, 10000);
    }

    #[test]
    fn test_aggregate_chart_data_monthly() {
        let transactions = vec![
            Transaction { id: 1, amount: 50000, transaction_type: "income".to_string(), category_id: None, note: None, transaction_date: "2026-08-01".to_string() },
            Transaction { id: 2, amount: 15000, transaction_type: "expense".to_string(), category_id: None, note: None, transaction_date: "2026-08-15".to_string() },
            Transaction { id: 3, amount: 10000, transaction_type: "expense".to_string(), category_id: None, note: None, transaction_date: "2026-09-02".to_string() },
        ];

        let result = aggregate_chart_data(&transactions, "monthly");
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].label, "2026-08");
        assert_eq!(result[0].income, 50000);
        assert_eq!(result[0].expense, 15000);
        
        assert_eq!(result[1].label, "2026-09");
        assert_eq!(result[1].income, 0);
        assert_eq!(result[1].expense, 10000);
    }

    // Existing F1 tests...
    #[test]
    fn test_calculate_balance_all_time() {
        let transactions = vec![
            Transaction { id: 1, amount: 50000, transaction_type: "income".to_string(), category_id: None, note: None, transaction_date: "2026-07-15".to_string() },
            Transaction { id: 2, amount: 15000, transaction_type: "expense".to_string(), category_id: None, note: None, transaction_date: "2026-07-20".to_string() },
            Transaction { id: 3, amount: 10000, transaction_type: "expense".to_string(), category_id: None, note: None, transaction_date: "2026-08-05".to_string() },
        ];

        let result = calculate_balance(&transactions, "2026-08");
        
        assert_eq!(result.total_income, 50000);
        assert_eq!(result.total_expense, 25000);
        assert_eq!(result.balance, 25000);
    }

    #[test]
    fn test_calculate_balance_monthly() {
        let transactions = vec![
            Transaction { id: 1, amount: 50000, transaction_type: "income".to_string(), category_id: None, note: None, transaction_date: "2026-07-15".to_string() },
            Transaction { id: 2, amount: 20000, transaction_type: "income".to_string(), category_id: None, note: None, transaction_date: "2026-08-01".to_string() },
            Transaction { id: 3, amount: 15000, transaction_type: "expense".to_string(), category_id: None, note: None, transaction_date: "2026-08-05".to_string() },
        ];

        let result = calculate_balance(&transactions, "2026-08");
        
        assert_eq!(result.monthly_income, 20000);
        assert_eq!(result.monthly_expense, 15000);
        assert_eq!(result.monthly_balance, 5000);
    }

    #[test]
    fn test_calculate_balance_negative() {
        let transactions = vec![
            Transaction { id: 1, amount: 10000, transaction_type: "income".to_string(), category_id: None, note: None, transaction_date: "2026-08-01".to_string() },
            Transaction { id: 2, amount: 15000, transaction_type: "expense".to_string(), category_id: None, note: None, transaction_date: "2026-08-05".to_string() },
        ];

        let result = calculate_balance(&transactions, "2026-08");
        
        assert_eq!(result.balance, -5000);
        assert_eq!(result.monthly_balance, -5000);
    }

    // F2 Tests
    #[test]
    fn test_ideal_allocation_standard() {
        let ratios = BudgetRatios { needs_pct: 50, wants_pct: 30, savings_pct: 20 };
        let ideal = calculate_ideal_allocation(5000000, &ratios);
        assert_eq!(ideal.needs, 2500000);
        assert_eq!(ideal.wants, 1500000);
        assert_eq!(ideal.savings, 1000000);
    }

    #[test]
    fn test_ideal_allocation_rounding() {
        let ratios = BudgetRatios { needs_pct: 50, wants_pct: 30, savings_pct: 20 };
        let ideal = calculate_ideal_allocation(3333333, &ratios);
        assert_eq!(ideal.needs, 1666666);
        assert_eq!(ideal.wants, 999999);
        assert_eq!(ideal.savings, 666666);
    }

    #[test]
    fn test_ideal_allocation_zero_ratios() {
        let ratios = BudgetRatios { needs_pct: 100, wants_pct: 0, savings_pct: 0 };
        let ideal = calculate_ideal_allocation(2000000, &ratios);
        assert_eq!(ideal.needs, 2000000);
        assert_eq!(ideal.wants, 0);
        assert_eq!(ideal.savings, 0);
    }

    #[test]
    fn test_realization_calculation() {
        let categories = vec![
            CategoryInfo { id: 1, group_type: "needs".to_string() },
            CategoryInfo { id: 2, group_type: "wants".to_string() },
            CategoryInfo { id: 3, group_type: "savings".to_string() },
        ];
        let transactions = vec![
            Transaction { id: 1, amount: 1500000, transaction_type: "expense".to_string(), category_id: Some(1), note: None, transaction_date: "2026-08-01".to_string() },
            Transaction { id: 2, amount: 500000, transaction_type: "expense".to_string(), category_id: Some(2), note: None, transaction_date: "2026-08-02".to_string() },
            Transaction { id: 3, amount: 1000000, transaction_type: "expense".to_string(), category_id: Some(3), note: None, transaction_date: "2026-08-03".to_string() },
            Transaction { id: 4, amount: 200000, transaction_type: "expense".to_string(), category_id: Some(2), note: None, transaction_date: "2026-08-04".to_string() },
            Transaction { id: 5, amount: 5000000, transaction_type: "income".to_string(), category_id: None, note: None, transaction_date: "2026-08-05".to_string() }, // Should be ignored
        ];
        let real = calculate_realization(&transactions, &categories);
        assert_eq!(real.needs_spent, 1500000);
        assert_eq!(real.wants_spent, 700000);
        assert_eq!(real.savings_amount, 1000000);
    }

    #[test]
    fn test_realization_missing_category_ignored() {
        let categories = vec![
            CategoryInfo { id: 1, group_type: "needs".to_string() },
        ];
        let transactions = vec![
            Transaction { id: 1, amount: 1000000, transaction_type: "expense".to_string(), category_id: Some(1), note: None, transaction_date: "2026-08-01".to_string() },
            Transaction { id: 2, amount: 500000, transaction_type: "expense".to_string(), category_id: Some(99), note: None, transaction_date: "2026-08-02".to_string() }, // Unmapped category ID
            Transaction { id: 3, amount: 500000, transaction_type: "expense".to_string(), category_id: None, note: None, transaction_date: "2026-08-02".to_string() }, // No category ID
        ];
        let real = calculate_realization(&transactions, &categories);
        assert_eq!(real.needs_spent, 1000000);
        assert_eq!(real.wants_spent, 0);
        assert_eq!(real.savings_amount, 0);
    }
}


#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SavingGoal {
    pub id: i64,
    pub name: String,
    pub target_amount: i64,
    pub target_date: Option<String>,
    pub current_amount: i64,
}

