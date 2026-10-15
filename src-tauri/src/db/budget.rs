use crate::budget_engine::{
    calculate_envelope_budget, validate_envelope_limit, BudgetOverview, BudgetRatios,
    CategoryEnvelopeInput,
};
use rusqlite::{Connection, Result};

#[derive(serde::Serialize, Clone)]
pub struct BudgetSettings {
    pub monthly_income: i64,
    pub ratios: BudgetRatios,
    pub ollama_model: String,
    pub language: String,
    pub reminder_enabled: bool,
    pub reminder_time: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct CategoryBudgetSetting {
    pub category_id: i64,
    pub category_name: String,
    pub group_type: Option<String>,
    pub limit_amount: i64,
    pub period: String,
    pub anchor_date: Option<String>,
    pub monthly_limit: i64,
}

pub fn get_budget_settings(conn: &Connection) -> Result<BudgetSettings, String> {
    let mut stmt = conn.prepare("SELECT monthly_income, needs_pct, wants_pct, savings_pct, ollama_model, language, reminder_enabled, reminder_time FROM budget_settings WHERE id = 1").map_err(|e| e.to_string())?;

    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(BudgetSettings {
            monthly_income: row.get(0).unwrap_or(0),
            ratios: BudgetRatios {
                needs_pct: row.get(1).unwrap_or(50),
                wants_pct: row.get(2).unwrap_or(30),
                savings_pct: row.get(3).unwrap_or(20),
            },
            ollama_model: row.get(4).unwrap_or("qwen2.5:3b".to_string()),
            language: row.get(5).unwrap_or("id".to_string()),
            reminder_enabled: row.get(6).unwrap_or(false),
            reminder_time: row.get(7).unwrap_or("20:00".to_string()),
        })
    } else {
        conn.execute("INSERT INTO budget_settings (id, monthly_income, needs_pct, wants_pct, savings_pct, language, reminder_enabled, reminder_time) VALUES (1, 0, 50, 30, 20, 'id', 0, '20:00')", [])
            .map_err(|e| e.to_string())?;
        Ok(BudgetSettings {
            monthly_income: 0,
            ratios: BudgetRatios {
                needs_pct: 50,
                wants_pct: 30,
                savings_pct: 20,
            },
            ollama_model: "qwen2.5:3b".to_string(),
            language: "id".to_string(),
            reminder_enabled: false,
            reminder_time: "20:00".to_string(),
        })
    }
}

