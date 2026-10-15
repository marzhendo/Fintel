use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, Emitter, menu::{Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}};
use tauri_plugin_notification::NotificationExt;
use std::time::Duration;
use chrono::Local;
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
    saving_goal_id: Option<i64>,
    account_id: Option<i64>,
) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let src = source.unwrap_or("manual".to_string());
    db::transactions::create_transaction(&conn, amount, transaction_type, category_id, note, transaction_date, &src, saving_goal_id, account_id)
}

#[tauri::command]
fn list_transactions(
    state: tauri::State<DbState>,
    date_filter: Option<&str>,
    type_filter: Option<&str>,
    category_id_filter: Option<i64>,
    start_date: Option<&str>,
    end_date: Option<&str>,
    account_id_filter: Option<i64>,
) -> Result<Vec<Transaction>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::transactions::list_transactions(&conn, date_filter, type_filter, category_id_filter, start_date, end_date, account_id_filter)
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
    saving_goal_id: Option<i64>,
    account_id: Option<i64>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::transactions::update_transaction(&conn, id, amount, transaction_type, category_id, note, transaction_date, saving_goal_id, account_id)
}

#[tauri::command]
fn delete_transaction(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::transactions::delete_transaction(&conn, id)
}

#[tauri::command]
fn create_saving_goal(
    state: tauri::State<DbState>,
    name: &str,
    target_amount: i64,
    target_date: Option<&str>,
    account_id: Option<i64>,
) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::saving_goals::create_saving_goal(&conn, name, target_amount, target_date, account_id)
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
fn update_saving_goal(
    state: tauri::State<DbState>,
    id: i64,
    name: &str,
    target_amount: i64,
    target_date: Option<&str>,
    account_id: Option<i64>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::saving_goals::update_saving_goal(&conn, id, name, target_amount, target_date, account_id)
}

#[tauri::command]
fn get_balance(state: tauri::State<DbState>, current_month: &str) -> Result<BalanceResult, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let txs = db::transactions::list_transactions(&conn, None, None, None, None, None, None)?;
    let mut bal = budget_engine::calculate_balance(&txs, current_month);
    let total_account_balance = db::accounts::get_total_balance(&conn)?;
    let available_balance = db::accounts::get_available_balance(&conn)?;
    let savings_balance = db::accounts::get_savings_balance(&conn)?;
    let monthly_savings_deposit = db::transfers::get_monthly_net_savings_deposit(&conn, current_month)?;

    bal.balance = total_account_balance;
    bal.available_balance = available_balance;
    bal.savings_balance = savings_balance;
    bal.monthly_savings_deposit = monthly_savings_deposit;
    bal.monthly_balance = bal.monthly_income - bal.monthly_expense - monthly_savings_deposit;
    Ok(bal)
}

#[derive(Serialize)]
pub struct BudgetStatus {
    pub ideal: budget_engine::IdealAllocation,
    pub real: budget_engine::BudgetRealization,
    pub income: i64,
    pub language: String,
    pub reminder_enabled: bool,
    pub reminder_time: String,
}

#[tauri::command]
fn set_monthly_income(state: tauri::State<DbState>, amount: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::budget::set_monthly_income(&conn, amount)
}

#[tauri::command]
fn get_category_budgets(state: tauri::State<DbState>) -> Result<Vec<db::budget::CategoryBudgetSetting>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::budget::get_category_budgets(&conn)
}

#[tauri::command]
fn set_category_budget(
    state: tauri::State<DbState>,
    category_id: i64,
    period: Option<String>,
    amount: Option<i64>,
    monthly_limit: Option<i64>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let p = period.unwrap_or_else(|| "monthly".to_string());
    let amt = amount.or(monthly_limit).unwrap_or(0);
    db::budget::set_category_budget(&conn, category_id, &p, amt)
}

#[tauri::command]
fn get_budget_overview(state: tauri::State<DbState>, current_month: &str) -> Result<budget_engine::BudgetOverview, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::budget::get_budget_overview(&conn, current_month)
}

#[tauri::command]
fn preview_envelope(income: i64, drafts: Vec<budget_engine::DraftCategoryBudget>) -> budget_engine::EnvelopePreview {
    budget_engine::calculate_envelope_preview(income, &drafts)
}

#[tauri::command]
fn preview_auto_allocation(
    income: i64,
    items: Vec<budget_engine::AutoAllocationInput>,
) -> budget_engine::AutoAllocationPreview {
    budget_engine::calculate_auto_allocation(income, &items)
}

#[tauri::command]
fn save_allocation_percents(
    state: tauri::State<DbState>,
    items: Vec<db::budget::AllocationPercentItem>,
) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::budget::save_allocation_percents(&mut conn, &items)
}

