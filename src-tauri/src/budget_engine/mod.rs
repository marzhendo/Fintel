use serde::{Deserialize, Serialize};
use chrono::{Datelike, NaiveDate};
use std::collections::HashMap;

pub fn week_start(date: NaiveDate) -> NaiveDate {
    let days_from_monday = date.weekday().num_days_from_monday();
    date - chrono::Duration::days(days_from_monday as i64)
}

pub fn week_end(date: NaiveDate) -> NaiveDate {
    week_start(date) + chrono::Duration::days(6)
}

#[derive(Debug, PartialEq, Clone, Serialize, Deserialize)]
pub struct WeeklyCarryResult {
    pub carry_in: i64,
    pub effective_limit: i64,
    pub spent_in_period: i64,
    pub remaining: i64,
    pub window_start: String,
    pub window_end: String,
}

pub fn calculate_weekly_carry(
    base_limit: i64,
    anchor_date: NaiveDate,
    as_of_date: NaiveDate,
    weekly_spent: &HashMap<NaiveDate, i64>,
) -> WeeklyCarryResult {
    let anchor_monday = week_start(anchor_date);
    let curr_monday = week_start(as_of_date);

    let mut carry_in = 0;
    let mut w = anchor_monday;

    while w < curr_monday {
        let effective = base_limit + carry_in;
        let spent = weekly_spent.get(&w).copied().unwrap_or(0);
        carry_in = (effective - spent).max(0);
        w += chrono::Duration::weeks(1);
    }

    let effective_limit = base_limit + carry_in;
    let spent_in_period = weekly_spent.get(&curr_monday).copied().unwrap_or(0);
    let remaining = effective_limit - spent_in_period;

    WeeklyCarryResult {
        carry_in,
        effective_limit,
        spent_in_period,
        remaining,
        window_start: curr_monday.format("%Y-%m-%d").to_string(),
        window_end: (curr_monday + chrono::Duration::days(6)).format("%Y-%m-%d").to_string(),
    }
}

pub const SAVINGS_GUIDELINE_BP: i64 = 2000;

pub fn calculate_weekly_to_monthly_equivalent(weekly_base_limits_sum: i64) -> i64 {
    ((weekly_base_limits_sum * 52) as f64 / 12.0).round() as i64
}

pub fn calculate_savings_plan(
    monthly_income: i64,
    monthly_limits_sum: i64,
    weekly_base_limits_sum: i64,
) -> (i64, f64, bool) {
    let total_weekly_equiv = calculate_weekly_to_monthly_equivalent(weekly_base_limits_sum);
    let total_allocated = monthly_limits_sum + total_weekly_equiv;
    let savings_target = monthly_income - total_allocated;
    let savings_ratio = if monthly_income > 0 {
        savings_target as f64 / monthly_income as f64
    } else {
        0.0
    };
    let guideline_ratio = SAVINGS_GUIDELINE_BP as f64 / 10000.0;
    let meets_guideline = savings_ratio >= guideline_ratio;
    (savings_target, savings_ratio, meets_guideline)
}

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
    pub related_debt_id: Option<i64>,
    pub account_id: Option<i64>,
    pub account_name: Option<String>,
}

#[derive(Debug, PartialEq, Serialize, Deserialize, Clone)]
pub struct BalanceResult {
    pub total_income: i64,
    pub total_expense: i64,
    pub balance: i64,
    pub monthly_income: i64,
    pub monthly_expense: i64,
    pub monthly_balance: i64,
    pub available_balance: i64,
    pub savings_balance: i64,
    pub monthly_savings_deposit: i64,
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
        available_balance: total_income - total_expense,
        savings_balance: 0,
        monthly_savings_deposit: 0,
    }
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[derive(Clone)]
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

pub fn calculate_realization(
    transactions: &[Transaction],
    categories: &[CategoryInfo],
) -> BudgetRealization {
    let mut needs_spent = 0;
    let mut wants_spent = 0;
    let mut savings_amount = 0;

    for tx in transactions {
        if tx.transaction_type == "expense" {
            if let Some(cat_id) = tx.category_id {
                // Find category group type
                if let Some(cat) = categories.iter().find(|c| c.id == cat_id) {
                    match cat.group_type.as_str() {
                        "needs" | "fixed" => needs_spent += tx.amount,
                        "wants" => wants_spent += tx.amount,
                        "savings" => savings_amount += tx.amount,
                        _ => {}
                    }
                }
            }
        }
    }

    BudgetRealization {
        needs_spent,
        wants_spent,
        savings_amount,
    }
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct ChartDataPoint {
    pub label: String,
    pub income: i64,
    pub expense: i64,
}

pub fn aggregate_chart_data(
    transactions: &[Transaction],
    period_type: &str,
) -> Vec<ChartDataPoint> {
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
        result.push(ChartDataPoint {
            label,
            income,
            expense,
        });
    }
    result
}


