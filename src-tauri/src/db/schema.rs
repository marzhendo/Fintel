use rusqlite::{Connection, Result};

pub fn init_db(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            group_type TEXT CHECK (group_type IN ('needs','wants','savings') OR group_type IS NULL),
            transaction_type TEXT NOT NULL DEFAULT 'expense' CHECK (transaction_type IN ('income','expense'))
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY,
            amount INTEGER NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('income','expense')),
            category_id INTEGER REFERENCES categories(id),
            note TEXT,
            source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai_chat')),
            transaction_date DATE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS budget_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            monthly_income INTEGER NOT NULL DEFAULT 0,
            needs_pct INTEGER NOT NULL DEFAULT 50,
            wants_pct INTEGER NOT NULL DEFAULT 30,
            savings_pct INTEGER NOT NULL DEFAULT 20,
            ollama_model TEXT DEFAULT 'llama3.2:3b',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS saving_goals (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            target_amount INTEGER NOT NULL,
            target_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        "
    )?;

    // Add name to saving_goals if not exists
    let _ = conn.execute("ALTER TABLE saving_goals ADD COLUMN name TEXT NOT NULL DEFAULT 'Target Tabungan'", []);
    
    // Add saving_goal_id to transactions if not exists
    let _ = conn.execute("ALTER TABLE transactions ADD COLUMN saving_goal_id INTEGER REFERENCES saving_goals(id)", []);

    let col_exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('categories') WHERE name='transaction_type'",
        [],
        |row| row.get::<_, i64>(0)
    ).unwrap_or(0) > 0;

    if !col_exists {
        conn.execute_batch(
            "
            PRAGMA foreign_keys=off;
            CREATE TABLE categories_new (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                group_type TEXT CHECK (group_type IN ('needs','wants','savings') OR group_type IS NULL),
                transaction_type TEXT NOT NULL DEFAULT 'expense' CHECK (transaction_type IN ('income','expense'))
            );
            INSERT INTO categories_new (id, name, group_type) SELECT id, name, group_type FROM categories;
            DROP TABLE categories;
            ALTER TABLE categories_new RENAME TO categories;
            PRAGMA foreign_keys=on;

            INSERT INTO categories (name, group_type, transaction_type) VALUES 
            ('Uang Saku/Kiriman Keluarga', NULL, 'income'),
            ('Gaji/Freelance', NULL, 'income'),
            ('Lainnya', NULL, 'income');

            UPDATE transactions 
            SET category_id = (SELECT id FROM categories WHERE transaction_type = 'income' AND name = 'Lainnya' LIMIT 1)
            WHERE type = 'income' AND category_id IN (SELECT id FROM categories WHERE transaction_type = 'expense');
            "
        )?;
    }

    seed_categories(conn)?;
    seed_default_goal(conn)?;

    Ok(())
}

fn seed_default_goal(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM saving_goals")?;
    let count: i64 = stmt.query_row([], |row| row.get(0))?;

    if count == 0 {
        conn.execute("INSERT INTO saving_goals (name, target_amount) VALUES ('Tabungan Umum', 10000000)", [])?;
    }
    Ok(())
}

fn seed_categories(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM categories")?;
    let count: i64 = stmt.query_row([], |row| row.get(0))?;

    if count == 0 {
        conn.execute_batch(
            "
            INSERT INTO categories (name, group_type, transaction_type) VALUES
            ('Makan', 'needs', 'expense'),
            ('Transport', 'needs', 'expense'),
            ('Tagihan', 'needs', 'expense'),
            ('Kesehatan', 'needs', 'expense'),
            ('Pendidikan', 'needs', 'expense'),
            ('Hiburan', 'wants', 'expense'),
            ('Belanja', 'wants', 'expense'),
            ('Nongkrong', 'wants', 'expense'),
            ('Lainnya', 'wants', 'expense'),
            ('Tabungan', 'savings', 'expense'),
            ('Investasi', 'savings', 'expense'),
            ('Uang Saku/Kiriman Keluarga', NULL, 'income'),
            ('Gaji/Freelance', NULL, 'income'),
            ('Lainnya', NULL, 'income');
            "
        )?;
    }

    Ok(())
}





