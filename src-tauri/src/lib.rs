use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;
use crate::budget_engine::{BalanceResult, Transaction};

pub mod db;
pub mod budget_engine;

#[derive(Serialize, Deserialize)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub group_type: Option<String>,
    pub transaction_type: String,
}

pub struct DbState {
    pub conn: Mutex<Connection>,
}

#[tauri::command]
fn get_categories(state: tauri::State<DbState>) -> Result<Vec<Category>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, group_type, transaction_type FROM categories").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Category { id: row.get(0)?, name: row.get(1)?, group_type: row.get(2)?, transaction_type: row.get(3)? })
    }).map_err(|e| e.to_string())?;
    let mut res = Vec::new();
    for r in rows { res.push(r.map_err(|e| e.to_string())?); }
    Ok(res)
}

#[tauri::command]
fn create_transaction(
    state: tauri::State<DbState>,
    amount: i64,
    transaction_type: &str,
    category_id: i64,
    note: &str,
    transaction_date: &str,
    source: Option<String>,
    saving_goal_id: Option<i64>
) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let src = source.unwrap_or("manual".to_string());
    db::transactions::create_transaction(&conn, amount, transaction_type, category_id, note, transaction_date, &src, saving_goal_id)
}

#[tauri::command]
fn list_transactions(
    state: tauri::State<DbState>,
    date_filter: Option<&str>,
    type_filter: Option<&str>,
    category_id_filter: Option<i64>,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Result<Vec<Transaction>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::transactions::list_transactions(&conn, date_filter, type_filter, category_id_filter, start_date, end_date)
}

#[tauri::command]
fn update_transaction(
    state: tauri::State<DbState>,
    id: i64,
    amount: i64,
    transaction_type: &str,
    category_id: i64,
    note: &str,
    transaction_date: &str,
    saving_goal_id: Option<i64>
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::transactions::update_transaction(&conn, id, amount, transaction_type, category_id, note, transaction_date, saving_goal_id)
}

#[tauri::command]
fn delete_transaction(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::transactions::delete_transaction(&conn, id)
}

#[tauri::command]
fn create_saving_goal(state: tauri::State<DbState>, name: &str, target_amount: i64, target_date: Option<&str>) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::saving_goals::create_saving_goal(&conn, name, target_amount, target_date)
}

#[tauri::command]
fn list_saving_goals(state: tauri::State<DbState>) -> Result<Vec<budget_engine::SavingGoal>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::saving_goals::list_saving_goals(&conn)
}

#[tauri::command]
fn delete_saving_goal(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::saving_goals::delete_saving_goal(&conn, id)
}

#[tauri::command]
fn get_balance(state: tauri::State<DbState>, current_month: &str) -> Result<BalanceResult, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let txs = db::transactions::list_transactions(&conn, None, None, None, None, None)?;
    Ok(budget_engine::calculate_balance(&txs, current_month))
}

#[derive(Serialize)]
pub struct BudgetStatus {
    pub ideal: budget_engine::IdealAllocation,
    pub real: budget_engine::BudgetRealization,
    pub income: i64,
}

#[tauri::command]
fn set_monthly_income(state: tauri::State<DbState>, amount: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::budget::set_monthly_income(&conn, amount)
}

#[tauri::command]
fn get_budget_status(state: tauri::State<DbState>, current_month: &str) -> Result<BudgetStatus, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    
    // 1. Get settings
    let settings = db::budget::get_budget_settings(&conn)?;
    
    // 2. Get categories
    let mut stmt = conn.prepare("SELECT id, group_type FROM categories WHERE group_type IS NOT NULL").map_err(|e| e.to_string())?;
    let cats = stmt.query_map([], |row| {
        Ok(budget_engine::CategoryInfo { id: row.get(0)?, group_type: row.get(1)? })
    }).map_err(|e| e.to_string())?;
    let mut categories = Vec::new();
    for c in cats { categories.push(c.map_err(|e| e.to_string())?); }

    // 3. Get monthly transactions
    let txs = db::transactions::list_transactions(&conn, Some(current_month), None, None, None, None)?;

    // 4. Calculate
    let ideal = budget_engine::calculate_ideal_allocation(settings.monthly_income, &settings.ratios);
    let real = budget_engine::calculate_realization(&txs, &categories);

    Ok(BudgetStatus { ideal, real, income: settings.monthly_income })
}

#[tauri::command]
fn get_chart_data(state: tauri::State<DbState>, current_date: &str, period_type: &str) -> Result<Vec<budget_engine::ChartDataPoint>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    
    // if daily, we fetch transactions for current_date (YYYY-MM).
    // if monthly, we fetch transactions for current_date's year (YYYY).
    let filter = if period_type == "monthly" {
        current_date.chars().take(4).collect::<String>() // "YYYY"
    } else {
        current_date.to_string() // "YYYY-MM"
    };

    let txs = db::transactions::list_transactions(&conn, Some(&filter), None, None, None, None)?;
    Ok(budget_engine::aggregate_chart_data(&txs, period_type))
}