#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CategoryBudgetItem {
    pub category_id: i64,
    pub category_name: String,
    pub group_type: String, // "fixed", "wants", "savings"
    pub period: String,     // "weekly", "monthly"
    pub base_limit: i64,
    pub carry_in: i64,
    pub effective_limit: i64,
    pub spent_in_period: i64,
    pub remaining: i64,
    pub percentage: f64,
    pub status: String, // "aman", "waspada", "over"
    pub window_start: String,
    pub window_end: String,
    pub monthly_limit: i64, // alias to effective_limit
    pub spent: i64,         // alias to spent_in_period
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct GroupBudgetOverview {
    pub group_type: String, // "fixed", "wants", "savings"
    pub total_limit: i64,
    pub total_spent: i64,
    pub percentage: f64,
    pub categories: Vec<CategoryBudgetItem>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BudgetOverview {
    pub monthly_income: i64,
    pub fixed: GroupBudgetOverview,
    pub wants: GroupBudgetOverview,
    pub savings: GroupBudgetOverview,
    pub savings_target: i64,
    pub savings_ratio: f64,
    pub meets_guideline: bool,
}

#[derive(Clone, Debug)]
pub struct CategoryEnvelopeInput {
    pub id: i64,
    pub name: String,
    pub group_type: String, // "fixed", "wants", "savings"
    pub period: String,     // "weekly", "monthly"
    pub base_limit: i64,
    pub carry_in: i64,
    pub effective_limit: i64,
    pub spent_in_period: i64,
    pub remaining: i64,
    pub window_start: String,
    pub window_end: String,
    pub month_spent: i64,
}

impl CategoryEnvelopeInput {
    pub fn simple_monthly(id: i64, name: &str, group_type: &str, monthly_limit: i64, spent: i64) -> Self {
        Self {
            id,
            name: name.to_string(),
            group_type: group_type.to_string(),
            period: "monthly".to_string(),
            base_limit: monthly_limit,
            carry_in: 0,
            effective_limit: monthly_limit,
            spent_in_period: spent,
            remaining: monthly_limit - spent,
            window_start: "".to_string(),
            window_end: "".to_string(),
            month_spent: spent,
        }
    }
}

pub fn calculate_category_status(effective_limit: i64, spent: i64) -> (f64, String) {
    if effective_limit > 0 {
        let pct = (spent as f64 / effective_limit as f64) * 100.0;
        let status = if pct > 100.0 {
            "over".to_string()
        } else if pct >= 80.0 {
            "waspada".to_string()
        } else {
            "aman".to_string()
        };
        (pct, status)
    } else {
        (0.0, "unset".to_string())
    }
}

pub fn calculate_envelope_budget(
    monthly_income: i64,
    categories: &[CategoryEnvelopeInput],
) -> BudgetOverview {
    let mut fixed_items = Vec::new();
    let mut wants_items = Vec::new();
    let mut savings_items = Vec::new();

    let mut fixed_monthly_sum = 0;
    let mut fixed_weekly_sum = 0;
    let mut fixed_month_spent = 0;

    let mut wants_monthly_sum = 0;
    let mut wants_weekly_sum = 0;
    let mut wants_month_spent = 0;

    let mut savings_month_spent = 0;

    for cat in categories {
        let (pct, status) = calculate_category_status(cat.effective_limit, cat.spent_in_period);
        let item = CategoryBudgetItem {
            category_id: cat.id,
            category_name: cat.name.clone(),
            group_type: cat.group_type.clone(),
            period: cat.period.clone(),
            base_limit: cat.base_limit,
            carry_in: cat.carry_in,
            effective_limit: cat.effective_limit,
            spent_in_period: cat.spent_in_period,
            remaining: cat.remaining,
            percentage: pct,
            status,
            window_start: cat.window_start.clone(),
            window_end: cat.window_end.clone(),
            monthly_limit: cat.effective_limit,
            spent: cat.spent_in_period,
        };

        match cat.group_type.as_str() {
            "fixed" | "needs" => {
                if cat.period == "weekly" {
                    fixed_weekly_sum += cat.base_limit;
                } else {
                    fixed_monthly_sum += cat.base_limit;
                }
                fixed_month_spent += cat.month_spent;
                fixed_items.push(item);
            }
            "wants" => {
                if cat.period == "weekly" {
                    wants_weekly_sum += cat.base_limit;
                } else {
                    wants_monthly_sum += cat.base_limit;
                }
                wants_month_spent += cat.month_spent;
                wants_items.push(item);
            }
            "savings" => {
                savings_month_spent += cat.month_spent;
                savings_items.push(item);
            }
            _ => {}
        }
    }

    let total_weekly_sum = fixed_weekly_sum + wants_weekly_sum;
    let total_monthly_sum = fixed_monthly_sum + wants_monthly_sum;
    let (savings_target, savings_ratio, meets_guideline) =
        calculate_savings_plan(monthly_income, total_monthly_sum, total_weekly_sum);

    let fixed_weekly_equiv = calculate_weekly_to_monthly_equivalent(fixed_weekly_sum);
    let fixed_total_limit = fixed_monthly_sum + fixed_weekly_equiv;
    let fixed_pct = if fixed_total_limit > 0 {
        (fixed_month_spent as f64 / fixed_total_limit as f64) * 100.0
    } else {
        0.0
    };

    let total_weekly_equiv = calculate_weekly_to_monthly_equivalent(total_weekly_sum);
    let wants_weekly_equiv = total_weekly_equiv - fixed_weekly_equiv;
    let wants_total_limit = wants_monthly_sum + wants_weekly_equiv;
    let wants_pct = if wants_total_limit > 0 {
        (wants_month_spent as f64 / wants_total_limit as f64) * 100.0
    } else {
        0.0
    };

    let savings_pct = if savings_target > 0 {
        (savings_month_spent as f64 / savings_target as f64) * 100.0
    } else {
        0.0
    };

    BudgetOverview {
        monthly_income,
        fixed: GroupBudgetOverview {
            group_type: "fixed".to_string(),
            total_limit: fixed_total_limit,
            total_spent: fixed_month_spent,
            percentage: fixed_pct,
            categories: fixed_items,
        },
        wants: GroupBudgetOverview {
            group_type: "wants".to_string(),
            total_limit: wants_total_limit,
            total_spent: wants_month_spent,
            percentage: wants_pct,
            categories: wants_items,
        },
        savings: GroupBudgetOverview {
            group_type: "savings".to_string(),
            total_limit: savings_target,
            total_spent: savings_month_spent,
            percentage: savings_pct,
            categories: savings_items,
        },
        savings_target,
        savings_ratio,
        meets_guideline,
    }
}

pub fn validate_envelope_limit(
    monthly_income: i64,
    other_monthly_limits: i64,
    other_weekly_base_limits: i64,
    target_period: &str,
    new_limit: i64,
) -> Result<i64, String> {
    if new_limit < 0 {
        return Err("Limit kategori tidak boleh negatif.".to_string());
    }
    let (new_monthly_sum, new_weekly_sum) = if target_period == "weekly" {
        (other_monthly_limits, other_weekly_base_limits + new_limit)
    } else {
        (other_monthly_limits + new_limit, other_weekly_base_limits)
    };

    let total_allocated = new_monthly_sum + calculate_weekly_to_monthly_equivalent(new_weekly_sum);
    if total_allocated > monthly_income {
        return Err(format!(
            "Total alokasi budget (Rp {}) melebihi pendapatan bulanan (Rp {}). Sisa pendapatan yang tersedia: Rp {}.",
            total_allocated,
            monthly_income,
            (monthly_income - (other_monthly_limits + calculate_weekly_to_monthly_equivalent(other_weekly_base_limits))).max(0)
        ));
    }
    Ok(total_allocated)
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct DraftCategoryBudget {
    pub category_id: i64,
    pub period: String,
    pub amount: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct EnvelopePreview {
    pub total_monthly_equivalent: i64,
    pub savings_target: i64,
    pub savings_ratio: f64,
    pub meets_guideline: bool,
    pub exceeds_income: bool,
    pub category_equivalents: HashMap<i64, i64>,
}

pub fn calculate_envelope_preview(
    income: i64,
    drafts: &[DraftCategoryBudget],
) -> EnvelopePreview {
    let mut monthly_sum = 0;
    let mut weekly_sum = 0;
    let mut category_equivalents = HashMap::new();

    for d in drafts {
        if d.amount <= 0 {
            category_equivalents.insert(d.category_id, 0);
            continue;
        }
        if d.period == "weekly" {
            weekly_sum += d.amount;
            category_equivalents.insert(
                d.category_id,
                calculate_weekly_to_monthly_equivalent(d.amount),
            );
        } else {
            monthly_sum += d.amount;
            category_equivalents.insert(d.category_id, d.amount);
        }
    }

    let weekly_equiv = calculate_weekly_to_monthly_equivalent(weekly_sum);
    let total_monthly_equivalent = monthly_sum + weekly_equiv;
    let exceeds_income = total_monthly_equivalent > income;
    let savings_target = income - total_monthly_equivalent;
    let savings_ratio = if income > 0 {
        savings_target as f64 / income as f64
    } else {
        0.0
    };
    let guideline_ratio = SAVINGS_GUIDELINE_BP as f64 / 10000.0;
    let meets_guideline = savings_ratio >= guideline_ratio && !exceeds_income;

    EnvelopePreview {
        total_monthly_equivalent,
        savings_target,
        savings_ratio,
        meets_guideline,
        exceeds_income,
        category_equivalents,
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AutoAllocationInput {
    pub category_id: i64,
    pub bp: i64,
    pub period: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AutoAllocationItemOutput {
    pub category_id: i64,
    pub period: String,
    pub amount: i64,
    pub monthly_equivalent: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AutoAllocationPreview {
    pub items: Vec<AutoAllocationItemOutput>,
    pub total_bp: i64,
    pub locked_savings_amount: i64,
    pub pool_amount: i64,
    pub unallocated_bp: i64,
    pub error: Option<String>,
}

pub fn calculate_auto_allocation(
    income: i64,
    items: &[AutoAllocationInput],
) -> AutoAllocationPreview {
    let max_bp = 10000 - SAVINGS_GUIDELINE_BP; // 8000 bp (80%)

    if income <= 0 {
        return AutoAllocationPreview {
            items: Vec::new(),
            total_bp: 0,
            locked_savings_amount: 0,
            pool_amount: 0,
            unallocated_bp: max_bp,
            error: Some("Pendapatan bulanan harus lebih dari Rp 0.".to_string()),
        };
    }

    let locked_savings_amount = (income * SAVINGS_GUIDELINE_BP) / 10000;
    let pool_amount = income - locked_savings_amount;

    let mut output_items = Vec::new();
    let mut total_bp = 0;

    for item in items {
        if item.bp < 0 {
            return AutoAllocationPreview {
                items: Vec::new(),
                total_bp: 0,
                locked_savings_amount,
                pool_amount,
                unallocated_bp: max_bp,
                error: Some("Persentase kategori tidak boleh negatif.".to_string()),
            };
        }
        if item.bp % 50 != 0 {
            return AutoAllocationPreview {
                items: Vec::new(),
                total_bp: 0,
                locked_savings_amount,
                pool_amount,
                unallocated_bp: max_bp,
                error: Some("Presisi persentase harus kelipatan 0,5% (50 basis poin).".to_string()),
            };
        }
        if item.bp == 0 {
            continue;
        }
        if item.period != "weekly" && item.period != "monthly" {
            return AutoAllocationPreview {
                items: Vec::new(),
                total_bp: 0,
                locked_savings_amount,
                pool_amount,
                unallocated_bp: max_bp,
                error: Some("Periode harus 'weekly' atau 'monthly'.".to_string()),
            };
        }

        total_bp += item.bp;

        // Nominal bulanan setara = floor(income * bp / 10000, kelipatan 1.000)
        let monthly_equivalent = (((income * item.bp) / 10000) / 1000) * 1000;

        // Kategori 'weekly': base_limit = floor(nominal_bulanan * 12 / 52, kelipatan 1.000)
        // Kategori 'monthly': base_limit = nominal_bulanan
        let amount = if item.period == "weekly" {
            (((monthly_equivalent * 12) / 52) / 1000) * 1000
        } else {
            monthly_equivalent
        };

        output_items.push(AutoAllocationItemOutput {
            category_id: item.category_id,
            period: item.period.clone(),
            amount,
            monthly_equivalent,
        });
    }

    if total_bp > max_bp {
        return AutoAllocationPreview {
            items: output_items,
            total_bp,
            locked_savings_amount,
            pool_amount,
            unallocated_bp: 0,
            error: Some(format!(
                "Total alokasi ({:.1}%) melebihi batas maksimal 80%.",
                total_bp as f64 / 100.0
            )),
        };
    }

    let unallocated_bp = max_bp - total_bp;

    AutoAllocationPreview {
        items: output_items,
        total_bp,
        locked_savings_amount,
        pool_amount,
        unallocated_bp,
        error: None,
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aggregate_chart_data_daily() {
        let transactions = vec![
            Transaction {
                id: 1,
                amount: 50000,
                transaction_type: "income".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-08-01".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
            Transaction {
                id: 2,
                amount: 15000,
                transaction_type: "expense".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-08-01".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
            Transaction {
                id: 3,
                amount: 10000,
                transaction_type: "expense".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-08-02".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
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
            Transaction {
                id: 1,
                amount: 50000,
                transaction_type: "income".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-08-01".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
            Transaction {
                id: 2,
                amount: 15000,
                transaction_type: "expense".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-08-15".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
            Transaction {
                id: 3,
                amount: 10000,
                transaction_type: "expense".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-09-02".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
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
            Transaction {
                id: 1,
                amount: 50000,
                transaction_type: "income".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-07-15".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
            Transaction {
                id: 2,
                amount: 15000,
                transaction_type: "expense".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-07-20".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
            Transaction {
                id: 3,
                amount: 10000,
                transaction_type: "expense".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-08-05".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
        ];

        let result = calculate_balance(&transactions, "2026-08");

        assert_eq!(result.total_income, 50000);
        assert_eq!(result.total_expense, 25000);
        assert_eq!(result.balance, 25000);
    }

    #[test]
    fn test_calculate_balance_monthly() {
        let transactions = vec![
            Transaction {
                id: 1,
                amount: 50000,
                transaction_type: "income".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-07-15".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
            Transaction {
                id: 2,
                amount: 20000,
                transaction_type: "income".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-08-01".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
            Transaction {
                id: 3,
                amount: 15000,
                transaction_type: "expense".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-08-05".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
        ];

        let result = calculate_balance(&transactions, "2026-08");

        assert_eq!(result.monthly_income, 20000);
        assert_eq!(result.monthly_expense, 15000);
        assert_eq!(result.monthly_balance, 5000);
    }

    #[test]
    fn test_calculate_balance_negative() {
        let transactions = vec![
            Transaction {
                id: 1,
                amount: 10000,
                transaction_type: "income".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-08-01".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
            Transaction {
                id: 2,
                amount: 15000,
                transaction_type: "expense".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-08-05".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
        ];

        let result = calculate_balance(&transactions, "2026-08");

        assert_eq!(result.balance, -5000);
        assert_eq!(result.monthly_balance, -5000);
    }

    // F2 Tests
    #[test]
    fn test_ideal_allocation_standard() {
        let ratios = BudgetRatios {
            needs_pct: 50,
            wants_pct: 30,
            savings_pct: 20,
        };
        let ideal = calculate_ideal_allocation(5000000, &ratios);
        assert_eq!(ideal.needs, 2500000);
        assert_eq!(ideal.wants, 1500000);
        assert_eq!(ideal.savings, 1000000);
    }

    #[test]
    fn test_ideal_allocation_rounding() {
        let ratios = BudgetRatios {
            needs_pct: 50,
            wants_pct: 30,
            savings_pct: 20,
        };
        let ideal = calculate_ideal_allocation(3333333, &ratios);
        assert_eq!(ideal.needs, 1666666);
        assert_eq!(ideal.wants, 999999);
        assert_eq!(ideal.savings, 666666);
    }

    #[test]
    fn test_ideal_allocation_zero_ratios() {
        let ratios = BudgetRatios {
            needs_pct: 100,
            wants_pct: 0,
            savings_pct: 0,
        };
        let ideal = calculate_ideal_allocation(2000000, &ratios);
        assert_eq!(ideal.needs, 2000000);
        assert_eq!(ideal.wants, 0);
        assert_eq!(ideal.savings, 0);
    }

    #[test]
    fn test_realization_calculation() {
        let categories = vec![
            CategoryInfo {
                id: 1,
                group_type: "needs".to_string(),
            },
            CategoryInfo {
                id: 2,
                group_type: "wants".to_string(),
            },
            CategoryInfo {
                id: 3,
                group_type: "savings".to_string(),
            },
        ];
        let transactions = vec![
            Transaction {
                id: 1,
                amount: 1500000,
                transaction_type: "expense".to_string(),
                category_id: Some(1),
                note: None,
                transaction_date: "2026-08-01".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
            Transaction {
                id: 2,
                amount: 500000,
                transaction_type: "expense".to_string(),
                category_id: Some(2),
                note: None,
                transaction_date: "2026-08-02".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
            Transaction {
                id: 3,
                amount: 1000000,
                transaction_type: "expense".to_string(),
                category_id: Some(3),
                note: None,
                transaction_date: "2026-08-03".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
            Transaction {
                id: 4,
                amount: 200000,
                transaction_type: "expense".to_string(),
                category_id: Some(2),
                note: None,
                transaction_date: "2026-08-04".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
            Transaction {
                id: 5,
                amount: 5000000,
                transaction_type: "income".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-08-05".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            }, // Should be ignored
        ];
        let real = calculate_realization(&transactions, &categories);
        assert_eq!(real.needs_spent, 1500000);
        assert_eq!(real.wants_spent, 700000);
        assert_eq!(real.savings_amount, 1000000);
    }

    #[test]
    fn test_realization_missing_category_ignored() {
        let categories = vec![CategoryInfo {
            id: 1,
            group_type: "needs".to_string(),
        }];
        let transactions = vec![
            Transaction {
                id: 1,
                amount: 1000000,
                transaction_type: "expense".to_string(),
                category_id: Some(1),
                note: None,
                transaction_date: "2026-08-01".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            },
            Transaction {
                id: 2,
                amount: 500000,
                transaction_type: "expense".to_string(),
                category_id: Some(99),
                note: None,
                transaction_date: "2026-08-02".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            }, // Unmapped category ID
            Transaction {
                id: 3,
                amount: 500000,
                transaction_type: "expense".to_string(),
                category_id: None,
                note: None,
                transaction_date: "2026-08-02".to_string(),
                source: "manual".to_string(),
                saving_goal_id: None,
                related_debt_id: None,
                account_id: None,
                account_name: None,
            }, // No category ID
        ];
        let real = calculate_realization(&transactions, &categories);
        assert_eq!(real.needs_spent, 1000000);
        assert_eq!(real.wants_spent, 0);
        assert_eq!(real.savings_amount, 0);
    }

    #[test]
    fn test_envelope_budget_calculation_standard() {
        let inputs = vec![
            CategoryEnvelopeInput::simple_monthly(1, "Makan", "fixed", 1500000, 1000000),
            CategoryEnvelopeInput::simple_monthly(2, "Transport", "fixed", 500000, 450000),
            CategoryEnvelopeInput::simple_monthly(3, "Nongkrong", "wants", 1000000, 1200000),
            CategoryEnvelopeInput::simple_monthly(4, "Tabungan", "savings", 0, 500000),
        ];

        let overview = calculate_envelope_budget(5000000, &inputs);

        assert_eq!(overview.monthly_income, 5000000);
        // Fixed: limit = 2,000,000, spent = 1,450,000
        assert_eq!(overview.fixed.total_limit, 2000000);
        assert_eq!(overview.fixed.total_spent, 1450000);
        // Wants: limit = 1,000,000, spent = 1,200,000
        assert_eq!(overview.wants.total_limit, 1000000);
        assert_eq!(overview.wants.total_spent, 1200000);
        // Savings target: 5,000,000 - 3,000,000 = 2,000,000
        assert_eq!(overview.savings_target, 2000000);
        // Savings ratio: 2,000,000 / 5,000,000 = 0.40 (40%)
        assert!((overview.savings_ratio - 0.40).abs() < 1e-6);
        assert!(overview.meets_guideline);

        // Status per category
        // Makan: 1,000,000 / 1,500,000 = 66.67% (<80%) -> aman
        assert_eq!(overview.fixed.categories[0].status, "aman");
        // Transport: 450,000 / 500,000 = 90% (80-100%) -> waspada
        assert_eq!(overview.fixed.categories[1].status, "waspada");
        // Nongkrong: 1,200,000 / 1,000,000 = 120% (>100%) -> over
        assert_eq!(overview.wants.categories[0].status, "over");
    }

    #[test]
    fn test_envelope_budget_savings_below_guideline() {
        let inputs = vec![
            CategoryEnvelopeInput::simple_monthly(1, "Makan", "fixed", 3000000, 2000000),
            CategoryEnvelopeInput::simple_monthly(2, "Belanja", "wants", 1500000, 1000000),
        ];

        let overview = calculate_envelope_budget(5000000, &inputs);

        // Savings target: 5,000,000 - 4,500,000 = 500,000
        assert_eq!(overview.savings_target, 500000);
        // Savings ratio: 500,000 / 5,000,000 = 0.10 (10%)
        assert!((overview.savings_ratio - 0.10).abs() < 1e-6);
        // Under 20% guideline: meets_guideline = false
        assert!(!overview.meets_guideline);
    }

    #[test]
    fn test_envelope_budget_validation_rules() {
        // Income 5,000,000. Existing fixed/wants limits sum to 3,500,000.
        let income = 5000000;
        let other_monthly = 3500000;
        let other_weekly = 0;

        // 1. Valid limit within budget
        assert!(validate_envelope_limit(income, other_monthly, other_weekly, "monthly", 1000000).is_ok());

        // 2. Exact limit to 100% of income
        assert!(validate_envelope_limit(income, other_monthly, other_weekly, "monthly", 1500000).is_ok());

        // 3. Exceeds income (3.5M + 1.6M = 5.1M > 5.0M) -> rejected
        let err = validate_envelope_limit(income, other_monthly, other_weekly, "monthly", 1600000);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("melebihi pendapatan bulanan"));

        // 4. Negative limit -> rejected
        let neg_err = validate_envelope_limit(income, other_monthly, other_weekly, "monthly", -50000);
        assert!(neg_err.is_err());
        assert!(neg_err.unwrap_err().contains("tidak boleh negatif"));
    }

    #[test]
    fn test_envelope_category_status_edge_cases() {
        // Exactly 80% -> waspada
        let (_, status_80) = calculate_category_status(100000, 80000);
        assert_eq!(status_80, "waspada");

        // Exactly 100% -> waspada
        let (_, status_100) = calculate_category_status(100000, 100000);
        assert_eq!(status_100, "waspada");

        // 100.01% -> over
        let (_, status_over) = calculate_category_status(100000, 100001);
        assert_eq!(status_over, "over");

        // 79.99% -> aman
        let (_, status_aman) = calculate_category_status(100000, 79999);
        assert_eq!(status_aman, "aman");

        // 0 limit and 0 spent -> unset
        let (_, status_zero_zero) = calculate_category_status(0, 0);
        assert_eq!(status_zero_zero, "unset");

        // 0 limit and >0 spent -> unset
        let (_, status_zero_spent) = calculate_category_status(0, 50000);
        assert_eq!(status_zero_spent, "unset");
    }

    #[test]
    fn test_week_start_calculations() {
        // Hari Senin: 2026-10-12
        let mon = NaiveDate::from_ymd_opt(2026, 10, 12).unwrap();
        assert_eq!(week_start(mon), mon);
        assert_eq!(week_end(mon), NaiveDate::from_ymd_opt(2026, 10, 18).unwrap());

        // Hari Minggu: 2026-10-18
        let sun = NaiveDate::from_ymd_opt(2026, 10, 18).unwrap();
        assert_eq!(week_start(sun), mon);
        assert_eq!(week_end(sun), sun);

        // Pergantian bulan (2026-10-01 adalah hari Kamis -> Senin adalah 2026-09-28)
        let cross_month = NaiveDate::from_ymd_opt(2026, 10, 1).unwrap();
        let expected_prev_month_mon = NaiveDate::from_ymd_opt(2026, 9, 28).unwrap();
        assert_eq!(week_start(cross_month), expected_prev_month_mon);

        // Pergantian bulan akhir (2026-11-01 adalah hari Minggu -> Senin adalah 2026-10-26)
        let nov1_sun = NaiveDate::from_ymd_opt(2026, 11, 1).unwrap();
        assert_eq!(week_start(nov1_sun), NaiveDate::from_ymd_opt(2026, 10, 26).unwrap());

        // Pergantian tahun (2026-01-01 adalah hari Kamis -> Senin adalah 2025-12-29)
        let cross_year = NaiveDate::from_ymd_opt(2026, 1, 1).unwrap();
        let expected_prev_year_mon = NaiveDate::from_ymd_opt(2025, 12, 29).unwrap();
        assert_eq!(week_start(cross_year), expected_prev_year_mon);

        // Hari Senin di awal tahun baru
        let jan1_mon = NaiveDate::from_ymd_opt(2024, 1, 1).unwrap();
        assert_eq!(week_start(jan1_mon), jan1_mon);
    }

    #[test]
    fn test_weekly_carry_scenarios() {
        let anchor = NaiveDate::from_ymd_opt(2026, 10, 5).unwrap(); // Senin W1
        let w1 = anchor;
        let w2 = NaiveDate::from_ymd_opt(2026, 10, 12).unwrap(); // Senin W2
        let w3 = NaiveDate::from_ymd_opt(2026, 10, 19).unwrap(); // Senin W3

        let mut spent_map = HashMap::new();
        // Jatah 100.000: minggu 1 pakai 70.000 -> minggu 2 efektif 130.000
        spent_map.insert(w1, 70_000);
        let res_w2 = calculate_weekly_carry(100_000, anchor, w2, &spent_map);
        assert_eq!(res_w2.carry_in, 30_000);
        assert_eq!(res_w2.effective_limit, 130_000);

        // minggu 2 pakai 150.000 (over) -> minggu 3 efektif 100.000
        spent_map.insert(w2, 150_000);
        let res_w3 = calculate_weekly_carry(100_000, anchor, w3, &spent_map);
        assert_eq!(res_w3.carry_in, 0); // Kelebihan belanja tidak menghasilkan carry negatif
        assert_eq!(res_w3.effective_limit, 100_000);
    }

    #[test]
    fn test_weekly_carry_two_weeks_without_spending() {
        // Dua minggu tanpa belanja -> minggu 3 efektif 300.000
        let anchor = NaiveDate::from_ymd_opt(2026, 10, 5).unwrap(); // Senin W1
        let w3 = NaiveDate::from_ymd_opt(2026, 10, 19).unwrap(); // Senin W3
        let spent_map = HashMap::new(); // Tidak ada belanja sama sekali

        let res_w3 = calculate_weekly_carry(100_000, anchor, w3, &spent_map);
        assert_eq!(res_w3.carry_in, 200_000);
        assert_eq!(res_w3.effective_limit, 300_000);
        assert_eq!(res_w3.remaining, 300_000);
    }

    #[test]
    fn test_weekly_conversion_and_validation() {
        // Konversi 52/12:
        // 120.000 mingguan * 52 / 12 = 520.000 per bulan
        let equiv = calculate_weekly_to_monthly_equivalent(120_000);
        assert_eq!(equiv, 520_000);

        // Tabungan:
        // income = 1.000.000, monthly = 300.000, weekly = 120.000 (equiv = 520.000)
        // total alloc = 820.000 -> target = 180.000 (18%), meets_guideline = false (< 20%)
        let (target, ratio, meets) = calculate_savings_plan(1_000_000, 300_000, 120_000);
        assert_eq!(target, 180_000);
        assert!((ratio - 0.18).abs() < 1e-6);
        assert!(!meets);

        // Tabungan memenuhi panduan (>= 20%):
        // income = 1.000.000, monthly = 200.000, weekly = 120.000 (equiv = 520.000) -> target = 280.000 (28%)
        let (target2, ratio2, meets2) = calculate_savings_plan(1_000_000, 200_000, 120_000);
        assert_eq!(target2, 280_000);
        assert!((ratio2 - 0.28).abs() < 1e-6);
        assert!(meets2);

        // Validasi alokasi melebihi income:
        // income = 500.000, setting weekly 120.000 (equiv 520.000) -> error
        let err = validate_envelope_limit(500_000, 0, 0, "weekly", 120_000);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("melebihi pendapatan bulanan"));
    }

    #[test]
    fn test_calculate_envelope_preview() {
        let drafts = vec![
            DraftCategoryBudget {
                category_id: 1,
                period: "monthly".to_string(),
                amount: 1_000_000,
            },
            DraftCategoryBudget {
                category_id: 2,
                period: "weekly".to_string(),
                amount: 120_000, // 120k * 52 / 12 = 520,000
            },
        ];

        // Income 2,000,000 -> Total 1,520,000, Target 480,000, Ratio 24% (meets guideline, does not exceed)
        let prev = calculate_envelope_preview(2_000_000, &drafts);
        assert_eq!(prev.total_monthly_equivalent, 1_520_000);
        assert_eq!(prev.savings_target, 480_000);
        assert!((prev.savings_ratio - 0.24).abs() < 1e-6);
        assert!(prev.meets_guideline);
        assert!(!prev.exceeds_income);

        // Income 1_500_000 -> Total 1,520,000 > 1,500,000 (exceeds income)
        let prev_exceed = calculate_envelope_preview(1_500_000, &drafts);
        assert_eq!(prev_exceed.total_monthly_equivalent, 1_520_000);
        assert_eq!(prev_exceed.savings_target, -20_000);
        assert!(prev_exceed.exceeds_income);
        assert!(!prev_exceed.meets_guideline);
    }

    #[test]
    fn test_auto_allocation_makan_weekly_and_pool() {
        // Income 2.000.000, Makan 25% weekly -> pool 1.600.000, nominal bulanan 500.000, base_limit mingguan 115.000.
        let inputs = vec![AutoAllocationInput {
            category_id: 1,
            bp: 2500, // 25%
            period: "weekly".to_string(),
        }];

        let res = calculate_auto_allocation(2_000_000, &inputs);
        assert!(res.error.is_none());
        assert_eq!(res.locked_savings_amount, 400_000);
        assert_eq!(res.pool_amount, 1_600_000);
        assert_eq!(res.total_bp, 2500);
        assert_eq!(res.unallocated_bp, 5500); // 80% - 25% = 55%
        assert_eq!(res.items.len(), 1);
        assert_eq!(res.items[0].category_id, 1);
        assert_eq!(res.items[0].period, "weekly");
        assert_eq!(res.items[0].monthly_equivalent, 500_000);
        assert_eq!(res.items[0].amount, 115_000);
    }

    #[test]
    fn test_auto_allocation_percentage_bounds() {
        // Total persen 81% ditolak; 80% diterima; 70% -> unallocated 10%.
        let items_81 = vec![
            AutoAllocationInput { category_id: 1, bp: 5000, period: "monthly".to_string() },
            AutoAllocationInput { category_id: 2, bp: 3100, period: "monthly".to_string() },
        ];
        let res_81 = calculate_auto_allocation(5_000_000, &items_81);
        assert!(res_81.error.is_some());
        assert_eq!(res_81.total_bp, 8100);

        let items_80 = vec![
            AutoAllocationInput { category_id: 1, bp: 5000, period: "monthly".to_string() },
            AutoAllocationInput { category_id: 2, bp: 3000, period: "monthly".to_string() },
        ];
        let res_80 = calculate_auto_allocation(5_000_000, &items_80);
        assert!(res_80.error.is_none());
        assert_eq!(res_80.total_bp, 8000);
        assert_eq!(res_80.unallocated_bp, 0);

        let items_70 = vec![
            AutoAllocationInput { category_id: 1, bp: 4500, period: "monthly".to_string() },
            AutoAllocationInput { category_id: 2, bp: 2500, period: "weekly".to_string() },
        ];
        let res_70 = calculate_auto_allocation(5_000_000, &items_70);
        assert!(res_70.error.is_none());
        assert_eq!(res_70.total_bp, 7000);
        assert_eq!(res_70.unallocated_bp, 1000); // 10%
    }

    #[test]
    fn test_auto_allocation_rounding_never_exceeds_pool() {
        // Pembulatan ke bawah kelipatan 1.000 tidak pernah membuat total melebihi 80% income.
        let income = 3_333_333;
        let items = vec![
            AutoAllocationInput { category_id: 1, bp: 2550, period: "weekly".to_string() },  // 25.5%
            AutoAllocationInput { category_id: 2, bp: 1450, period: "weekly".to_string() },  // 14.5%
            AutoAllocationInput { category_id: 3, bp: 2250, period: "monthly".to_string() }, // 22.5%
            AutoAllocationInput { category_id: 4, bp: 1750, period: "monthly".to_string() }, // 17.5%
        ];
        let res = calculate_auto_allocation(income, &items);
        assert!(res.error.is_none());
        assert_eq!(res.total_bp, 8000);

        let mut sum_monthly_equiv = 0;
        let mut monthly_sum = 0;
        let mut weekly_sum = 0;
        for it in &res.items {
            assert_eq!(it.amount % 1000, 0, "amount must be multiple of 1,000");
            assert_eq!(it.monthly_equivalent % 1000, 0, "monthly_equivalent must be multiple of 1,000");
            sum_monthly_equiv += it.monthly_equivalent;
            if it.period == "weekly" {
                weekly_sum += it.amount;
            } else {
                monthly_sum += it.amount;
            }
        }

        assert!(sum_monthly_equiv <= res.pool_amount);
        let engine_total_equiv = monthly_sum + calculate_weekly_to_monthly_equivalent(weekly_sum);
        assert!(engine_total_equiv <= res.pool_amount);
    }

    #[test]
    fn test_auto_allocation_zero_percent_skipped_and_zero_income_rejected() {
        // Persen 0/kosong dilewati. Income 0 ditolak.
        let items = vec![
            AutoAllocationInput { category_id: 1, bp: 2000, period: "monthly".to_string() },
            AutoAllocationInput { category_id: 2, bp: 0, period: "weekly".to_string() },
            AutoAllocationInput { category_id: 3, bp: 0, period: "monthly".to_string() },
        ];

        let res = calculate_auto_allocation(4_000_000, &items);
        assert!(res.error.is_none());
        assert_eq!(res.items.len(), 1);
        assert_eq!(res.items[0].category_id, 1);

        // Income 0 ditolak
        let res_zero_inc = calculate_auto_allocation(0, &items);
        assert!(res_zero_inc.error.is_some());
        assert!(res_zero_inc.items.is_empty());
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SavingGoal {
    pub id: i64,
    pub name: String,
    pub target_amount: i64,
    pub target_date: Option<String>,
    pub current_amount: i64,
    pub account_id: Option<i64>,
    pub account_name: Option<String>,
}
