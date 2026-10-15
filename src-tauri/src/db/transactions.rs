use crate::budget_engine::Transaction;
use rusqlite::{params, Connection, Result};

pub fn create_transaction(
    conn: &Connection,
    amount: i64,
    transaction_type: &str,
    category_id: i64,
    note: &str,
    transaction_date: &str,
    source: &str,
    saving_goal_id: Option<i64>,
    account_id: Option<i64>,
) -> Result<i64, String> {
    if amount <= 0 {
        return Err("Amount must be greater than 0".to_string());
    }
    if transaction_type != "income" && transaction_type != "expense" {
        return Err("Type must be 'income' or 'expense'".to_string());
    }

    // validate category_id
    let mut stmt = conn
        .prepare("SELECT id FROM categories WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let exists = stmt.exists([category_id]).map_err(|e| e.to_string())?;
    if !exists {
        return Err("Invalid category ID".to_string());
    }

    let resolved_account_id = crate::db::accounts::resolve_account_id(conn, account_id)?;

    conn.execute(
        "INSERT INTO transactions (amount, type, category_id, note, source, transaction_date, saving_goal_id, account_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![amount, transaction_type, category_id, note, source, transaction_date, saving_goal_id, resolved_account_id],
    ).map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

pub fn list_transactions(
    conn: &Connection,
    date_filter: Option<&str>,
    type_filter: Option<&str>,
    category_id_filter: Option<i64>,
    start_date: Option<&str>,
    end_date: Option<&str>,
    account_id_filter: Option<i64>,
) -> Result<Vec<Transaction>, String> {
    let mut query = "SELECT t.id, t.amount, t.type, t.category_id, t.note, t.transaction_date, t.source, t.saving_goal_id, t.related_debt_id, t.account_id, a.name AS account_name
                     FROM transactions t
                     LEFT JOIN accounts a ON t.account_id = a.id
                     WHERE 1=1".to_string();

    if let Some(d) = date_filter {
        query.push_str(&format!(" AND t.transaction_date LIKE '{}%'", d));
    }
    if let Some(t) = type_filter {
        query.push_str(&format!(" AND t.type = '{}'", t));
    }
    if let Some(c) = category_id_filter {
        query.push_str(&format!(" AND t.category_id = {}", c));
    }
    if let Some(sd) = start_date {
        query.push_str(&format!(" AND t.transaction_date >= '{}'", sd));
    }
    if let Some(ed) = end_date {
        query.push_str(&format!(" AND t.transaction_date <= '{}'", ed));
    }
    if let Some(aid) = account_id_filter {
        query.push_str(&format!(" AND t.account_id = {}", aid));
    }

    query.push_str(" ORDER BY t.transaction_date DESC, t.id DESC");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Transaction {
                id: row.get(0)?,
                amount: row.get(1)?,
                transaction_type: row.get(2)?,
                category_id: row.get(3)?,
                note: row.get(4)?,
                transaction_date: row.get(5)?,
                source: row.get(6).unwrap_or_else(|_| "manual".to_string()),
                saving_goal_id: row.get(7).unwrap_or(None),
                related_debt_id: row.get(8).unwrap_or(None),
                account_id: row.get(9)?,
                account_name: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn list_operational_transactions(
    conn: &Connection,
    date_filter: Option<&str>,
) -> Result<Vec<Transaction>, String> {
    let mut query = "SELECT t.id, t.amount, t.type, t.category_id, t.note, t.transaction_date, t.source, t.saving_goal_id, t.related_debt_id, t.account_id, a.name AS account_name
                     FROM operational_transactions t
                     LEFT JOIN accounts a ON t.account_id = a.id
                     WHERE 1=1".to_string();

    if let Some(d) = date_filter {
        query.push_str(&format!(" AND t.transaction_date LIKE '{}%'", d));
    }
    query.push_str(" ORDER BY t.transaction_date DESC, t.id DESC");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Transaction {
                id: row.get(0)?,
                amount: row.get(1)?,
                transaction_type: row.get(2)?,
                category_id: row.get(3)?,
                note: row.get(4)?,
                transaction_date: row.get(5)?,
                source: row.get(6).unwrap_or_else(|_| "manual".to_string()),
                saving_goal_id: row.get(7).unwrap_or(None),
                related_debt_id: row.get(8).unwrap_or(None),
                account_id: row.get(9)?,
                account_name: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn update_transaction(
    conn: &Connection,
    id: i64,
    amount: i64,
    transaction_type: &str,
    category_id: i64,
    note: &str,
    transaction_date: &str,
    saving_goal_id: Option<i64>,
    account_id: Option<i64>,
) -> Result<(), String> {
    if amount <= 0 {
        return Err("Amount > 0 required".to_string());
    }

    let resolved_account_id = crate::db::accounts::resolve_account_id(conn, account_id)?;

    conn.execute(
        "UPDATE transactions SET amount=?1, type=?2, category_id=?3, note=?4, transaction_date=?5, saving_goal_id=?6, account_id=?7 WHERE id=?8",
        params![amount, transaction_type, category_id, note, transaction_date, saving_goal_id, resolved_account_id, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_transaction(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM transactions WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
use serde::Serialize;


#[derive(Serialize)]
pub struct DailyTotal {
    pub date: String,
    pub total: i64,
}

pub fn get_daily_totals(conn: &Connection, month_prefix: &str) -> Result<Vec<DailyTotal>, String> {
    let like_pattern = format!("{}%", month_prefix);
    let mut stmt = conn.prepare("
        SELECT transaction_date as d, SUM(amount)
        FROM operational_transactions
        WHERE type = 'expense' AND transaction_date LIKE ?1
        GROUP BY d
        ORDER BY d ASC
    ").map_err(|e| e.to_string())?;

    let rows = stmt.query_map([&like_pattern], |row| {
        Ok(DailyTotal {
            date: row.get(0)?,
            total: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for r in rows {
        if let Ok(rt) = r { result.push(rt); }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::init_db;

    #[test]
    fn test_get_daily_totals_aggregates_expenses_by_date() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();

        let makan_id: i64 = conn
            .query_row("SELECT id FROM categories WHERE name = 'Makan'", [], |r| r.get(0))
            .unwrap();
        let gaji_id: i64 = conn
            .query_row("SELECT id FROM categories WHERE transaction_type = 'income' LIMIT 1", [], |r| r.get(0))
            .unwrap();

        // Insert 2 expenses on 2026-10-12, 1 expense on 2026-10-10, and 1 income on 2026-10-01
        create_transaction(&conn, 25_000, "expense", makan_id, "Siang", "2026-10-12", "manual", None, None).unwrap();
        create_transaction(&conn, 18_000, "expense", makan_id, "Kopi", "2026-10-12", "manual", None, None).unwrap();
        create_transaction(&conn, 50_000, "expense", makan_id, "Malam", "2026-10-10", "manual", None, None).unwrap();
        create_transaction(&conn, 5_000_000, "income", gaji_id, "Gaji", "2026-10-01", "manual", None, None).unwrap();

        let totals = get_daily_totals(&conn, "2026-10").unwrap();
        assert_eq!(totals.len(), 2);
        assert_eq!(totals[0].date, "2026-10-10");
        assert_eq!(totals[0].total, 50_000);
        assert_eq!(totals[1].date, "2026-10-12");
        assert_eq!(totals[1].total, 43_000);
    }
}