#[tauri::command]
fn get_allocation_percents(
    state: tauri::State<DbState>,
) -> Result<Vec<db::budget::AllocationPercentItem>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::budget::get_allocation_percents(&conn)
}

#[tauri::command]
fn get_budget_status(state: tauri::State<DbState>, current_month: &str) -> Result<BudgetStatus, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let settings = db::budget::get_budget_settings(&conn)?;
    let overview = db::budget::get_budget_overview(&conn, current_month)?;

    let ideal = budget_engine::IdealAllocation {
        needs: overview.fixed.total_limit,
        wants: overview.wants.total_limit,
        savings: overview.savings.total_limit,
    };
    let real = budget_engine::BudgetRealization {
        needs_spent: overview.fixed.total_spent,
        wants_spent: overview.wants.total_spent,
        savings_amount: overview.savings.total_spent,
    };

    Ok(BudgetStatus {
        ideal,
        real,
        income: settings.monthly_income,
        language: settings.language,
        reminder_enabled: settings.reminder_enabled,
        reminder_time: settings.reminder_time,
    })
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

    let txs = db::transactions::list_operational_transactions(&conn, Some(&filter))?;
    Ok(budget_engine::aggregate_chart_data(&txs, period_type))
}

#[tauri::command]
async fn check_ollama() -> bool {
    tauri::async_runtime::spawn_blocking(|| ai::ollama::check_ollama_health())
        .await
        .unwrap_or(false)
}

