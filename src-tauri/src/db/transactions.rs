use rusqlite::{Connection, Result, params};
use crate::budget_engine::Transaction;

pub fn create_transaction(
    conn: &Connection,
    amount: i64,
    transaction_type: &str,
    category_id: i64,
    note: &str,
    transaction_date: &str,
    source: &str,
    saving_goal_id: Option<i64>,
) -> Result<i64, String> {
    if amount <= 0 {
        return Err("Amount must be greater than 0".to_string());
    }
    if transaction_type != "income" && transaction_type != "expense" {
        return Err("Type must be 'income' or 'expense'".to_string());
    }

    // validate category_id
    let mut stmt = conn.prepare("SELECT id FROM categories WHERE id = ?1").map_err(|e| e.to_string())?;
    let exists = stmt.exists([category_id]).map_err(|e| e.to_string())?;
    if !exists {
        return Err("Invalid category ID".to_string());
    }

    conn.execute(
        "INSERT INTO transactions (amount, type, category_id, note, source, transaction_date, saving_goal_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![amount, transaction_type, category_id, note, source, transaction_date, saving_goal_id],
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
) -> Result<Vec<Transaction>, String> {
    let mut query = "SELECT id, amount, type, category_id, note, transaction_date, source, saving_goal_id FROM transactions WHERE 1=1".to_string();
    
    if let Some(d) = date_filter {
        query.push_str(&format!(" AND transaction_date LIKE '{}%'", d));
    }
    if let Some(t) = type_filter {
        query.push_str(&format!(" AND type = '{}'", t));
    }
    if let Some(c) = category_id_filter {
        query.push_str(&format!(" AND category_id = {}", c));
    }
    if let Some(sd) = start_date {
        query.push_str(&format!(" AND transaction_date >= '{}'", sd));
    }
    if let Some(ed) = end_date {
        query.push_str(&format!(" AND transaction_date <= '{}'", ed));
    }
    
    query.push_str(" ORDER BY transaction_date DESC, id DESC");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(Transaction {
            id: row.get(0)?,
            amount: row.get(1)?,
            transaction_type: row.get(2)?,
            category_id: row.get(3)?,
            note: row.get(4)?,
            transaction_date: row.get(5)?,
            source: row.get(6).unwrap_or_else(|_| "manual".to_string()),
            saving_goal_id: row.get(7).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?;

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
) -> Result<(), String> {
    if amount <= 0 { return Err("Amount > 0 required".to_string()); }
    
    conn.execute(
        "UPDATE transactions SET amount=?1, type=?2, category_id=?3, note=?4, transaction_date=?5, saving_goal_id=?6 WHERE id=?7",
        params![amount, transaction_type, category_id, note, transaction_date, saving_goal_id, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_transaction(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM transactions WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}



