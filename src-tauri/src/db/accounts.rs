use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Account {
    pub id: i64,
    pub name: String,
    pub account_type: String, // 'cash' | 'bank' | 'ewallet'
    pub opening_balance: i64,
    pub current_balance: i64,
    pub icon: String,
    pub color: String,
    pub is_default: bool,
    pub is_archived: bool,
    pub is_savings: bool,
    pub transaction_count: i64,
    pub created_at: String,
}

pub fn list_accounts(conn: &Connection, include_archived: bool) -> Result<Vec<Account>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT
                a.id,
                a.name,
                a.type,
                a.opening_balance,
                (
                    a.opening_balance 
                    + COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount WHEN t.type = 'expense' THEN -t.amount ELSE 0 END) FROM transactions t WHERE t.account_id = a.id), 0)
                    + COALESCE((SELECT SUM(amount) FROM transfers WHERE to_account_id = a.id), 0)
                    - COALESCE((SELECT SUM(amount) FROM transfers WHERE from_account_id = a.id), 0)
                ) AS current_balance,
                a.icon,
                a.color,
                a.is_default,
                a.is_archived,
                (
                    COALESCE((SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id), 0)
                    + COALESCE((SELECT COUNT(*) FROM transfers tr WHERE tr.from_account_id = a.id OR tr.to_account_id = a.id), 0)
                ) AS transaction_count,
                a.is_savings,
                a.created_at
            FROM accounts a
            WHERE (?1 = 1 OR a.is_archived = 0)
            ORDER BY a.is_default DESC, a.is_archived ASC, a.id ASC",
        )
        .map_err(|e| e.to_string())?;

    let include_archived_int = if include_archived { 1 } else { 0 };
    let rows = stmt
        .query_map([include_archived_int], |row| {
            let is_def: i64 = row.get(7)?;
            let is_arc: i64 = row.get(8)?;
            let is_sav: i64 = row.get(10)?;
            Ok(Account {
                id: row.get(0)?,
                name: row.get(1)?,
                account_type: row.get(2)?,
                opening_balance: row.get(3)?,
                current_balance: row.get(4)?,
                icon: row.get(5)?,
                color: row.get(6)?,
                is_default: is_def == 1,
                is_archived: is_arc == 1,
                transaction_count: row.get(9)?,
                is_savings: is_sav == 1,
                created_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| e.to_string())?);
    }
    Ok(list)
}

pub fn get_account_by_id(conn: &Connection, id: i64) -> Result<Account, String> {
    let mut stmt = conn
        .prepare(
            "SELECT
                a.id,
                a.name,
                a.type,
                a.opening_balance,
                (
                    a.opening_balance 
                    + COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount WHEN t.type = 'expense' THEN -t.amount ELSE 0 END) FROM transactions t WHERE t.account_id = a.id), 0)
                    + COALESCE((SELECT SUM(amount) FROM transfers WHERE to_account_id = a.id), 0)
                    - COALESCE((SELECT SUM(amount) FROM transfers WHERE from_account_id = a.id), 0)
                ) AS current_balance,
                a.icon,
                a.color,
                a.is_default,
                a.is_archived,
                (
                    COALESCE((SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id), 0)
                    + COALESCE((SELECT COUNT(*) FROM transfers tr WHERE tr.from_account_id = a.id OR tr.to_account_id = a.id), 0)
                ) AS transaction_count,
                a.is_savings,
                a.created_at
            FROM accounts a
            WHERE a.id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let acc = stmt
        .query_row([id], |row| {
            let is_def: i64 = row.get(7)?;
            let is_arc: i64 = row.get(8)?;
            let is_sav: i64 = row.get(10)?;
            Ok(Account {
                id: row.get(0)?,
                name: row.get(1)?,
                account_type: row.get(2)?,
                opening_balance: row.get(3)?,
                current_balance: row.get(4)?,
                icon: row.get(5)?,
                color: row.get(6)?,
                is_default: is_def == 1,
                is_archived: is_arc == 1,
                transaction_count: row.get(9)?,
                is_savings: is_sav == 1,
                created_at: row.get(11)?,
            })
        })
        .map_err(|_| "Akun tidak ditemukan.".to_string())?;

    Ok(acc)
}

