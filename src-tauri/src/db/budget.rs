use rusqlite::{Connection, Result, params};
use crate::budget_engine::BudgetRatios;

pub struct BudgetSettings {
    pub monthly_income: i64,
    pub ratios: BudgetRatios,
    pub ollama_model: String,
}

pub fn get_budget_settings(conn: &Connection) -> Result<BudgetSettings, String> {
    let mut stmt = conn.prepare("SELECT monthly_income, needs_pct, wants_pct, savings_pct, ollama_model FROM budget_settings WHERE id = 1").map_err(|e| e.to_string())?;
    
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(BudgetSettings {
            monthly_income: row.get(0).map_err(|e| e.to_string())?,
            ratios: BudgetRatios {
                needs_pct: row.get(1).map_err(|e| e.to_string())?,
                wants_pct: row.get(2).map_err(|e| e.to_string())?,
                savings_pct: row.get(3).map_err(|e| e.to_string())?,
            },
            ollama_model: row.get(4).unwrap_or("llama3.2:3b".to_string()),
        })
    } else {
        // Default insert if missing
        conn.execute("INSERT INTO budget_settings (id, monthly_income, needs_pct, wants_pct, savings_pct) VALUES (1, 0, 50, 30, 20)", [])
            .map_err(|e| e.to_string())?;
        Ok(BudgetSettings {
            monthly_income: 0,
            ratios: BudgetRatios { needs_pct: 50, wants_pct: 30, savings_pct: 20 },
            ollama_model: "llama3.2:3b".to_string(),
        })
    }
}

pub fn set_monthly_income(conn: &Connection, amount: i64) -> Result<(), String> {
    if amount < 0 {
        return Err("Income cannot be negative".to_string());
    }
    
    let exists = conn.query_row("SELECT COUNT(1) FROM budget_settings WHERE id = 1", [], |row| row.get::<_, i64>(0)).unwrap_or(0);
    if exists > 0 {
        conn.execute("UPDATE budget_settings SET monthly_income = ?1 WHERE id = 1", [amount]).map_err(|e| e.to_string())?;
    } else {
        conn.execute("INSERT INTO budget_settings (id, monthly_income, needs_pct, wants_pct, savings_pct) VALUES (1, ?1, 50, 30, 20)", [amount]).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