#[tauri::command]
async fn parse_transaction_intent(
    state: tauri::State<'_, DbState>,
    text: String,
    today_date: String,
) -> Result<ai::ollama::ParsedTransaction, String> {
    let (settings, categories) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let settings = db::budget::get_budget_settings(&conn)?;
        let mut stmt = conn.prepare("SELECT name FROM categories").map_err(|e| e.to_string())?;
        let cats = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
        let mut categories = Vec::new();
        for c in cats {
            categories.push(c.map_err(|e| e.to_string())?);
        }
        (settings, categories)
    };

    tauri::async_runtime::spawn_blocking(move || {
        ai::ollama::parse_transaction_intent(
            &text,
            &settings.ollama_model,
            &categories,
            &today_date,
            &settings.language,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

fn format_rupiah(amount: i64) -> String {
    let s = amount.to_string();
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
async fn generate_fintel_advice(
    state: tauri::State<'_, DbState>,
    current_month: String,
) -> Result<String, String> {
    let (settings, overview) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let settings = db::budget::get_budget_settings(&conn)?;
        let overview = db::budget::get_budget_overview(&conn, &current_month)?;
        (settings, overview)
    };

    let fixed_pct = overview.fixed.percentage;
    let wants_pct = overview.wants.percentage;
    let savings_pct = overview.savings.percentage;

    // Format numbers to readable Rupiah strings to prevent LLM hallucinations with zeros
    use serde_json::json;
    let formatted_data = json!({
        "pendapatan_bulanan": format_rupiah(overview.monthly_income),
        "target_tabungan": format_rupiah(overview.savings_target),
        "rasio_tabungan": format!("{:.1}%", overview.savings_ratio * 100.0),
        "memenuhi_panduan_20_persen": overview.meets_guideline,
        "plafon_anggaran": {
            "bulanan_tetap": format_rupiah(overview.fixed.total_limit),
            "keinginan": format_rupiah(overview.wants.total_limit),
            "target_tabungan": format_rupiah(overview.savings.total_limit)
        },
        "realisasi_pengeluaran": {
            "bulanan_tetap": format_rupiah(overview.fixed.total_spent),
            "keinginan": format_rupiah(overview.wants.total_spent),
            "tabungan_terkumpul": format_rupiah(overview.savings.total_spent)
        },
        "persentase_terpakai": {
            "bulanan_tetap": format!("{:.0}%", fixed_pct),
            "keinginan": format!("{:.0}%", wants_pct),
            "tabungan_terkumpul": format!("{:.0}%", savings_pct)
        }
    });

    let json_data = serde_json::to_string_pretty(&formatted_data).map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        ai::ollama::generate_insight(&json_data, &settings.ollama_model, &settings.language)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();
                api.prevent_close();
                let _ = window.emit("tray-hint", ());
            }
            _ => {}
        })
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            if !app_dir.exists() {
                std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
            }
            let db_path = app_dir.join("fintel.sqlite");
            
            // Backup DB before opening
            db::backup::backup_database(&app_dir, &db_path);
            db::backup::backup_pre_savings_accounts(&app_dir, &db_path);

            let conn = Connection::open(db_path).expect("Failed to open db");
            conn.execute("PRAGMA foreign_keys = ON;", []).expect("Failed to enable foreign keys");
            db::schema::init_db(&conn).expect("Failed to init db schema");
            app.manage(DbState { conn: Mutex::new(conn) });
              let quit_i = MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>).unwrap();
              let show_i = MenuItem::with_id(app, "show", "Buka Fintel", true, None::<&str>).unwrap();
              let menu = Menu::with_items(app, &[&show_i, &quit_i]).unwrap();

              let _tray = TrayIconBuilder::new()
                  .icon(app.default_window_icon().unwrap().clone())
                  .menu(&menu)
                  .show_menu_on_left_click(false)
                  .on_menu_event(|app, event| match event.id.as_ref() {
                      "quit" => {
                          std::process::exit(0);
                      }
                      "show" => {
                          if let Some(window) = app.get_webview_window("main") {
                              let _ = window.show();
                              let _ = window.set_focus();
                          }
                      }
                      _ => {}
                  })
                  .on_tray_icon_event(|tray, event| match event {
                      TrayIconEvent::Click {
                          button: MouseButton::Left,
                          button_state: MouseButtonState::Up,
                          ..
                      } => {
                          let app = tray.app_handle();
                          if let Some(window) = app.get_webview_window("main") {
                              let _ = window.show();
                              let _ = window.set_focus();
                          }
                      }
                      _ => {}
                  })
                  .build(app).unwrap();

              let app_handle = app.handle().clone();
              std::thread::spawn(move || {
                  loop {
                      let state = app_handle.state::<DbState>();
                      std::thread::sleep(Duration::from_secs(60));
                      let conn = match state.conn.lock() { Ok(c) => c, Err(_) => continue, };
                      let settings = match crate::db::budget::get_budget_settings(&conn) { Ok(s) => s, Err(_) => continue, };
                      if !settings.reminder_enabled { continue; }
                      
                      let now = Local::now();
                      let current_time = now.format("%H:%M").to_string();
                      let current_date = now.format("%Y-%m-%d").to_string();
                      
                      if current_time == settings.reminder_time {
                          let last_notified: String = conn.query_row("SELECT last_notified_date FROM budget_settings WHERE id = 1", [], |r| r.get(0)).unwrap_or(String::new());
                          if last_notified != current_date {
                              let _ = conn.execute("UPDATE budget_settings SET last_notified_date = ?1 WHERE id = 1", [&current_date]);
                              let body = if settings.language == "en" { "Haven't logged today's transactions yet? Update Fintel now." } else { "Sudah catat transaksi hari ini? Yuk update Fintel kamu." };
                              let _ = app_handle.notification().builder().title("Fintel").body(body).show();
                          }
                      }
                    {
                    // Debt reminders
                    if let Ok(mut stmt) = conn.prepare("SELECT id, type, counterparty_name, amount, last_notified_date FROM debts WHERE status = 'unpaid' AND due_date IS NOT NULL AND due_date <= ?1") {
                        if let Ok(rows) = stmt.query_map([&current_date], |row| {
                            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, i64>(3)?, row.get::<_, Option<String>>(4)?))
                        }) {
                            for r in rows {
                                if let Ok((d_id, d_type, d_name, d_amount, d_last)) = r {
                                    let mut should_notify = false;
                                    if let Some(last) = d_last {
                                        if last != current_date { should_notify = true; }
                                    } else {
                                        should_notify = true;
                                    }

                                    if should_notify {
                                        let body = if settings.language == "en" {
                                            if d_type == "receivable" { format!("{}'s payment of Rp{} is due today.", d_name, d_amount) } else { format!("Your payment of Rp{} to {} is due today.", d_amount, d_name) }
                                        } else {
                                            if d_type == "receivable" { format!("Piutang dari {} sebesar Rp{} sudah jatuh tempo hari ini.", d_name, d_amount) } else { format!("Utang ke {} sebesar Rp{} sudah jatuh tempo hari ini.", d_name, d_amount) }
                                        };
                                        let _ = app_handle.notification().builder().title("Fintel Debt Reminder").body(body).show();
                                        let _ = conn.execute("UPDATE debts SET last_notified_date = ?1 WHERE id = ?2", rusqlite::params![&current_date, d_id]);
                                    }
                                }
                            }
                        }
                    }

                    };
                  }
              });

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
            update_saving_goal,
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
            generate_fintel_advice,
            get_category_budgets,
            set_category_budget,
            get_budget_overview,
            create_debt,
            list_debts,
            delete_debt,
            mark_debt_paid,
            set_reminder_settings,
            set_language,
            get_daily_expense_totals,
            preview_envelope,
            preview_auto_allocation,
            save_allocation_percents,
            get_allocation_percents,
            list_accounts,
            create_account,
            update_account,
            archive_account,
            unarchive_account,
            set_default_account,
            create_transfer,
            list_transfers,
            update_transfer,
            delete_transfer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn get_ollama_models() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| ai::ollama::get_ollama_models())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn set_ollama_model(state: tauri::State<DbState>, model: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE budget_settings SET ollama_model = ?1 WHERE id = 1", [&model]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn reset_all_data(state: tauri::State<DbState>) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::schema::reset_all_data(&mut conn)
}