pub fn get_default_account_id(conn: &Connection) -> Result<i64, String> {
    conn.query_row(
        "SELECT id FROM accounts WHERE is_default = 1 AND is_archived = 0 LIMIT 1",
        [],
        |r| r.get(0),
    )
    .or_else(|_| {
        conn.query_row(
            "SELECT id FROM accounts WHERE is_archived = 0 ORDER BY id ASC LIMIT 1",
            [],
            |r| r.get(0),
        )
    })
    .or_else(|_| {
        conn.query_row(
            "SELECT id FROM accounts ORDER BY id ASC LIMIT 1",
            [],
            |r| r.get(0),
        )
    })
    .map_err(|e| format!("Tidak ada akun yang tersedia: {}", e))
}

pub fn get_last_used_account_id(conn: &Connection) -> Result<i64, String> {
    let last_id_opt: Option<i64> = conn
        .query_row(
            "SELECT t.account_id
             FROM transactions t
             JOIN accounts a ON t.account_id = a.id
             WHERE a.is_archived = 0
             ORDER BY t.id DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok();

    if let Some(id) = last_id_opt {
        Ok(id)
    } else {
        get_default_account_id(conn)
    }
}

pub fn resolve_account_id(conn: &Connection, account_id: Option<i64>) -> Result<i64, String> {
    if let Some(id) = account_id {
        if id > 0 {
            let exists: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM accounts WHERE id = ?1",
                    [id],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if exists > 0 {
                return Ok(id);
            }
        }
    }
    get_last_used_account_id(conn)
}

pub fn create_account(
    conn: &mut Connection,
    name: &str,
    account_type: &str,
    icon: Option<&str>,
    color: Option<&str>,
    opening_balance: Option<i64>,
    is_default: Option<bool>,
    is_savings: Option<bool>,
) -> Result<i64, String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Nama akun tidak boleh kosong.".to_string());
    }

    let (actual_type, actual_is_savings) = if account_type == "savings" {
        ("bank", true)
    } else {
        (account_type, is_savings.unwrap_or(false))
    };

    let valid_types = ["cash", "bank", "ewallet"];
    if !valid_types.contains(&actual_type) {
        return Err(format!("Tipe akun '{}' tidak valid.", actual_type));
    }

    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM accounts WHERE LOWER(name) = LOWER(?1)",
            [trimmed_name],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if exists > 0 {
        return Err(format!("Akun dengan nama '{}' sudah ada.", trimmed_name));
    }

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM accounts", [], |r| r.get(0))
        .unwrap_or(0);

    let should_be_default = if count == 0 {
        true
    } else {
        is_default.unwrap_or(false)
    };

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    if should_be_default {
        tx.execute("UPDATE accounts SET is_default = 0", [])
            .map_err(|e| e.to_string())?;
    }

    let icon_val = icon.unwrap_or(match actual_type {
        "bank" => "account_balance",
        "ewallet" => "wallet",
        _ => "payments",
    });
    let color_val = color.unwrap_or(match actual_type {
        "bank" => "#0058be",
        "ewallet" => "#6b38d4",
        _ => "#006948",
    });
    let op_bal = opening_balance.unwrap_or(0);

    tx.execute(
        "INSERT INTO accounts (name, type, opening_balance, icon, color, is_default, is_archived, is_savings)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
        params![
            trimmed_name,
            actual_type,
            op_bal,
            icon_val,
            color_val,
            if should_be_default { 1 } else { 0 },
            if actual_is_savings { 1 } else { 0 }
        ],
    )
    .map_err(|e| e.to_string())?;

    let new_id = tx.last_insert_rowid();
    tx.commit().map_err(|e| e.to_string())?;

    Ok(new_id)
}