pub fn set_monthly_income(conn: &Connection, amount: i64) -> Result<(), String> {
    if amount < 0 {
        return Err("Income cannot be negative".to_string());
    }
    let mut stmt = conn
        .prepare(
            "SELECT COALESCE(cb.limit_amount, 0), COALESCE(cb.period, 'monthly')
             FROM category_budgets cb
             JOIN categories c ON cb.category_id = c.id
             WHERE c.group_type IN ('fixed', 'wants')",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    let mut monthly_sum = 0;
    let mut weekly_sum = 0;
    for r in rows {
        let (lim, per) = r.map_err(|e| e.to_string())?;
        if per == "weekly" {
            weekly_sum += lim;
        } else {
            monthly_sum += lim;
        }
    }
    let total_equivalent = monthly_sum + crate::budget_engine::calculate_weekly_to_monthly_equivalent(weekly_sum);

    if amount < total_equivalent {
        return Err(format!(
            "Pendapatan bulanan (Rp {}) tidak boleh lebih kecil dari total alokasi budget kategori yang sudah ditentukan (Rp {}).",
            amount, total_equivalent
        ));
    }
    conn.execute(
        "INSERT INTO budget_settings (id, monthly_income) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET monthly_income = excluded.monthly_income",
        [amount],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_ratios(conn: &Connection, needs: i64, wants: i64, savings: i64) -> Result<(), String> {
    if needs + wants + savings != 100 {
        return Err("Ratios must sum to 100".to_string());
    }
    conn.execute(
        "UPDATE budget_settings SET needs_pct = ?1, wants_pct = ?2, savings_pct = ?3 WHERE id = 1",
        [needs, wants, savings],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_reminder_settings(conn: &Connection, enabled: bool, time: String) -> Result<(), String> {
    conn.execute("UPDATE budget_settings SET reminder_enabled = ?1, reminder_time = ?2 WHERE id = 1", rusqlite::params![enabled, time]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_language(conn: &Connection, language: &str) -> Result<(), String> {
    if language != "id" && language != "en" {
        return Err("Invalid language code (must be 'id' or 'en')".to_string());
    }
    let _ = get_budget_settings(conn)?;
    conn.execute(
        "UPDATE budget_settings SET language = ?1 WHERE id = 1",
        [language],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_category_budgets(conn: &Connection) -> Result<Vec<CategoryBudgetSetting>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.name, c.group_type, COALESCE(cb.limit_amount, 0), COALESCE(cb.period, 'monthly'), cb.anchor_date
             FROM categories c
             LEFT JOIN category_budgets cb ON c.id = cb.category_id
             WHERE c.transaction_type = 'expense' AND c.group_type IN ('fixed', 'wants')
             ORDER BY CASE c.group_type WHEN 'fixed' THEN 1 WHEN 'wants' THEN 2 ELSE 3 END, c.id",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let limit_amount: i64 = row.get(3)?;
            let period: String = row.get(4)?;
            let anchor_date: Option<String> = row.get(5)?;
            Ok(CategoryBudgetSetting {
                category_id: row.get(0)?,
                category_name: row.get(1)?,
                group_type: row.get(2)?,
                limit_amount,
                period: period.clone(),
                anchor_date,
                monthly_limit: limit_amount,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn set_category_budget(conn: &Connection, category_id: i64, period: &str, amount: i64) -> Result<(), String> {
    if amount < 0 {
        return Err("Limit budget tidak boleh negatif.".to_string());
    }
    if period != "weekly" && period != "monthly" {
        return Err("Periode budget harus 'weekly' atau 'monthly'.".to_string());
    }

    // Verify category exists and is eligible (fixed or wants)
    let (group_type, tx_type): (Option<String>, String) = conn
        .query_row(
            "SELECT group_type, transaction_type FROM categories WHERE id = ?1",
            [category_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "Kategori tidak ditemukan.".to_string())?;

    if tx_type != "expense"
        || (group_type.as_deref() != Some("fixed") && group_type.as_deref() != Some("wants"))
    {
        return Err("Hanya kategori pengeluaran (Bulanan Tetap atau Keinginan) yang dapat diatur batas budget-nya.".to_string());
    }

    let settings = get_budget_settings(conn)?;
    let monthly_income = settings.monthly_income;

    // Sum of limits for other fixed/wants categories separated by period
    let mut other_stmt = conn
        .prepare(
            "SELECT COALESCE(cb.limit_amount, 0), COALESCE(cb.period, 'monthly')
             FROM category_budgets cb
             JOIN categories c ON cb.category_id = c.id
             WHERE c.group_type IN ('fixed', 'wants') AND cb.category_id != ?1",
        )
        .map_err(|e| e.to_string())?;

    let other_rows = other_stmt
        .query_map([category_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    let mut other_monthly = 0;
    let mut other_weekly = 0;
    for r in other_rows {
        let (lim, per) = r.map_err(|e| e.to_string())?;
        if per == "weekly" {
            other_weekly += lim;
        } else {
            other_monthly += lim;
        }
    }

    validate_envelope_limit(monthly_income, other_monthly, other_weekly, period, amount)?;

    if amount == 0 {
        conn.execute(
            "DELETE FROM category_budgets WHERE category_id = ?1",
            [category_id],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    // When period/limit is changed, set anchor_date = current week's Monday
    let today = chrono::Local::now().date_naive();
    let anchor_monday = crate::budget_engine::week_start(today).format("%Y-%m-%d").to_string();

    conn.execute(
        "INSERT INTO category_budgets (category_id, limit_amount, period, anchor_date)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(category_id) DO UPDATE SET
             limit_amount = excluded.limit_amount,
             period = excluded.period,
             anchor_date = excluded.anchor_date",
        rusqlite::params![category_id, amount, period, anchor_monday],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct AllocationPercentItem {
    pub category_id: i64,
    pub bp: i64,
}

pub fn save_allocation_percents(
    conn: &mut Connection,
    items: &[AllocationPercentItem],
) -> Result<(), String> {
    let max_bp = 10000 - crate::budget_engine::SAVINGS_GUIDELINE_BP;
    let mut total_bp = 0;

    for item in items {
        if item.bp < 0 {
            return Err("Persentase kategori tidak boleh negatif.".to_string());
        }
        if item.bp % 50 != 0 {
            return Err("Presisi persentase harus kelipatan 0,5% (50 basis poin).".to_string());
        }
        total_bp += item.bp;
    }

    if total_bp > max_bp {
        return Err(format!(
            "Total alokasi ({:.1}%) melebihi batas maksimal 80%.",
            total_bp as f64 / 100.0
        ));
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM allocation_percents", [])
        .map_err(|e| e.to_string())?;

    for item in items {
        if item.bp > 0 {
            tx.execute(
                "INSERT INTO allocation_percents (category_id, bp) VALUES (?1, ?2)",
                rusqlite::params![item.category_id, item.bp],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_allocation_percents(conn: &Connection) -> Result<Vec<AllocationPercentItem>, String> {
    let mut stmt = conn
        .prepare("SELECT category_id, bp FROM allocation_percents ORDER BY category_id")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(AllocationPercentItem {
                category_id: row.get(0)?,
                bp: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn get_budget_overview(conn: &Connection, current_month: &str) -> Result<BudgetOverview, String> {
    get_budget_overview_with_date(conn, current_month, chrono::Local::now().date_naive())
}

pub fn get_budget_overview_with_date(
    conn: &Connection,
    current_month: &str,
    as_of_date: chrono::NaiveDate,
) -> Result<BudgetOverview, String> {
    let settings = get_budget_settings(conn)?;
    let monthly_income = settings.monthly_income;

    // Fetch all expense categories with group_type (fixed, wants, savings)
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.name, c.group_type, COALESCE(cb.limit_amount, 0), COALESCE(cb.period, 'monthly'), cb.anchor_date
             FROM categories c
             LEFT JOIN category_budgets cb ON c.id = cb.category_id
             WHERE c.transaction_type = 'expense' AND c.group_type IS NOT NULL
             ORDER BY c.id",
        )
        .map_err(|e| e.to_string())?;

    let cat_rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut cat_list = Vec::new();
    for r in cat_rows {
        cat_list.push(r.map_err(|e| e.to_string())?);
    }

    // Fetch spent for current_month from operational_transactions
    let mut spent_stmt = conn
        .prepare(
            "SELECT t.category_id, COALESCE(SUM(t.amount), 0)
             FROM operational_transactions t
             WHERE t.type = 'expense'
               AND strftime('%Y-%m', t.transaction_date) = ?1
             GROUP BY t.category_id",
        )
        .map_err(|e| e.to_string())?;

    let spent_rows = spent_stmt
        .query_map([current_month], |row| {
            Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut month_spent_map = std::collections::HashMap::new();
    for r in spent_rows {
        if let Ok((Some(cid), spent)) = r {
            month_spent_map.insert(cid, spent);
        }
    }

    // Determine earliest anchor date for weekly categories to query weekly spent in ONE query
    let curr_monday = crate::budget_engine::week_start(as_of_date);
    let mut earliest_anchor = curr_monday;
    let mut has_weekly = false;

    for (_, _, _, _, period, anchor_opt) in &cat_list {
        if period == "weekly" {
            has_weekly = true;
            if let Some(anc_str) = anchor_opt {
                if let Ok(anc_date) = chrono::NaiveDate::parse_from_str(anc_str, "%Y-%m-%d") {
                    let anc_mon = crate::budget_engine::week_start(anc_date);
                    if anc_mon < earliest_anchor {
                        earliest_anchor = anc_mon;
                    }
                }
            }
        }
    }

    let mut weekly_spent_map: std::collections::HashMap<(i64, chrono::NaiveDate), i64> = std::collections::HashMap::new();
    if has_weekly {
        let mut weekly_stmt = conn
            .prepare(
                "SELECT
                     t.category_id,
                     date(t.transaction_date, '-' || ((strftime('%w', t.transaction_date) + 6) % 7) || ' days') AS week_monday,
                     COALESCE(SUM(t.amount), 0) AS total_amount
                 FROM operational_transactions t
                 WHERE t.type = 'expense'
                   AND t.transaction_date >= ?1
                 GROUP BY t.category_id, week_monday",
            )
            .map_err(|e| e.to_string())?;

        let earliest_anchor_str = earliest_anchor.format("%Y-%m-%d").to_string();
        let w_rows = weekly_stmt
            .query_map([earliest_anchor_str], |row| {
                Ok((
                    row.get::<_, Option<i64>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for r in w_rows {
            if let Ok((Some(cid), w_date_str, amt)) = r {
                if let Ok(w_date) = chrono::NaiveDate::parse_from_str(&w_date_str, "%Y-%m-%d") {
                    weekly_spent_map.insert((cid, w_date), amt);
                }
            }
        }
    }

    // Parse month start & end for monthly window dates
    let (month_start_str, month_end_str) = {
        let parts: Vec<&str> = current_month.split('-').collect();
        if parts.len() == 2 {
            if let (Ok(y), Ok(m)) = (parts[0].parse::<i32>(), parts[1].parse::<u32>()) {
                let start_d = chrono::NaiveDate::from_ymd_opt(y, m, 1).unwrap_or(as_of_date);
                let next_m_d = if m == 12 {
                    chrono::NaiveDate::from_ymd_opt(y + 1, 1, 1).unwrap_or(as_of_date)
                } else {
                    chrono::NaiveDate::from_ymd_opt(y, m + 1, 1).unwrap_or(as_of_date)
                };
                let end_d = next_m_d - chrono::Duration::days(1);
                (start_d.format("%Y-%m-%d").to_string(), end_d.format("%Y-%m-%d").to_string())
            } else {
                (format!("{}-01", current_month), format!("{}-28", current_month))
            }
        } else {
            (format!("{}-01", current_month), format!("{}-28", current_month))
        }
    };

    let mut inputs = Vec::new();
    for (id, name, group_type, limit, period, anchor_opt) in cat_list {
        let month_spent = month_spent_map.get(&id).copied().unwrap_or(0);

        if period == "weekly" {
            let anchor = anchor_opt
                .and_then(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok())
                .unwrap_or(curr_monday);

            let mut cat_weekly_map = std::collections::HashMap::new();
            for (&(cid, w_date), &amt) in &weekly_spent_map {
                if cid == id {
                    cat_weekly_map.insert(w_date, amt);
                }
            }

            let carry_res = crate::budget_engine::calculate_weekly_carry(limit, anchor, as_of_date, &cat_weekly_map);

            inputs.push(CategoryEnvelopeInput {
                id,
                name,
                group_type,
                period,
                base_limit: limit,
                carry_in: carry_res.carry_in,
                effective_limit: carry_res.effective_limit,
                spent_in_period: carry_res.spent_in_period,
                remaining: carry_res.remaining,
                window_start: carry_res.window_start,
                window_end: carry_res.window_end,
                month_spent,
            });
        } else {
            // monthly
            inputs.push(CategoryEnvelopeInput {
                id,
                name,
                group_type,
                period,
                base_limit: limit,
                carry_in: 0,
                effective_limit: limit,
                spent_in_period: month_spent,
                remaining: limit - month_spent,
                window_start: month_start_str.clone(),
                window_end: month_end_str.clone(),
                month_spent,
            });
        }
    }

    let mut overview = calculate_envelope_budget(monthly_income, &inputs);
    let net_savings = crate::db::transfers::get_monthly_net_savings_deposit(conn, current_month).unwrap_or(0);
    overview.savings.total_spent = net_savings;
    if overview.savings.total_limit > 0 {
        overview.savings.percentage = (net_savings as f64 / overview.savings.total_limit as f64) * 100.0;
    } else {
        overview.savings.percentage = 0.0;
    }

    Ok(overview)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::init_db;
    use chrono::NaiveDate;

    #[test]
    fn test_category_budget_crud_and_validation() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();
        init_db(&conn).unwrap();

        // 1. Set income = 5,000,000
        set_monthly_income(&conn, 5000000).unwrap();

        let makan_id: i64 = conn.query_row("SELECT id FROM categories WHERE name = 'Makan'", [], |r| r.get(0)).unwrap();
        let nongkrong_id: i64 = conn.query_row("SELECT id FROM categories WHERE name = 'Nongkrong'", [], |r| r.get(0)).unwrap();

        // 2. Set valid category budget (makan monthly 2,000,000, nongkrong monthly 1,500,000)
        assert!(set_category_budget(&conn, makan_id, "monthly", 2000000).is_ok());
        assert!(set_category_budget(&conn, nongkrong_id, "monthly", 1500000).is_ok());

        // 3. Verify get_category_budgets reflects these limits
        let budgets = get_category_budgets(&conn).unwrap();
        let makan_budget = budgets.iter().find(|b| b.category_id == makan_id).unwrap();
        assert_eq!(makan_budget.limit_amount, 2000000);
        assert_eq!(makan_budget.period, "monthly");
        let nongkrong_budget = budgets.iter().find(|b| b.category_id == nongkrong_id).unwrap();
        assert_eq!(nongkrong_budget.limit_amount, 1500000);
        assert_eq!(nongkrong_budget.period, "monthly");

        // 4. Setting budget that exceeds monthly_income (current: 2M + 1.5M = 3.5M, remaining: 1.5M)
        let exceed_err = set_category_budget(&conn, nongkrong_id, "monthly", 3500000);
        assert!(exceed_err.is_err());
        assert!(exceed_err.unwrap_err().contains("melebihi pendapatan bulanan"));

        // 5. Trying to reduce monthly_income below existing limits (current 3.5M) -> must fail
        let income_err = set_monthly_income(&conn, 3000000);
        assert!(income_err.is_err());
        assert!(income_err.unwrap_err().contains("tidak boleh lebih kecil"));

        // 6. Test overview calculation
        let overview = get_budget_overview(&conn, "2026-10").unwrap();
        assert_eq!(overview.monthly_income, 5000000);
        assert_eq!(overview.fixed.total_limit, 2000000);
        assert_eq!(overview.wants.total_limit, 1500000);
        assert_eq!(overview.savings_target, 1500000);
        assert!((overview.savings_ratio - 0.30).abs() < 1e-6);
        assert!(overview.meets_guideline);

        // 7. Verify category_budgets is NOT deleted on reset_all_data
        crate::db::schema::reset_all_data(&mut conn).unwrap();
        let budgets_after = get_category_budgets(&conn).unwrap();
        let makan_after = budgets_after.iter().find(|b| b.category_id == makan_id).unwrap();
        assert_eq!(makan_after.limit_amount, 2000000, "category_budgets must be preserved during reset");
    }

    #[test]
    fn test_weekly_budget_carry_over_with_transaction_edit_delete() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();
        init_db(&conn).unwrap();

        // Income = 10,000,000
        set_monthly_income(&conn, 10000000).unwrap();

        let makan_id: i64 = conn.query_row("SELECT id FROM categories WHERE name = 'Makan'", [], |r| r.get(0)).unwrap();

        // Set makan weekly budget of 100,000 with anchor_date 2026-10-05 (Monday W1)
        let anchor_str = "2026-10-05";
        conn.execute(
            "INSERT INTO category_budgets (category_id, limit_amount, period, anchor_date)
             VALUES (?1, 100000, 'weekly', ?2)",
            rusqlite::params![makan_id, anchor_str],
        ).unwrap();

        // 1. Minggu 1 (2026-10-06): belanja 70.000
        let tx_id = crate::db::transactions::create_transaction(
            &conn,
            70000,
            "expense",
            makan_id,
            "Makan siang W1",
            "2026-10-06",
            "manual",
            None,
            None,
        ).unwrap();

        // 2. Cek di Minggu 2 (2026-10-12): carry_in harus 30.000, effective_limit 130.000
        let w2_date = NaiveDate::from_ymd_opt(2026, 10, 12).unwrap();
        let overview_w2 = get_budget_overview_with_date(&conn, "2026-10", w2_date).unwrap();
        let makan_w2 = overview_w2.fixed.categories.iter().find(|c| c.category_id == makan_id).unwrap();
        assert_eq!(makan_w2.period, "weekly");
        assert_eq!(makan_w2.base_limit, 100000);
        assert_eq!(makan_w2.carry_in, 30000);
        assert_eq!(makan_w2.effective_limit, 130000);

        // 3. EDIT transaksi minggu lalu: ubah belanja W1 dari 70.000 menjadi 50.000
        crate::db::transactions::update_transaction(
            &conn,
            tx_id,
            50000,
            "expense",
            makan_id,
            "Makan siang W1 edited",
            "2026-10-06",
            None,
            None,
        ).unwrap();

        // Cek kembali di Minggu 2: carry_in harus otomatis naik jadi 50.000, effective_limit 150.000!
        let overview_w2_edited = get_budget_overview_with_date(&conn, "2026-10", w2_date).unwrap();
        let makan_w2_edited = overview_w2_edited.fixed.categories.iter().find(|c| c.category_id == makan_id).unwrap();
        assert_eq!(makan_w2_edited.carry_in, 50000);
        assert_eq!(makan_w2_edited.effective_limit, 150000);

        // 4. HAPUS transaksi minggu lalu
        crate::db::transactions::delete_transaction(&conn, tx_id).unwrap();

        // Cek kembali di Minggu 2: carry_in harus otomatis 100.000 (tidak ada belanja), effective_limit 200.000!
        let overview_w2_deleted = get_budget_overview_with_date(&conn, "2026-10", w2_date).unwrap();
        let makan_w2_deleted = overview_w2_deleted.fixed.categories.iter().find(|c| c.category_id == makan_id).unwrap();
        assert_eq!(makan_w2_deleted.carry_in, 100000);
        assert_eq!(makan_w2_deleted.effective_limit, 200000);
    }

    #[test]
    fn test_allocation_percents_crud_and_preserved_on_reset() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();
        init_db(&conn).unwrap();

        let makan_id: i64 = conn.query_row("SELECT id FROM categories WHERE name = 'Makan'", [], |r| r.get(0)).unwrap();
        let nongkrong_id: i64 = conn.query_row("SELECT id FROM categories WHERE name = 'Nongkrong'", [], |r| r.get(0)).unwrap();
        let galon_id: i64 = conn.query_row("SELECT id FROM categories WHERE name = 'Galon'", [], |r| r.get(0)).unwrap();

        // Save valid percents (including a 0 bp item which should be skipped)
        let items = vec![
            AllocationPercentItem { category_id: makan_id, bp: 2500 },
            AllocationPercentItem { category_id: nongkrong_id, bp: 1550 },
            AllocationPercentItem { category_id: galon_id, bp: 0 },
        ];
        assert!(save_allocation_percents(&mut conn, &items).is_ok());

        let saved = get_allocation_percents(&conn).unwrap();
        assert_eq!(saved.len(), 2);
        assert!(saved.iter().any(|i| i.category_id == makan_id && i.bp == 2500));
        assert!(saved.iter().any(|i| i.category_id == nongkrong_id && i.bp == 1550));
        assert!(!saved.iter().any(|i| i.category_id == galon_id));

        // Reject > 8000 bp
        let invalid_items = vec![
            AllocationPercentItem { category_id: makan_id, bp: 5000 },
            AllocationPercentItem { category_id: nongkrong_id, bp: 3100 },
        ];
        assert!(save_allocation_percents(&mut conn, &invalid_items).is_err());

        // Verify preserved after reset_all_data
        crate::db::schema::reset_all_data(&mut conn).unwrap();
        let saved_after_reset = get_allocation_percents(&conn).unwrap();
        assert_eq!(saved_after_reset.len(), 2);
    }
}
