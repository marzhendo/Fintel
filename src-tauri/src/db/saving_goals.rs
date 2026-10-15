use crate::budget_engine::SavingGoal;
use rusqlite::{params, Connection, Result};

pub fn list_saving_goals(conn: &Connection) -> Result<Vec<SavingGoal>, String> {
    // Dynamically calculate progress from transfers: SUM(deposit) - SUM(withdrawal), min 0
    let mut stmt = conn
        .prepare(
            "SELECT 
                sg.id, sg.name, sg.target_amount, sg.target_date, sg.account_id, a.name as account_name,
                COALESCE(SUM(CASE 
                    WHEN tr.saving_effect = 'deposit' THEN tr.amount 
                    WHEN tr.saving_effect = 'withdrawal' THEN -tr.amount 
                    ELSE 0 
                END), 0) as net_amount
             FROM saving_goals sg
             LEFT JOIN accounts a ON sg.account_id = a.id
             LEFT JOIN transfers tr ON tr.saving_goal_id = sg.id
             GROUP BY sg.id, sg.name, sg.target_amount, sg.target_date, sg.account_id, a.name
             ORDER BY sg.id ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let net_amount: i64 = row.get(6)?;
            Ok(SavingGoal {
                id: row.get(0)?,
                name: row.get(1)?,
                target_amount: row.get(2)?,
                target_date: row.get(3)?,
                account_id: row.get(4)?,
                account_name: row.get(5)?,
                current_amount: net_amount.max(0),
            })
        })
        .map_err(|e| e.to_string())?;

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
    account_id: Option<i64>,
) -> Result<i64, String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Nama target goal tidak boleh kosong.".to_string());
    }
    if target_amount <= 0 {
        return Err("Target amount must be > 0".to_string());
    }

    let final_acc_id: i64 = match account_id {
        Some(id) => {
            let is_sav: Option<i64> = conn
                .query_row(
                    "SELECT is_savings FROM accounts WHERE id = ?1",
                    [id],
                    |r| r.get(0),
                )
                .ok();
            match is_sav {
                Some(1) => id,
                Some(_) => {
                    return Err(
                        "Target goal hanya dapat dihubungkan ke akun bertipe Tabungan.".to_string(),
                    )
                }
                None => return Err("Akun Tabungan tidak ditemukan.".to_string()),
            }
        }
        None => {
            // Find default or first Tabungan account
            conn.query_row(
                "SELECT id FROM accounts WHERE is_savings = 1 AND is_archived = 0 ORDER BY is_default DESC, id ASC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .map_err(|_| "Belum ada akun Tabungan yang tersedia. Silakan buat akun Tabungan terlebih dahulu.".to_string())?
        }
    };

    conn.execute(
        "INSERT INTO saving_goals (name, target_amount, target_date, account_id) VALUES (?1, ?2, ?3, ?4)",
        params![trimmed_name, target_amount, target_date, final_acc_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

pub fn delete_saving_goal(conn: &Connection, id: i64) -> Result<(), String> {
    // If a goal is deleted, set saving_goal_id to NULL in transfers and transactions
    conn.execute(
        "UPDATE transfers SET saving_goal_id = NULL WHERE saving_goal_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE transactions SET saving_goal_id = NULL WHERE saving_goal_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM saving_goals WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn update_saving_goal(
    conn: &Connection,
    id: i64,
    name: &str,
    target_amount: i64,
    target_date: Option<&str>,
    account_id: Option<i64>,
) -> Result<(), String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Nama target goal tidak boleh kosong.".to_string());
    }
    if target_amount <= 0 {
        return Err("Target amount must be > 0".to_string());
    }

    if let Some(acc_id) = account_id {
        let is_sav: Option<i64> = conn
            .query_row(
                "SELECT is_savings FROM accounts WHERE id = ?1",
                [acc_id],
                |r| r.get(0),
            )
            .ok();
        match is_sav {
            Some(1) => {}
            Some(_) => return Err("Target goal hanya dapat dihubungkan ke akun bertipe Tabungan.".to_string()),
            None => return Err("Akun Tabungan tidak ditemukan.".to_string()),
        }
    }

    conn.execute(
        "UPDATE saving_goals SET name = ?1, target_amount = ?2, target_date = ?3, account_id = COALESCE(?4, account_id) WHERE id = ?5",
        params![trimmed_name, target_amount, target_date, account_id, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