pub fn update_account(
    conn: &Connection,
    id: i64,
    name: &str,
    account_type: &str,
    icon: Option<&str>,
    color: Option<&str>,
    opening_balance: i64,
    is_savings: Option<bool>,
) -> Result<(), String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Nama akun tidak boleh kosong.".to_string());
    }

    let (actual_type, target_is_savings) = if account_type == "savings" {
        ("bank", true)
    } else {
        (account_type, is_savings.unwrap_or(false))
    };

    let valid_types = ["cash", "bank", "ewallet"];
    if !valid_types.contains(&actual_type) {
        return Err(format!("Tipe akun '{}' tidak valid.", actual_type));
    }

    let name_conflict: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM accounts WHERE LOWER(name) = LOWER(?1) AND id != ?2",
            params![trimmed_name, id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if name_conflict > 0 {
        return Err(format!("Akun dengan nama '{}' sudah ada.", trimmed_name));
    }

    // Rule: Fungsi akun tidak bisa diubah dari Tabungan ke Harian selama masih ada goal terhubung
    let current_is_savings: i64 = conn
        .query_row("SELECT is_savings FROM accounts WHERE id = ?1", [id], |r| {
            r.get(0)
        })
        .map_err(|_| "Akun tidak ditemukan.".to_string())?;

    if current_is_savings == 1 && !target_is_savings {
        let goal_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM saving_goals WHERE account_id = ?1",
                [id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if goal_count > 0 {
            return Err(
                "Tidak dapat mengubah akun Tabungan menjadi Harian karena masih ada target goal yang terhubung. Pindahkan atau hapus goal tersebut terlebih dahulu."
                    .to_string(),
            );
        }
    }

    let icon_val = icon.unwrap_or("payments");
    let color_val = color.unwrap_or("#006948");

    conn.execute(
        "UPDATE accounts SET name = ?1, type = ?2, icon = ?3, color = ?4, opening_balance = ?5, is_savings = ?6 WHERE id = ?7",
        params![
            trimmed_name,
            actual_type,
            icon_val,
            color_val,
            opening_balance,
            if target_is_savings { 1 } else { 0 },
            id
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn archive_account(conn: &Connection, id: i64) -> Result<(), String> {
    let acc = get_account_by_id(conn, id)?;

    if acc.current_balance != 0 {
        return Err(format!(
            "Akun '{}' hanya dapat diarsipkan jika saldonya Rp 0. Saat ini saldo masih Rp {}.",
            acc.name, acc.current_balance
        ));
    }

    if acc.is_default {
        return Err(
            "Akun utama (default) tidak dapat diarsipkan. Jadikan akun lain sebagai default terlebih dahulu.".to_string(),
        );
    }

    conn.execute("UPDATE accounts SET is_archived = 1 WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn unarchive_account(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("UPDATE accounts SET is_archived = 0 WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_default_account(conn: &mut Connection, id: i64) -> Result<(), String> {
    let acc = get_account_by_id(conn, id)?;
    if acc.is_archived {
        return Err("Akun yang diarsipkan tidak dapat dijadikan akun default.".to_string());
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("UPDATE accounts SET is_default = 0", [])
        .map_err(|e| e.to_string())?;
    tx.execute("UPDATE accounts SET is_default = 1 WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

pub fn get_total_balance(conn: &Connection) -> Result<i64, String> {
    let accounts = list_accounts(conn, false)?;
    Ok(accounts.iter().map(|a| a.current_balance).sum())
}

pub fn get_available_balance(conn: &Connection) -> Result<i64, String> {
    let accounts = list_accounts(conn, false)?;
    Ok(accounts
        .iter()
        .filter(|a| !a.is_savings)
        .map(|a| a.current_balance)
        .sum())
}

pub fn get_savings_balance(conn: &Connection) -> Result<i64, String> {
    let accounts = list_accounts(conn, false)?;
    Ok(accounts
        .iter()
        .filter(|a| a.is_savings)
        .map(|a| a.current_balance)
        .sum())
}

pub fn get_opening_balance_sum(conn: &Connection) -> Result<i64, String> {
    conn.query_row(
        "SELECT COALESCE(SUM(opening_balance), 0) FROM accounts WHERE is_archived = 0",
        [],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::init_db;

    #[test]
    fn test_accounts_migration_and_total_balance_invariant() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();

        // 1. Simulate old schema without accounts table and without account_id in transactions
        conn.execute_batch(
            "
            CREATE TABLE categories (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                group_type TEXT,
                transaction_type TEXT NOT NULL DEFAULT 'expense'
            );
            CREATE TABLE transactions (
                id INTEGER PRIMARY KEY,
                amount INTEGER NOT NULL,
                type TEXT NOT NULL,
                category_id INTEGER REFERENCES categories(id),
                note TEXT,
                source TEXT NOT NULL DEFAULT 'manual',
                transaction_date DATE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE debts (
                id INTEGER PRIMARY KEY,
                type TEXT NOT NULL,
                counterparty_name TEXT NOT NULL,
                amount INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'unpaid'
            );
            CREATE TABLE saving_goals (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL DEFAULT 'Target Tabungan',
                target_amount INTEGER NOT NULL
            );
            CREATE TABLE budget_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                monthly_income INTEGER NOT NULL DEFAULT 0,
                language TEXT NOT NULL DEFAULT 'id'
            );
            CREATE TABLE category_budgets (
                category_id INTEGER PRIMARY KEY REFERENCES categories(id),
                limit_amount INTEGER NOT NULL DEFAULT 0,
                period TEXT NOT NULL DEFAULT 'monthly',
                anchor_date DATE
            );
            CREATE TABLE allocation_percents (
                category_id INTEGER PRIMARY KEY REFERENCES categories(id),
                bp INTEGER NOT NULL
            );
            INSERT INTO categories (id, name, group_type, transaction_type) VALUES
                (1, 'Gaji', NULL, 'income'),
                (2, 'Makan', 'fixed', 'expense'),
                (3, 'Talangan Diberikan', NULL, 'transfer');
            INSERT INTO transactions (id, amount, type, category_id, note, transaction_date) VALUES
                (1, 5000000, 'income', 1, 'Gaji', '2026-10-01'),
                (2, 25000, 'expense', 2, 'Makan Siang', '2026-10-02'),
                (3, 50000, 'expense', 3, 'Talangan Teman', '2026-10-03');
            ",
        ).unwrap();

        // Pre-migration total balance: 5000000 - 25000 - 50000 = 4925000
        let pre_migration_balance: i64 = conn.query_row(
            "SELECT SUM(CASE WHEN type = 'income' THEN amount WHEN type = 'expense' THEN -amount ELSE 0 END) FROM transactions",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(pre_migration_balance, 4925000);

        // 2. Run init_db (which performs the accounts migration & seeding)
        init_db(&conn).unwrap();

        // 3. Verify accounts table was created and has default Cash and Tabungan accounts
        let accounts = list_accounts(&conn, false).unwrap();
        assert!(accounts.len() >= 1);
        let cash_acc = accounts.iter().find(|a| a.name == "Cash").unwrap();
        assert_eq!(cash_acc.account_type, "cash");
        assert!(cash_acc.is_default);
        assert_eq!(cash_acc.opening_balance, 0);

        // 4. Verify all pre-existing transactions now reference the Cash account
        let null_acc_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM transactions WHERE account_id IS NULL",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(null_acc_count, 0, "No transactions should have NULL account_id after migration");

        // Tersedia (Cash) balance should be identical to pre-migration balance
        assert_eq!(cash_acc.current_balance, pre_migration_balance);
    }

    #[test]
    fn test_account_crud_and_saldo_logic() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();
        init_db(&conn).unwrap();

        let bca_id = create_account(
            &mut conn,
            "BCA",
            "bank",
            Some("account_balance"),
            Some("#0058be"),
            Some(1_000_000),
            Some(false),
            Some(false),
        ).unwrap();

        let gopay_id = create_account(
            &mut conn,
            "GoPay",
            "ewallet",
            Some("wallet"),
            Some("#6b38d4"),
            Some(100_000),
            Some(false),
            Some(false),
        ).unwrap();

        // Add transaction to BCA (expense 150.000)
        let makan_id: i64 = conn.query_row("SELECT id FROM categories WHERE name = 'Makan'", [], |r| r.get(0)).unwrap();
        crate::db::transactions::create_transaction(
            &conn,
            150_000,
            "expense",
            makan_id,
            "Restoran",
            "2026-10-10",
            "manual",
            None,
            Some(bca_id),
        ).unwrap();

        // Add transaction to GoPay (income 50.000)
        let gaji_id: i64 = conn.query_row("SELECT id FROM categories WHERE transaction_type = 'income' LIMIT 1", [], |r| r.get(0)).unwrap();
        crate::db::transactions::create_transaction(
            &conn,
            50_000,
            "income",
            gaji_id,
            "Topup Cashback",
            "2026-10-10",
            "manual",
            None,
            Some(gopay_id),
        ).unwrap();

        let bca_acc = get_account_by_id(&conn, bca_id).unwrap();
        assert_eq!(bca_acc.opening_balance, 1_000_000);
        assert_eq!(bca_acc.current_balance, 850_000); // 1.000.000 - 150.000
        assert_eq!(bca_acc.transaction_count, 1);

        let gopay_acc = get_account_by_id(&conn, gopay_id).unwrap();
        assert_eq!(gopay_acc.opening_balance, 100_000);
        assert_eq!(gopay_acc.current_balance, 150_000); // 100.000 + 50.000
        assert_eq!(gopay_acc.transaction_count, 1);

        // Total balance = 850.000 + 150.000 + 0 = 1.000.000
        assert_eq!(get_total_balance(&conn).unwrap(), 1_000_000);
    }

    #[test]
    fn test_account_cannot_change_savings_to_daily_if_goals_connected() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();
        init_db(&conn).unwrap();

        // Create a Tabungan account
        let tabungan_id = create_account(
            &mut conn,
            "Bank Tabungan",
            "bank",
            None,
            None,
            Some(0),
            Some(false),
            Some(true),
        )
        .unwrap();

        // Attach a goal
        let _goal_id = crate::db::saving_goals::create_saving_goal(
            &conn,
            "Beli Rumah",
            500_000_000,
            None,
            Some(tabungan_id),
        )
        .unwrap();

        // Attempt to update is_savings to false -> MUST FAIL
        let update_res = update_account(
            &conn,
            tabungan_id,
            "Bank Tabungan",
            "bank",
            None,
            None,
            0,
            Some(false),
        );
        assert!(update_res.is_err());
        assert!(update_res.unwrap_err().contains("masih ada target goal yang terhubung"));

        // If goal is deleted, changing to Harian should succeed
        crate::db::saving_goals::delete_saving_goal(&conn, _goal_id).unwrap();
        let update_res_after = update_account(
            &conn,
            tabungan_id,
            "Bank Tabungan",
            "bank",
            None,
            None,
            0,
            Some(false),
        );
        assert!(update_res_after.is_ok());
        let updated = get_account_by_id(&conn, tabungan_id).unwrap();
        assert!(!updated.is_savings);
    }

    #[test]
    fn test_account_archive_rules() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();
        init_db(&conn).unwrap();

        let bca_id = create_account(
            &mut conn,
            "BCA",
            "bank",
            None,
            None,
            Some(50_000),
            Some(false),
            Some(false),
        ).unwrap();

        // 1. Cannot archive when balance > 0
        let err = archive_account(&conn, bca_id).unwrap_err();
        assert!(err.contains("hanya dapat diarsipkan jika saldonya Rp 0"));

        // 2. Spend the remaining 50.000
        let makan_id: i64 = conn.query_row("SELECT id FROM categories WHERE name = 'Makan'", [], |r| r.get(0)).unwrap();
        crate::db::transactions::create_transaction(
            &conn,
            50_000,
            "expense",
            makan_id,
            "Habiskan Saldo",
            "2026-10-10",
            "manual",
            None,
            Some(bca_id),
        ).unwrap();

        let bca_acc = get_account_by_id(&conn, bca_id).unwrap();
        assert_eq!(bca_acc.current_balance, 0);

        // 3. If BCA is set to default, cannot archive
        set_default_account(&mut conn, bca_id).unwrap();
        let err_def = archive_account(&conn, bca_id).unwrap_err();
        assert!(err_def.contains("Akun utama (default) tidak dapat diarsipkan"));

        // 4. Set Cash back to default, then archive BCA succeeds
        let cash_id = conn.query_row("SELECT id FROM accounts WHERE name = 'Cash'", [], |r| r.get(0)).unwrap();
        set_default_account(&mut conn, cash_id).unwrap();

        archive_account(&conn, bca_id).unwrap();

        // Verify active list excludes archived account
        let active_list = list_accounts(&conn, false).unwrap();
        assert!(!active_list.iter().any(|a| a.id == bca_id));

        // 5. Unarchive succeeds
        unarchive_account(&conn, bca_id).unwrap();
        let restored_list = list_accounts(&conn, false).unwrap();
        assert!(restored_list.iter().any(|a| a.id == bca_id));
    }

    #[test]
    fn test_last_used_account_resolution() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();
        init_db(&conn).unwrap();

        let cash_id = get_default_account_id(&conn).unwrap();
        assert_eq!(resolve_account_id(&conn, None).unwrap(), cash_id);

        let bca_id = create_account(&mut conn, "BCA", "bank", None, None, Some(0), Some(false), Some(false)).unwrap();

        let makan_id: i64 = conn.query_row("SELECT id FROM categories WHERE name = 'Makan'", [], |r| r.get(0)).unwrap();
        crate::db::transactions::create_transaction(
            &conn,
            25_000,
            "expense",
            makan_id,
            "Makan",
            "2026-10-10",
            "manual",
            None,
            Some(bca_id),
        ).unwrap();

        // Subsequent transaction without specifying account_id should resolve to last used (BCA)
        assert_eq!(resolve_account_id(&conn, None).unwrap(), bca_id);
    }

    #[test]
    fn test_reset_all_data_preserves_accounts_and_zeros_opening_balance() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();
        init_db(&conn).unwrap();

        let bca_id = create_account(&mut conn, "BCA", "bank", None, None, Some(500_000), Some(false), Some(false)).unwrap();
        let makan_id: i64 = conn.query_row("SELECT id FROM categories WHERE name = 'Makan'", [], |r| r.get(0)).unwrap();
        crate::db::transactions::create_transaction(
            &conn,
            50_000,
            "expense",
            makan_id,
            "Makan",
            "2026-10-10",
            "manual",
            None,
            Some(bca_id),
        ).unwrap();

        assert_eq!(get_total_balance(&conn).unwrap(), 450_000);

        crate::db::schema::reset_all_data(&mut conn).unwrap();

        // Accounts are preserved
        let accounts = list_accounts(&conn, false).unwrap();
        assert!(accounts.len() >= 2); // Cash, Tabungan, BCA
        for a in &accounts {
            assert_eq!(a.opening_balance, 0, "Opening balance must be reset to 0");
            assert_eq!(a.current_balance, 0, "Current balance must be 0 after reset");
            assert_eq!(a.transaction_count, 0, "Transactions must be cleared");
        }
        assert_eq!(get_total_balance(&conn).unwrap(), 0);
    }
}
