use rusqlite::{Connection, Result, params};
use crate::budget_engine::SavingGoal;

pub fn list_saving_goals(conn: &Connection) -> Result<Vec<SavingGoal>, String> {
    // Left join with transactions to calculate current_amount dynamically
    let mut stmt = conn.prepare(
        "SELECT 
            sg.id, sg.name, sg.target_amount, sg.target_date, 
            COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount WHEN t.type = 'income' THEN -t.amount ELSE 0 END), 0) as current_amount
         FROM saving_goals sg
         LEFT JOIN transactions t ON t.saving_goal_id = sg.id
         GROUP BY sg.id, sg.name, sg.target_amount, sg.target_date
         ORDER BY sg.id ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(SavingGoal {
            id: row.get(0)?,
            name: row.get(1)?,
            target_amount: row.get(2)?,
            target_date: row.get(3)?,
            current_amount: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn create_saving_goal(
    conn: &Connection,
    name: &str,
    target_amount: i64,
    target_date: Option<&str>,
) -> Result<i64, String> {
    if target_amount <= 0 {
        return Err("Target amount must be > 0".to_string());
    }

    conn.execute(
        "INSERT INTO saving_goals (name, target_amount, target_date) VALUES (?1, ?2, ?3)",
        params![name, target_amount, target_date],
    ).map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

pub fn delete_saving_goal(conn: &Connection, id: i64) -> Result<(), String> {
    // If a goal is deleted, we can set saving_goal_id to NULL in transactions so we don't lose the transaction history
    conn.execute("UPDATE transactions SET saving_goal_id = NULL WHERE saving_goal_id = ?1", params![id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM saving_goals WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

