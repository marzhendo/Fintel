use rusqlite::{Connection, Result, params, OptionalExtension};
use serde::{Deserialize, Serialize};
use chrono::Local;

#[derive(Serialize, Deserialize, Clone)]
pub struct Debt {
    pub id: i64,
    pub r#type: String, // 'receivable' | 'payable'
    pub counterparty_name: String,
    pub amount: i64,
    pub description: Option<String>,
    pub due_date: Option<String>,
    pub status: String, // 'unpaid' | 'paid'
    pub settled_transaction_id: Option<i64>,
    pub created_at: String,
    pub paid_at: Option<String>,
    pub last_notified_date: Option<String>,
}

pub fn create_debt(
    conn: &mut Connection,
    r#type: &str,
    counterparty_name: &str,
    amount: i64,
    description: Option<&str>,
    due_date: Option<&str>,
    account_id: Option<i64>,
) -> Result<i64, String> {
    let resolved_account_id = crate::db::accounts::resolve_account_id(conn, account_id)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO debts (type, counterparty_name, amount, description, due_date) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![r#type, counterparty_name, amount, description, due_date]
    ).map_err(|e| e.to_string())?;
    let debt_id = tx.last_insert_rowid();

    let today = Local::now().format("%Y-%m-%d").to_string();
    let (tx_type, cat_name, note) = if r#type == "receivable" {
        ("expense", "Talangan Diberikan", format!("Piutang ke {}", counterparty_name))
    } else {
        ("income", "Pinjaman Diterima", format!("Utang dari {}", counterparty_name))
    };

    let cat_id: i64 = tx.query_row(
        "SELECT id FROM categories WHERE name = ?1 AND transaction_type = 'transfer'",
        params![cat_name],
        |r| r.get(0)
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO transactions (amount, type, category_id, note, source, transaction_date, related_debt_id, account_id) VALUES (?1, ?2, ?3, ?4, 'manual', ?5, ?6, ?7)",
        params![amount, tx_type, cat_id, note, today, debt_id, resolved_account_id]
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(debt_id)
}

pub fn list_debts(conn: &Connection, filter_type: Option<&str>, filter_status: Option<&str>) -> Result<Vec<Debt>, String> {
    let mut query = "SELECT id, type, counterparty_name, amount, description, due_date, status, settled_transaction_id, created_at, paid_at, last_notified_date FROM debts WHERE 1=1".to_string();
    
    if filter_type.is_some() { query.push_str(" AND type = ?1"); }
    if filter_status.is_some() { query.push_str(if filter_type.is_some() { " AND status = ?2" } else { " AND status = ?1" }); }
    
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    
    let mut param_values: Vec<String> = Vec::new();
    if let Some(t) = filter_type { param_values.push(t.to_string()); }
    if let Some(s) = filter_status { param_values.push(s.to_string()); }
    
    let params: Vec<&dyn rusqlite::ToSql> = param_values.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
    
    let rows = stmt.query_map(&params[..], |row| {
        Ok(Debt {
            id: row.get(0)?,
            r#type: row.get(1)?,
            counterparty_name: row.get(2)?,
            amount: row.get(3)?,
            description: row.get(4)?,
            due_date: row.get(5)?,
            status: row.get(6)?,
            settled_transaction_id: row.get(7)?,
            created_at: row.get(8)?,
            paid_at: row.get(9)?,
            last_notified_date: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut debts = Vec::new();
    for r in rows { debts.push(r.map_err(|e| e.to_string())?); }
    Ok(debts)
}

pub fn delete_debt(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM debts WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn mark_debt_paid(conn: &mut Connection, id: i64, account_id: Option<i64>) -> Result<(), String> {
    let resolved_account_id = crate::db::accounts::resolve_account_id(conn, account_id)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // Check current debt
    let debt: Debt = match tx.query_row(
        "SELECT id, type, counterparty_name, amount, description, due_date, status, settled_transaction_id, created_at, paid_at, last_notified_date FROM debts WHERE id = ?1",
        [id],
        |row| Ok(Debt {
            id: row.get(0)?,
            r#type: row.get(1)?,
            counterparty_name: row.get(2)?,
            amount: row.get(3)?,
            description: row.get(4)?,
            due_date: row.get(5)?,
            status: row.get(6)?,
            settled_transaction_id: row.get(7)?,
            created_at: row.get(8)?,
            paid_at: row.get(9)?,
            last_notified_date: row.get(10)?,
        })
    ).optional().map_err(|e| e.to_string())? {
        Some(d) => d,
        None => return Err("Debt not found".to_string()),
    };
    
    if debt.status == "paid" {
        return Err("Debt is already paid".to_string());
    }
    
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let today = Local::now().format("%Y-%m-%d").to_string();
    
    let (tx_type, cat_name, note, cat_transaction_type, group_type) = if debt.r#type == "receivable" {
        ("income", "Pembayaran Piutang", format!("Pelunasan piutang dari {}", debt.counterparty_name), "transfer", None as Option<&str>)
    } else {
        ("expense", "Pembayaran Utang", format!("Pelunasan utang ke {}", debt.counterparty_name), "expense", Some("needs"))
    };
    
    let cat_id: i64 = match tx.query_row("SELECT id FROM categories WHERE name = ?1 AND transaction_type = ?2", params![cat_name, cat_transaction_type], |r| r.get(0)).optional().map_err(|e| e.to_string())? {
        Some(id) => id,
        None => {
            tx.execute("INSERT INTO categories (name, group_type, transaction_type) VALUES (?1, ?2, ?3)", params![cat_name, group_type, cat_transaction_type]).map_err(|e| e.to_string())?;
            tx.last_insert_rowid()
        }
    };
    
    tx.execute(
        "INSERT INTO transactions (amount, type, category_id, note, source, transaction_date, related_debt_id, account_id) VALUES (?1, ?2, ?3, ?4, 'manual', ?5, ?6, ?7)",
        params![debt.amount, tx_type, cat_id, note, today, id, resolved_account_id]
    ).map_err(|e| e.to_string())?;
    
    let tx_id = tx.last_insert_rowid();
    
    tx.execute(
        "UPDATE debts SET status = 'paid', settled_transaction_id = ?1, paid_at = ?2 WHERE id = ?3",
        params![tx_id, now, id]
    ).map_err(|e| e.to_string())?;
    
    tx.commit().map_err(|e| e.to_string())?;
    
    Ok(())
}