#[tauri::command]
fn check_ollama() -> bool {
    ai::ollama::check_ollama_health()
}

#[tauri::command]
fn parse_transaction_intent(state: tauri::State<DbState>, text: &str, today_date: &str) -> Result<ai::ollama::ParsedTransaction, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let settings = db::budget::get_budget_settings(&conn)?;
    
    // Get categories names
    let mut stmt = conn.prepare("SELECT name FROM categories").map_err(|e| e.to_string())?;
    let cats = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
    let mut categories = Vec::new();
    for c in cats { categories.push(c.map_err(|e| e.to_string())?); }

    ai::ollama::parse_transaction_intent(text, &settings.ollama_model, &categories, today_date)
}

fn format_rupiah(amount: i64) -> String {
    let mut s = amount.to_string();
    let mut result = String::new();
    let mut count = 0;
    for c in s.chars().rev() {
        if count != 0 && count % 3 == 0 {
            result.push('.');
        }
        result.push(c);
        count += 1;
    }
    format!("Rp {}", result.chars().rev().collect::<String>())
}

#[tauri::command]
fn generate_fintel_advice(state: tauri::State<DbState>, current_month: &str) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let settings = db::budget::get_budget_settings(&conn)?;

    // Drop the lock before calling get_budget_status manually?
    // Wait, get_budget_status is a tauri::command that takes a State.
    // It's better to just reuse its inner logic or call it directly if possible.
    // Let's just fetch it since we have the conn.
    let mut stmt = conn.prepare("SELECT id, group_type FROM categories WHERE group_type IS NOT NULL").map_err(|e| e.to_string())?;
    let cats = stmt.query_map([], |row| {
        Ok(budget_engine::CategoryInfo { id: row.get(0)?, group_type: row.get(1)? })
    }).map_err(|e| e.to_string())?;
    let mut categories = Vec::new();
    for c in cats { categories.push(c.map_err(|e| e.to_string())?); }

    let txs = db::transactions::list_transactions(&conn, Some(current_month), None, None, None, None)?;

    let ideal = budget_engine::calculate_ideal_allocation(settings.monthly_income, &settings.ratios);
    let real = budget_engine::calculate_realization(&txs, &categories);
    
    let needs_pct = if ideal.needs > 0 { (real.needs_spent as f64 / ideal.needs as f64) * 100.0 } else { 0.0 };
    let wants_pct = if ideal.wants > 0 { (real.wants_spent as f64 / ideal.wants as f64) * 100.0 } else { 0.0 };
    let savings_pct = if ideal.savings > 0 { (real.savings_amount as f64 / ideal.savings as f64) * 100.0 } else { 0.0 };
    
    // Format numbers to readable Rupiah strings to prevent LLM hallucinations with zeros
    use serde_json::json;
    let formatted_data = json!({
        "pendapatan_bulanan": format_rupiah(settings.monthly_income),
        "anggaran_ideal": {
            "kebutuhan_pokok": format_rupiah(ideal.needs),
            "keinginan": format_rupiah(ideal.wants),
            "tabungan": format_rupiah(ideal.savings)
        },
        "pengeluaran_realita": {
            "kebutuhan_pokok": format_rupiah(real.needs_spent),
            "keinginan": format_rupiah(real.wants_spent),
            "tabungan_terkumpul": format_rupiah(real.savings_amount)
        },
        "persentase_terpakai": {
            "kebutuhan_pokok": format!("{:.0}%", needs_pct),
            "keinginan": format!("{:.0}%", wants_pct),
            "tabungan_terkumpul": format!("{:.0}%", savings_pct)
        }
    });

    let json_data = serde_json::to_string_pretty(&formatted_data).map_err(|e| e.to_string())?;
    
    ai::ollama::generate_insight(&json_data, &settings.ollama_model)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            if !app_dir.exists() {
                std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
            }
            let db_path = app_dir.join("fintel.sqlite");
            
            // Backup DB before opening
            db::backup::backup_database(&app_dir, &db_path);

            let conn = Connection::open(db_path).expect("Failed to open db");
            db::schema::init_db(&conn).expect("Failed to init db schema");
            app.manage(DbState { conn: Mutex::new(conn) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_categories,
            create_transaction,
            list_transactions,
            update_transaction,
            delete_transaction,
            create_saving_goal,
            list_saving_goals,
            delete_saving_goal,
            get_balance,
            set_monthly_income,
            get_ollama_models,
            set_ollama_model,
            reset_all_data,
            get_budget_status,
            get_chart_data,
            check_ollama,
            parse_transaction_intent,
            generate_fintel_advice
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn get_ollama_models() -> Result<Vec<String>, String> {
    ai::ollama::get_ollama_models()
}

#[tauri::command]
fn set_ollama_model(state: tauri::State<DbState>, model: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE budget_settings SET ollama_model = ?1 WHERE id = 1", [&model]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn reset_all_data(state: tauri::State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM transactions", []).map_err(|e| e.to_string())?;
    Ok(())
}

pub mod ai;