pub mod ai;



#[tauri::command]
fn create_debt(
    state: tauri::State<DbState>,
    r#type: &str,
    counterparty_name: &str,
    amount: i64,
    description: Option<&str>,
    due_date: Option<&str>,
    account_id: Option<i64>,
) -> Result<i64, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::debts::create_debt(&mut conn, r#type, counterparty_name, amount, description, due_date, account_id)
}

#[tauri::command]
fn list_debts(state: tauri::State<DbState>, filter_type: Option<&str>, filter_status: Option<&str>) -> Result<Vec<db::debts::Debt>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::debts::list_debts(&conn, filter_type, filter_status)
}

#[tauri::command]
fn delete_debt(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::debts::delete_debt(&conn, id)
}

#[tauri::command]
fn mark_debt_paid(state: tauri::State<DbState>, id: i64, account_id: Option<i64>) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::debts::mark_debt_paid(&mut conn, id, account_id)
}

#[tauri::command]
fn list_accounts(state: tauri::State<DbState>, include_archived: Option<bool>) -> Result<Vec<db::accounts::Account>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::accounts::list_accounts(&conn, include_archived.unwrap_or(false))
}

#[tauri::command]
fn create_account(
    state: tauri::State<DbState>,
    name: &str,
    account_type: &str,
    opening_balance: Option<i64>,
    icon: Option<&str>,
    color: Option<&str>,
    is_default: Option<bool>,
    is_savings: Option<bool>,
) -> Result<i64, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::accounts::create_account(
        &mut conn,
        name,
        account_type,
        icon,
        color,
        opening_balance,
        is_default,
        is_savings,
    )
}

#[tauri::command]
fn update_account(
    state: tauri::State<DbState>,
    id: i64,
    name: &str,
    account_type: &str,
    opening_balance: i64,
    icon: &str,
    color: &str,
    is_savings: Option<bool>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::accounts::update_account(
        &conn,
        id,
        name,
        account_type,
        Some(icon),
        Some(color),
        opening_balance,
        is_savings,
    )
}

#[tauri::command]
fn create_transfer(
    state: tauri::State<DbState>,
    from_account_id: i64,
    to_account_id: i64,
    amount: i64,
    transfer_date: &str,
    note: Option<&str>,
    saving_goal_id: Option<i64>,
) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::transfers::create_transfer(
        &conn,
        from_account_id,
        to_account_id,
        amount,
        transfer_date,
        note,
        saving_goal_id,
    )
}

#[tauri::command]
fn update_transfer(
    state: tauri::State<DbState>,
    id: i64,
    from_account_id: i64,
    to_account_id: i64,
    amount: i64,
    transfer_date: &str,
    note: Option<&str>,
    saving_goal_id: Option<i64>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::transfers::update_transfer(
        &conn,
        id,
        from_account_id,
        to_account_id,
        amount,
        transfer_date,
        note,
        saving_goal_id,
    )
}

#[tauri::command]
fn delete_transfer(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::transfers::delete_transfer(&conn, id)
}

#[tauri::command]
fn list_transfers(
    state: tauri::State<DbState>,
    start_date: Option<&str>,
    end_date: Option<&str>,
    account_id: Option<i64>,
) -> Result<Vec<db::transfers::Transfer>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::transfers::list_transfers(&conn, start_date, end_date, account_id)
}

#[tauri::command]
fn archive_account(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::accounts::archive_account(&conn, id)
}

#[tauri::command]
fn unarchive_account(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::accounts::unarchive_account(&conn, id)
}

#[tauri::command]
fn set_default_account(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::accounts::set_default_account(&mut conn, id)
}

#[tauri::command]
fn get_daily_expense_totals(state: tauri::State<DbState>, month: String) -> Result<Vec<crate::db::transactions::DailyTotal>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    crate::db::transactions::get_daily_totals(&conn, &month)
}

#[tauri::command]
fn set_reminder_settings(state: tauri::State<DbState>, enabled: bool, time: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    crate::db::budget::set_reminder_settings(&conn, enabled, time)
}

#[tauri::command]
fn set_language(state: tauri::State<DbState>, language: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    crate::db::budget::set_language(&conn, &language)
}




