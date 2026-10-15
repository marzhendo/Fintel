use rusqlite::{params, Connection, OptionalExtension, Result};

pub fn init_db(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL CHECK (type IN ('cash','bank','ewallet','savings')),
            opening_balance INTEGER NOT NULL DEFAULT 0,
            icon TEXT NOT NULL DEFAULT 'Wallet',
            color TEXT NOT NULL DEFAULT '#10B981',
            is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
            is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
            is_savings INTEGER NOT NULL DEFAULT 0 CHECK (is_savings IN (0, 1)),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            group_type TEXT CHECK (group_type IN ('fixed','wants','savings') OR group_type IS NULL),
            transaction_type TEXT NOT NULL DEFAULT 'expense' CHECK (transaction_type IN ('income','expense','transfer'))
        );

        CREATE TABLE IF NOT EXISTS category_budgets (
            category_id INTEGER PRIMARY KEY REFERENCES categories(id),
            limit_amount INTEGER NOT NULL DEFAULT 0,
            period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('weekly','monthly')),
            anchor_date DATE
        );

        CREATE TABLE IF NOT EXISTS allocation_percents (
            category_id INTEGER PRIMARY KEY REFERENCES categories(id),
            bp INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY,
            amount INTEGER NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('income','expense')),
            category_id INTEGER REFERENCES categories(id),
            note TEXT,
            source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai_chat')),
            transaction_date DATE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            saving_goal_id INTEGER REFERENCES saving_goals(id),
            related_debt_id INTEGER REFERENCES debts(id),
            account_id INTEGER REFERENCES accounts(id)
        );

        CREATE TABLE IF NOT EXISTS budget_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            monthly_income INTEGER NOT NULL DEFAULT 0,
            needs_pct INTEGER NOT NULL DEFAULT 50,
            wants_pct INTEGER NOT NULL DEFAULT 30,
            savings_pct INTEGER NOT NULL DEFAULT 20,
            ollama_model TEXT DEFAULT 'qwen2.5:3b',
            language TEXT NOT NULL DEFAULT 'id',
            reminder_enabled BOOLEAN NOT NULL DEFAULT 0,
            reminder_time TEXT NOT NULL DEFAULT '20:00',
            last_notified_date TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS debts (
            id INTEGER PRIMARY KEY,
            type TEXT NOT NULL CHECK (type IN ('receivable', 'payable')),
            counterparty_name TEXT NOT NULL,
            amount INTEGER NOT NULL,
            description TEXT,
            due_date DATE,
            status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
            settled_transaction_id INTEGER REFERENCES transactions(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            paid_at DATETIME,
            last_notified_date DATE
        );

        CREATE TABLE IF NOT EXISTS saving_goals (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL DEFAULT 'Target Tabungan',
            target_amount INTEGER NOT NULL,
            target_date DATE,
            account_id INTEGER REFERENCES accounts(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS transfers (
            id INTEGER PRIMARY KEY,
            from_account_id INTEGER NOT NULL REFERENCES accounts(id),
            to_account_id INTEGER NOT NULL REFERENCES accounts(id),
            amount INTEGER NOT NULL CHECK (amount > 0),
            transfer_date DATE NOT NULL,
            note TEXT,
            saving_goal_id INTEGER REFERENCES saving_goals(id),
            saving_effect TEXT CHECK (saving_effect IN ('deposit','withdrawal') OR saving_effect IS NULL),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        "
    )?;

    // Add columns if migrating from older schema versions
    let _ = conn.execute("ALTER TABLE saving_goals ADD COLUMN name TEXT NOT NULL DEFAULT 'Target Tabungan'", []);
    let _ = conn.execute("ALTER TABLE saving_goals ADD COLUMN target_date DATE", []);
    let _ = conn.execute("ALTER TABLE saving_goals ADD COLUMN account_id INTEGER REFERENCES accounts(id)", []);
    let _ = conn.execute("ALTER TABLE accounts ADD COLUMN is_savings INTEGER NOT NULL DEFAULT 0 CHECK (is_savings IN (0, 1))", []);
    let _ = conn.execute("ALTER TABLE transactions ADD COLUMN saving_goal_id INTEGER REFERENCES saving_goals(id)", []);
    let _ = conn.execute("ALTER TABLE transactions ADD COLUMN related_debt_id INTEGER REFERENCES debts(id)", []);
    let _ = conn.execute("ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id)", []);
    let _ = conn.execute("ALTER TABLE budget_settings ADD COLUMN language TEXT NOT NULL DEFAULT 'id'", []);
    let _ = conn.execute("ALTER TABLE budget_settings ADD COLUMN reminder_enabled BOOLEAN NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE budget_settings ADD COLUMN reminder_time TEXT NOT NULL DEFAULT '20:00'", []);
    let _ = conn.execute("ALTER TABLE budget_settings ADD COLUMN last_notified_date TEXT", []);

    // Convert any legacy accounts with type='savings' to type='bank' and is_savings=1
    let _ = conn.execute("UPDATE accounts SET type = 'bank', is_savings = 1 WHERE type = 'savings'", []);

    // Migration for category_budgets: rename monthly_limit -> limit_amount, add period, anchor_date
    let cb_cols: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA table_info(category_budgets)").unwrap();
        let rows = stmt.query_map([], |row| row.get::<_, String>(1)).unwrap();
        let mut cols = Vec::new();
        for r in rows {
            if let Ok(c) = r { cols.push(c); }
        }
        cols
    };

    if cb_cols.contains(&"monthly_limit".to_string()) && !cb_cols.contains(&"limit_amount".to_string()) {
        let _ = conn.execute("ALTER TABLE category_budgets RENAME COLUMN monthly_limit TO limit_amount", []);
    }
    if !cb_cols.contains(&"period".to_string()) {
        let _ = conn.execute("ALTER TABLE category_budgets ADD COLUMN period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('weekly','monthly'))", []);
    }
    if !cb_cols.contains(&"anchor_date".to_string()) {
        let _ = conn.execute("ALTER TABLE category_budgets ADD COLUMN anchor_date DATE", []);
    }

    // Migration for categories CHECK constraint ('needs' -> 'fixed')
    let cat_sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='categories'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_default();

    if cat_sql.contains("'needs'") {
        conn.execute_batch(
            "
            PRAGMA foreign_keys=off;
            CREATE TABLE categories_new (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                group_type TEXT CHECK (group_type IN ('fixed','wants','savings') OR group_type IS NULL),
                transaction_type TEXT NOT NULL DEFAULT 'expense' CHECK (transaction_type IN ('income','expense','transfer'))
            );
            INSERT INTO categories_new (id, name, group_type, transaction_type)
            SELECT id, name, CASE WHEN group_type = 'needs' THEN 'fixed' ELSE group_type END, transaction_type FROM categories;
            DROP TABLE categories;
            ALTER TABLE categories_new RENAME TO categories;
            PRAGMA foreign_keys=on;
            "
        )?;
    }

    // Seed default categories if table is fresh
    seed_categories(conn)?;

    // Mapping update (Poin 1 & 2) for existing categories
    conn.execute_batch(
        "
        UPDATE categories SET group_type = 'fixed' WHERE name IN ('Makan', 'Minuman', 'Galon', 'Bensin', 'Transport', 'Tagihan', 'Kesehatan', 'Pendidikan', 'Pembayaran Utang');
        UPDATE categories SET group_type = 'wants' WHERE name IN ('Kuota', 'Nongkrong', 'Hiburan', 'Belanja') OR (name = 'Lainnya' AND transaction_type = 'expense');
        UPDATE categories SET group_type = 'savings' WHERE name IN ('Tabungan', 'Investasi');
        "
    )?;

    // Seed missing categories if not present
    let missing_categories: [(&str, Option<&str>, &str); 8] = [
        ("Galon", Some("fixed"), "expense"),
        ("Bensin", Some("fixed"), "expense"),
        ("Kuota", Some("wants"), "expense"),
        ("Minuman", Some("fixed"), "expense"),
        ("Talangan Diberikan", None, "transfer"),
        ("Pinjaman Diterima", None, "transfer"),
        ("Pembayaran Piutang", None, "transfer"),
        ("Pembayaran Utang", Some("fixed"), "expense"),
    ];
    for (m_name, m_group, m_tx_type) in missing_categories {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM categories WHERE name = ?1",
                [m_name],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists == 0 {
            conn.execute(
                "INSERT INTO categories (name, group_type, transaction_type) VALUES (?1, ?2, ?3)",
                rusqlite::params![m_name, m_group, m_tx_type],
            ).ok();
        }
    }

    // Ensure default Cash account exists and legacy transactions have account_id assigned
    let has_default: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM accounts WHERE is_default = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let default_id: i64 = if has_default == 0 {
        let existing_cash: Option<i64> = conn
            .query_row(
                "SELECT id FROM accounts WHERE name = 'Cash' LIMIT 1",
                [],
                |r| r.get(0),
            )
            .optional()
            .unwrap_or(None);

        match existing_cash {
            Some(id) => {
                let _ = conn.execute("UPDATE accounts SET is_default = 1 WHERE id = ?1", [id]);
                id
            }
            None => {
                conn.execute(
                    "INSERT INTO accounts (name, type, opening_balance, icon, color, is_default, is_archived, is_savings)
                     VALUES ('Cash', 'cash', 0, 'Wallet', '#10B981', 1, 0, 0)",
                    [],
                )?;
                conn.last_insert_rowid()
            }
        }
    } else {
        conn.query_row(
            "SELECT id FROM accounts WHERE is_default = 1 LIMIT 1",
            [],
            |r| r.get(0),
        )?
    };

    // Populate account_id of ALL legacy transactions with default account
    conn.execute(
        "UPDATE transactions SET account_id = ?1 WHERE account_id IS NULL",
        [default_id],
    )?;

    // Ensure default "Tabungan" account exists (is_savings=1)
    let existing_savings_acc: Option<i64> = conn
        .query_row(
            "SELECT id FROM accounts WHERE is_savings = 1 LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()
        .unwrap_or(None);

    let tabungan_account_id = match existing_savings_acc {
        Some(id) => id,
        None => {
            conn.execute(
                "INSERT INTO accounts (name, type, opening_balance, icon, color, is_default, is_archived, is_savings)
                 VALUES ('Tabungan', 'bank', 0, 'account_balance', '#6366f1', 0, 0, 1)",
                [],
            )?;
            conn.last_insert_rowid()
        }
    };

    seed_default_goal(conn, tabungan_account_id)?;

    // Connect any saving_goals that have NULL account_id to the Tabungan account
    conn.execute(
        "UPDATE saving_goals SET account_id = ?1 WHERE account_id IS NULL",
        [tabungan_account_id],
    )?;

    // Migrate legacy savings transactions with saving_goal_id into transfers atomically
    let mut legacy_stmt = conn.prepare(
        "SELECT t.id, t.amount, COALESCE(t.account_id, ?1), t.transaction_date, t.note, t.saving_goal_id
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         WHERE c.group_type = 'savings' AND t.saving_goal_id IS NOT NULL",
    )?;

    let legacy_rows: Vec<(i64, i64, i64, String, Option<String>, i64)> = legacy_stmt
        .query_map([default_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    if !legacy_rows.is_empty() {
        let tx = conn.unchecked_transaction()?;
        let mut migrated_count = 0;
        for (t_id, amt, from_acc, t_date, note, g_id) in legacy_rows {
            tx.execute(
                "INSERT INTO transfers (
                    from_account_id, to_account_id, amount, transfer_date, note, saving_goal_id, saving_effect
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'deposit')",
                params![from_acc, tabungan_account_id, amt, t_date, note, g_id],
            )?;
            tx.execute("DELETE FROM transactions WHERE id = ?1", [t_id])?;
            migrated_count += 1;
        }
        tx.commit()?;
        println!("[Migration] Migrated {} legacy savings transactions to transfers.", migrated_count);
    }

    // Create SQL VIEW operational_transactions
    conn.execute_batch(
        "CREATE VIEW IF NOT EXISTS operational_transactions AS
         SELECT t.*
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE c.transaction_type IS NULL OR c.transaction_type <> 'transfer';"
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO budget_settings (id, monthly_income, needs_pct, wants_pct, savings_pct, language, reminder_enabled, reminder_time) VALUES (1, 0, 50, 30, 20, 'id', 0, '20:00')",
        [],
    ).ok();

    Ok(())
}

fn seed_default_goal(conn: &Connection, tabungan_account_id: i64) -> Result<()> {
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM saving_goals")?;
    let count: i64 = stmt.query_row([], |row| row.get(0))?;

    if count == 0 {
        conn.execute(
            "INSERT INTO saving_goals (name, target_amount, account_id) VALUES ('Tabungan Umum', 10000000, ?1)",
            [tabungan_account_id],
        )?;
    }
    Ok(())
}

fn seed_categories(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM categories WHERE name = 'Makan'")?;
    let count: i64 = stmt.query_row([], |row| row.get(0))?;

    if count == 0 {
        conn.execute_batch(
            "
            INSERT INTO categories (name, group_type, transaction_type) VALUES
            ('Makan', 'fixed', 'expense'),
            ('Minuman', 'fixed', 'expense'),
            ('Galon', 'fixed', 'expense'),
            ('Bensin', 'fixed', 'expense'),
            ('Transport', 'fixed', 'expense'),
            ('Tagihan', 'fixed', 'expense'),
            ('Kesehatan', 'fixed', 'expense'),
            ('Pendidikan', 'fixed', 'expense'),
            ('Kuota', 'wants', 'expense'),
            ('Nongkrong', 'wants', 'expense'),
            ('Hiburan', 'wants', 'expense'),
            ('Belanja', 'wants', 'expense'),
            ('Lainnya', 'wants', 'expense'),
            ('Tabungan', 'savings', 'expense'),
            ('Investasi', 'savings', 'expense'),
            ('Uang Saku/Kiriman Keluarga', NULL, 'income'),
            ('Gaji/Freelance', NULL, 'income'),
            ('Lainnya', NULL, 'income'),
            ('Talangan Diberikan', NULL, 'transfer'),
            ('Pinjaman Diterima', NULL, 'transfer'),
            ('Pembayaran Piutang', NULL, 'transfer'),
            ('Pembayaran Utang', 'fixed', 'expense');
            ",
        )?;
    }

    Ok(())
}

pub fn reset_all_data(conn: &mut Connection) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // 1. Putus relasi melingkar & foreign keys dulu sebelum menghapus
    tx.execute("UPDATE debts SET settled_transaction_id = NULL", [])
        .map_err(|e| format!("Failed to clear debt transaction references: {}", e))?;
    tx.execute("UPDATE transactions SET related_debt_id = NULL, saving_goal_id = NULL", [])
        .map_err(|e| format!("Failed to clear transaction foreign references: {}", e))?;
    tx.execute("UPDATE transfers SET saving_goal_id = NULL", [])
        .map_err(|e| format!("Failed to clear transfers foreign references: {}", e))?;

    // 2. Cascade delete in order: transactions -> transfers -> debts -> saving_goals
    tx.execute("DELETE FROM transactions", [])
        .map_err(|e| format!("Failed to delete transactions: {}", e))?;
    tx.execute("DELETE FROM transfers", [])
        .map_err(|e| format!("Failed to delete transfers: {}", e))?;
    tx.execute("DELETE FROM debts", [])
        .map_err(|e| format!("Failed to delete debts: {}", e))?;
    tx.execute("DELETE FROM saving_goals", [])
        .map_err(|e| format!("Failed to delete saving goals: {}", e))?;

    // 3. Reset opening_balance semua akun menjadi 0 (akun tetap dipertahankan)
    tx.execute("UPDATE accounts SET opening_balance = 0", [])
        .map_err(|e| format!("Failed to reset accounts opening balance: {}", e))?;

    // Find the first Tabungan account (is_savings = 1)
    let first_savings_acc_id: Option<i64> = tx
        .query_row(
            "SELECT id FROM accounts WHERE is_savings = 1 AND is_archived = 0 ORDER BY is_default DESC, id ASC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()
        .unwrap_or(None);

    let target_acc_id = match first_savings_acc_id {
        Some(id) => id,
        None => {
            let any_savings: Option<i64> = tx
                .query_row(
                    "SELECT id FROM accounts WHERE is_savings = 1 ORDER BY id ASC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .optional()
                .unwrap_or(None);
            match any_savings {
                Some(id) => id,
                None => {
                    tx.execute(
                        "INSERT INTO accounts (name, type, opening_balance, icon, color, is_default, is_archived, is_savings)
                         VALUES ('Tabungan', 'bank', 0, 'account_balance', '#6366f1', 0, 0, 1)",
                        [],
                    ).map_err(|e| format!("Failed to create default savings account: {}", e))?;
                    tx.last_insert_rowid()
                }
            }
        }
    };

    // 4. Buat ulang goal default "Tabungan Umum" terhubung ke akun Tabungan
    tx.execute(
        "INSERT INTO saving_goals (name, target_amount, account_id) VALUES ('Tabungan Umum', 10000000, ?1)",
        [target_acc_id],
    ).map_err(|e| format!("Failed to recreate default saving goal: {}", e))?;

    tx.commit().map_err(|e| format!("Failed to commit reset transaction: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_savings_migration_invariant_and_transfer_conversion() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();

        // 1. Setup pre-migration state (old accounts, saving_goals without account_id, old transactions)
        conn.execute_batch(
            "
            CREATE TABLE accounts (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL,
                opening_balance INTEGER NOT NULL DEFAULT 0,
                icon TEXT NOT NULL DEFAULT 'Wallet',
                color TEXT NOT NULL DEFAULT '#10B981',
                is_default INTEGER NOT NULL DEFAULT 0,
                is_archived INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE categories (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                group_type TEXT,
                transaction_type TEXT NOT NULL DEFAULT 'expense'
            );
            CREATE TABLE saving_goals (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL DEFAULT 'Target Tabungan',
                target_amount INTEGER NOT NULL
            );
            CREATE TABLE transactions (
                id INTEGER PRIMARY KEY,
                amount INTEGER NOT NULL,
                type TEXT NOT NULL,
                category_id INTEGER REFERENCES categories(id),
                note TEXT,
                source TEXT NOT NULL DEFAULT 'manual',
                transaction_date DATE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                saving_goal_id INTEGER REFERENCES saving_goals(id),
                account_id INTEGER REFERENCES accounts(id)
            );
            INSERT INTO accounts (id, name, type, opening_balance, is_default) VALUES (1, 'Cash', 'cash', 0, 1);
            INSERT INTO categories (id, name, group_type, transaction_type) VALUES
                (1, 'Gaji', NULL, 'income'),
                (2, 'Makan', 'fixed', 'expense'),
                (3, 'Tabungan', 'savings', 'expense');
            INSERT INTO saving_goals (id, name, target_amount) VALUES (1, 'Tabungan Umum', 10000000);

            -- 1 income (5.000.000), 1 expense (500.000), 1 savings expense (1.000.000)
            INSERT INTO transactions (id, amount, type, category_id, note, transaction_date, account_id)
            VALUES (1, 5000000, 'income', 1, 'Gaji', '2026-10-01', 1);
            INSERT INTO transactions (id, amount, type, category_id, note, transaction_date, account_id)
            VALUES (2, 500000, 'expense', 2, 'Makan', '2026-10-02', 1);
            INSERT INTO transactions (id, amount, type, category_id, note, transaction_date, saving_goal_id, account_id)
            VALUES (3, 1000000, 'expense', 3, 'Nabung', '2026-10-03', 1, 1);
            "
        ).unwrap();

        // Total Balance lama: 5.000.000 - 500.000 - 1.000.000 = 3.500.000
        let pre_migration_total: i64 = conn.query_row(
            "SELECT SUM(CASE WHEN type = 'income' THEN amount WHEN type = 'expense' THEN -amount ELSE 0 END) FROM transactions",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(pre_migration_total, 3500000);

        // Pre-migration goal progress: 1.000.000
        let pre_goal_progress: i64 = conn.query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE saving_goal_id = 1",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(pre_goal_progress, 1000000);

        // 2. Run init_db migration
        init_db(&conn).unwrap();

        // 3. Verify INVARIANT: Tersedia baru == Total Balance lama (3.500.000)
        let available_balance = crate::db::accounts::get_available_balance(&conn).unwrap();
        assert_eq!(available_balance, pre_migration_total, "Tersedia baru HARUS sama persis dengan Total Balance lama");

        // 4. Verify Tabungan account exists with balance 1.000.000
        let savings_balance = crate::db::accounts::get_savings_balance(&conn).unwrap();
        assert_eq!(savings_balance, 1000000);

        // 5. Total balance baru = Tersedia (3.500.000) + Tabungan (1.000.000) = 4.500.000
        let total_balance_new = crate::db::accounts::get_total_balance(&conn).unwrap();
        assert_eq!(total_balance_new, 4500000);

        // 6. Verify legacy transaction deleted and converted to transfers
        let remaining_tx_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM transactions WHERE id = 3",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(remaining_tx_count, 0, "Old savings transaction must be deleted");

        let transfer_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM transfers WHERE saving_goal_id = 1 AND saving_effect = 'deposit' AND amount = 1000000",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(transfer_count, 1, "Exactly 1 transfer row must be created");

        // 7. Verify Goal progress unchanged (1.000.000)
        let goals = crate::db::saving_goals::list_saving_goals(&conn).unwrap();
        let g = goals.iter().find(|i| i.id == 1).unwrap();
        assert_eq!(g.current_amount, pre_goal_progress);
    }

    #[test]
    fn test_reset_all_data_clears_transfers_and_recreates_default_goal() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();
        init_db(&conn).unwrap();

        // 1. Create a transfer
        let tabungan_acc_id: i64 = conn.query_row(
            "SELECT id FROM accounts WHERE is_savings = 1 LIMIT 1",
            [],
            |r| r.get(0),
        ).unwrap();

        crate::db::transfers::create_transfer(
            &conn,
            1, // Cash
            tabungan_acc_id,
            500000,
            "2026-10-15",
            Some("Nabung"),
            Some(1),
        ).unwrap();

        let transfer_count: i64 = conn.query_row("SELECT COUNT(*) FROM transfers", [], |r| r.get(0)).unwrap();
        assert_eq!(transfer_count, 1);

        // 2. Perform Reset All Data
        reset_all_data(&mut conn).unwrap();

        // 3. Verify transfers are completely deleted
        let transfer_count_after: i64 = conn.query_row("SELECT COUNT(*) FROM transfers", [], |r| r.get(0)).unwrap();
        assert_eq!(transfer_count_after, 0);

        // 4. Exactly 1 saving goal remains: "Tabungan Umum" linked to Tabungan account
        let goals = crate::db::saving_goals::list_saving_goals(&conn).unwrap();
        assert_eq!(goals.len(), 1);
        assert_eq!(goals[0].name, "Tabungan Umum");
        assert_eq!(goals[0].account_id, Some(tabungan_acc_id));
        assert_eq!(goals[0].current_amount, 0);
    }
}
