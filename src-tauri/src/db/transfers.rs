use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Transfer {
    pub id: i64,
    pub from_account_id: i64,
    pub from_account_name: String,
    pub to_account_id: i64,
    pub to_account_name: String,
    pub amount: i64,
    pub transfer_date: String,
    pub note: Option<String>,
    pub saving_goal_id: Option<i64>,
    pub saving_goal_name: Option<String>,
    pub saving_effect: Option<String>, // 'deposit' | 'withdrawal' | None
    pub created_at: String,
}

/// Validates transfer rules and determines the immutable snapshot for saving_effect.
/// Rules:
/// - Harian -> Harian: netral, tanpa goal (saving_goal_id = None, saving_effect = None).
/// - Harian -> Tabungan: WAJIB pilih goal milik akun tujuan. saving_effect = 'deposit'.
/// - Tabungan -> Harian: WAJIB pilih goal milik akun asal. saving_effect = 'withdrawal'. (penarikan > progress diizinkan dengan peringatan lunak).
/// - Tabungan <-> Tabungan: DITOLAK dengan pesan jelas.
/// - Akun Tabungan tanpa goal: tolak dengan ajakan membuat goal.
pub fn validate_transfer_rules(
    conn: &Connection,
    from_account_id: i64,
    to_account_id: i64,
    amount: i64,
    saving_goal_id: Option<i64>,
) -> Result<(Option<i64>, Option<String>), String> {
    if amount <= 0 {
        return Err("Nominal transfer harus lebih besar dari Rp 0.".to_string());
    }

    if from_account_id == to_account_id {
        return Err("Akun asal dan akun tujuan tidak boleh sama.".to_string());
    }

    // Fetch from_account is_savings & is_archived
    let (from_is_savings, from_is_archived): (i64, i64) = conn
        .query_row(
            "SELECT is_savings, is_archived FROM accounts WHERE id = ?1",
            [from_account_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "Akun asal tidak ditemukan.".to_string())?;

    if from_is_archived == 1 {
        return Err("Akun asal telah diarsipkan dan tidak dapat digunakan untuk transfer.".to_string());
    }

    // Fetch to_account is_savings & is_archived
    let (to_is_savings, to_is_archived): (i64, i64) = conn
        .query_row(
            "SELECT is_savings, is_archived FROM accounts WHERE id = ?1",
            [to_account_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "Akun tujuan tidak ditemukan.".to_string())?;

    if to_is_archived == 1 {
        return Err("Akun tujuan telah diarsipkan dan tidak dapat digunakan untuk transfer.".to_string());
    }

    let from_savings = from_is_savings == 1;
    let to_savings = to_is_savings == 1;

    match (from_savings, to_savings) {
        // Tabungan <-> Tabungan: DITOLAK
        (true, true) => Err(
            "Transfer langsung antar akun Tabungan belum didukung. Silakan pindahkan melalui akun Harian terlebih dahulu."
                .to_string(),
        ),

        // Harian -> Harian: Netral
        (false, false) => Ok((None, None)),

        // Harian -> Tabungan: DEPOSIT
        (false, true) => {
            // Check if to_account has any goals
            let goal_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM saving_goals WHERE account_id = ?1",
                    [to_account_id],
                    |r| r.get(0),
                )
                .unwrap_or(0);

            if goal_count == 0 {
                return Err(
                    "Akun Tabungan tujuan belum memiliki target goal. Silakan buat goal baru terlebih dahulu."
                        .to_string(),
                );
            }

            let g_id = saving_goal_id.ok_or_else(|| {
                "Target goal wajib dipilih untuk setoran ke akun Tabungan.".to_string()
            })?;

            // Verify goal belongs to to_account
            let goal_account_id: Option<i64> = conn
                .query_row(
                    "SELECT account_id FROM saving_goals WHERE id = ?1",
                    [g_id],
                    |r| r.get(0),
                )
                .map_err(|_| "Target goal yang dipilih tidak ditemukan.".to_string())?;

            if goal_account_id != Some(to_account_id) {
                return Err(
                    "Target goal yang dipilih tidak terhubung dengan akun Tabungan tujuan.".to_string(),
                );
            }

            Ok((Some(g_id), Some("deposit".to_string())))
        }

        // Tabungan -> Harian: WITHDRAWAL
        (true, false) => {
            // Check if from_account has any goals
            let goal_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM saving_goals WHERE account_id = ?1",
                    [from_account_id],
                    |r| r.get(0),
                )
                .unwrap_or(0);

            if goal_count == 0 {
                return Err(
                    "Akun Tabungan asal tidak memiliki target goal.".to_string(),
                );
            }

            let g_id = saving_goal_id.ok_or_else(|| {
                "Target goal wajib dipilih untuk penarikan dari akun Tabungan.".to_string()
            })?;

            // Verify goal belongs to from_account
            let goal_account_id: Option<i64> = conn
                .query_row(
                    "SELECT account_id FROM saving_goals WHERE id = ?1",
                    [g_id],
                    |r| r.get(0),
                )
                .map_err(|_| "Target goal yang dipilih tidak ditemukan.".to_string())?;

            if goal_account_id != Some(from_account_id) {
                return Err(
                    "Target goal yang dipilih tidak terhubung dengan akun Tabungan asal.".to_string(),
                );
            }

            // Note: Penarikan melebihi progress goal diizinkan (peringatan lunak di frontend)
            Ok((Some(g_id), Some("withdrawal".to_string())))
        }
    }
}

pub fn create_transfer(
    conn: &Connection,
    from_account_id: i64,
    to_account_id: i64,
    amount: i64,
    transfer_date: &str,
    note: Option<&str>,
    saving_goal_id: Option<i64>,
) -> Result<i64, String> {
    let (final_goal_id, saving_effect) =
        validate_transfer_rules(conn, from_account_id, to_account_id, amount, saving_goal_id)?;

    let clean_note = note.map(|s| s.trim()).filter(|s| !s.is_empty());

    conn.execute(
        "INSERT INTO transfers (
            from_account_id, to_account_id, amount, transfer_date, note, saving_goal_id, saving_effect
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            from_account_id,
            to_account_id,
            amount,
            transfer_date,
            clean_note,
            final_goal_id,
            saving_effect
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

pub fn update_transfer(
    conn: &Connection,
    id: i64,
    from_account_id: i64,
    to_account_id: i64,
    amount: i64,
    transfer_date: &str,
    note: Option<&str>,
    saving_goal_id: Option<i64>,
) -> Result<(), String> {
    let (final_goal_id, saving_effect) =
        validate_transfer_rules(conn, from_account_id, to_account_id, amount, saving_goal_id)?;

    let clean_note = note.map(|s| s.trim()).filter(|s| !s.is_empty());

    conn.execute(
        "UPDATE transfers SET
            from_account_id = ?1,
            to_account_id = ?2,
            amount = ?3,
            transfer_date = ?4,
            note = ?5,
            saving_goal_id = ?6,
            saving_effect = ?7
        WHERE id = ?8",
        params![
            from_account_id,
            to_account_id,
            amount,
            transfer_date,
            clean_note,
            final_goal_id,
            saving_effect,
            id
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn delete_transfer(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM transfers WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_transfer_by_id(conn: &Connection, id: i64) -> Result<Transfer, String> {
    let mut stmt = conn
        .prepare(
            "SELECT
                t.id,
                t.from_account_id,
                a1.name as from_account_name,
                t.to_account_id,
                a2.name as to_account_name,
                t.amount,
                t.transfer_date,
                t.note,
                t.saving_goal_id,
                sg.name as saving_goal_name,
                t.saving_effect,
                t.created_at
            FROM transfers t
            JOIN accounts a1 ON t.from_account_id = a1.id
            JOIN accounts a2 ON t.to_account_id = a2.id
            LEFT JOIN saving_goals sg ON t.saving_goal_id = sg.id
            WHERE t.id = ?1",
        )
        .map_err(|e| e.to_string())?;

    stmt.query_row([id], |row| {
        Ok(Transfer {
            id: row.get(0)?,
            from_account_id: row.get(1)?,
            from_account_name: row.get(2)?,
            to_account_id: row.get(3)?,
            to_account_name: row.get(4)?,
            amount: row.get(5)?,
            transfer_date: row.get(6)?,
            note: row.get(7)?,
            saving_goal_id: row.get(8)?,
            saving_goal_name: row.get(9)?,
            saving_effect: row.get(10)?,
            created_at: row.get(11)?,
        })
    })
    .map_err(|e| format!("Transfer tidak ditemukan: {}", e))
}

pub fn list_transfers(
    conn: &Connection,
    start_date: Option<&str>,
    end_date: Option<&str>,
    account_id: Option<i64>,
) -> Result<Vec<Transfer>, String> {
    let mut query = "
        SELECT
            t.id,
            t.from_account_id,
            a1.name as from_account_name,
            t.to_account_id,
            a2.name as to_account_name,
            t.amount,
            t.transfer_date,
            t.note,
            t.saving_goal_id,
            sg.name as saving_goal_name,
            t.saving_effect,
            t.created_at
        FROM transfers t
        JOIN accounts a1 ON t.from_account_id = a1.id
        JOIN accounts a2 ON t.to_account_id = a2.id
        LEFT JOIN saving_goals sg ON t.saving_goal_id = sg.id
        WHERE 1=1
    ".to_string();

    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(s) = start_date {
        if !s.is_empty() {
            query.push_str(" AND t.transfer_date >= ?");
            params_vec.push(Box::new(s.to_string()));
        }
    }

    if let Some(e) = end_date {
        if !e.is_empty() {
            query.push_str(" AND t.transfer_date <= ?");
            params_vec.push(Box::new(e.to_string()));
        }
    }

    if let Some(acc_id) = account_id {
        query.push_str(" AND (t.from_account_id = ? OR t.to_account_id = ?)");
        params_vec.push(Box::new(acc_id));
        params_vec.push(Box::new(acc_id));
    }

    query.push_str(" ORDER BY t.transfer_date DESC, t.id DESC");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let rusqlite_params: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    let rows = stmt
        .query_map(rusqlite_params.as_slice(), |row| {
            Ok(Transfer {
                id: row.get(0)?,
                from_account_id: row.get(1)?,
                from_account_name: row.get(2)?,
                to_account_id: row.get(3)?,
                to_account_name: row.get(4)?,
                amount: row.get(5)?,
                transfer_date: row.get(6)?,
                note: row.get(7)?,
                saving_goal_id: row.get(8)?,
                saving_goal_name: row.get(9)?,
                saving_effect: row.get(10)?,
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

/// Setoran tabungan bulanan (realisasi grup Savings) = max(0, SUM(deposit bulan itu) - SUM(withdrawal bulan itu))
pub fn get_monthly_net_savings_deposit(conn: &Connection, current_month: &str) -> Result<i64, String> {
    let net: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(
                CASE
                    WHEN saving_effect = 'deposit' THEN amount
                    WHEN saving_effect = 'withdrawal' THEN -amount
                    ELSE 0
                END
             ), 0)
             FROM transfers
             WHERE saving_effect IS NOT NULL
               AND strftime('%Y-%m', transfer_date) = ?1",
            [current_month],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Ok(net.max(0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::init_db;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();
        init_db(&conn).unwrap();
        conn
    }

    #[test]
    fn test_harian_to_tabungan_without_goal_rejected() {
        let mut conn = setup_test_db();
        // Harian account: Cash (id=1, is_savings=0)
        // Create Tabungan account (is_savings=1)
        let tabungan_id = crate::db::accounts::create_account(
            &mut conn,
            "BCA Tabungan",
            "bank",
            None,
            None,
            Some(0),
            Some(false),
            Some(true),
        )
        .unwrap();

        // Create a goal attached to BCA Tabungan
        let goal_id = crate::db::saving_goals::create_saving_goal(
            &conn,
            "Liburan Jepang",
            20000000,
            None,
            Some(tabungan_id),
        )
        .unwrap();

        // 1. Transfer without goal -> rejected
        let res_no_goal = create_transfer(&conn, 1, tabungan_id, 500000, "2026-10-15", None, None);
        assert!(res_no_goal.is_err());
        assert!(res_no_goal.unwrap_err().contains("Target goal wajib dipilih"));

        // 2. Transfer with valid goal -> succeeds with deposit effect
        let tr_id = create_transfer(&conn, 1, tabungan_id, 500000, "2026-10-15", Some("Nabung awal"), Some(goal_id)).unwrap();
        let tr = get_transfer_by_id(&conn, tr_id).unwrap();
        assert_eq!(tr.saving_effect, Some("deposit".to_string()));
        assert_eq!(tr.saving_goal_id, Some(goal_id));
    }

    #[test]
    fn test_tabungan_to_tabungan_rejected() {
        let mut conn = setup_test_db();
        let tabungan1 = crate::db::accounts::create_account(
            &mut conn,
            "Tabungan 1",
            "bank",
            None,
            None,
            Some(0),
            Some(false),
            Some(true),
        )
        .unwrap();

        let tabungan2 = crate::db::accounts::create_account(
            &mut conn,
            "Tabungan 2",
            "bank",
            None,
            None,
            Some(0),
            Some(false),
            Some(true),
        )
        .unwrap();

        let res = create_transfer(&conn, tabungan1, tabungan2, 100000, "2026-10-15", None, None);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Transfer langsung antar akun Tabungan belum didukung"));
    }

    #[test]
    fn test_goal_progress_from_two_deposits_and_one_withdrawal() {
        let mut conn = setup_test_db();
        let tabungan_id = crate::db::accounts::create_account(
            &mut conn,
            "Mandiri Savings",
            "bank",
            None,
            None,
            Some(0),
            Some(false),
            Some(true),
        )
        .unwrap();

        let goal_id = crate::db::saving_goals::create_saving_goal(
            &conn,
            "Dana Darurat",
            10000000,
            None,
            Some(tabungan_id),
        )
        .unwrap();

        // Deposit 1: 500.000
        create_transfer(&conn, 1, tabungan_id, 500000, "2026-10-10", None, Some(goal_id)).unwrap();
        // Deposit 2: 300.000
        create_transfer(&conn, 1, tabungan_id, 300000, "2026-10-11", None, Some(goal_id)).unwrap();
        // Withdrawal 1: 200.000
        create_transfer(&conn, tabungan_id, 1, 200000, "2026-10-12", None, Some(goal_id)).unwrap();

        let goals = crate::db::saving_goals::list_saving_goals(&conn).unwrap();
        let g = goals.iter().find(|item| item.id == goal_id).unwrap();
        // 500k + 300k - 200k = 600k
        assert_eq!(g.current_amount, 600000);
    }

    #[test]
    fn test_withdrawal_exceeding_progress_does_not_make_progress_negative() {
        let mut conn = setup_test_db();
        let tabungan_id = crate::db::accounts::create_account(
            &mut conn,
            "Tabungan Utama",
            "bank",
            None,
            None,
            Some(0),
            Some(false),
            Some(true),
        )
        .unwrap();

        let goal_id = crate::db::saving_goals::create_saving_goal(
            &conn,
            "Goal Kecil",
            1000000,
            None,
            Some(tabungan_id),
        )
        .unwrap();

        // Deposit: 100.000
        create_transfer(&conn, 1, tabungan_id, 100000, "2026-10-01", None, Some(goal_id)).unwrap();
        // Withdrawal: 150.000 (melebihi progress) -> diizinkan tapi progress min 0
        create_transfer(&conn, tabungan_id, 1, 150000, "2026-10-02", None, Some(goal_id)).unwrap();

        let goals = crate::db::saving_goals::list_saving_goals(&conn).unwrap();
        let g = goals.iter().find(|item| item.id == goal_id).unwrap();
        assert_eq!(g.current_amount, 0);
    }

    #[test]
    fn test_monthly_savings_realization_calculates_net_deposit() {
        let mut conn = setup_test_db();
        let tabungan_id = crate::db::accounts::create_account(
            &mut conn,
            "Tabungan Bulanan",
            "bank",
            None,
            None,
            Some(0),
            Some(false),
            Some(true),
        )
        .unwrap();

        let goal_id = crate::db::saving_goals::create_saving_goal(
            &conn,
            "Tabungan Pendidikan",
            5000000,
            None,
            Some(tabungan_id),
        )
        .unwrap();

        // Bulan Oktober 2026: Deposit 1.000.000, Withdrawal 200.000 -> Net 800.000
        create_transfer(&conn, 1, tabungan_id, 1000000, "2026-10-05", None, Some(goal_id)).unwrap();
        create_transfer(&conn, tabungan_id, 1, 200000, "2026-10-10", None, Some(goal_id)).unwrap();

        // Bulan September 2026 (harus tidak terhitung di Oktober): Deposit 500.000
        create_transfer(&conn, 1, tabungan_id, 500000, "2026-09-20", None, Some(goal_id)).unwrap();

        let oct_net = get_monthly_net_savings_deposit(&conn, "2026-10").unwrap();
        assert_eq!(oct_net, 800000);

        let sep_net = get_monthly_net_savings_deposit(&conn, "2026-09").unwrap();
        assert_eq!(sep_net, 500000);
    }

    #[test]
    fn test_edit_transfer_updates_saving_effect_if_direction_reversed() {
        let mut conn = setup_test_db();
        let tabungan_id = crate::db::accounts::create_account(
            &mut conn,
            "Tabungan Simpanan",
            "bank",
            None,
            None,
            Some(0),
            Some(false),
            Some(true),
        )
        .unwrap();

        let goal_id = crate::db::saving_goals::create_saving_goal(
            &conn,
            "Goal Edit",
            5000000,
            None,
            Some(tabungan_id),
        )
        .unwrap();

        // Initially Deposit (1 -> tabungan)
        let tr_id = create_transfer(&conn, 1, tabungan_id, 400000, "2026-10-05", None, Some(goal_id)).unwrap();
        let tr_before = get_transfer_by_id(&conn, tr_id).unwrap();
        assert_eq!(tr_before.saving_effect, Some("deposit".to_string()));

        // Edit direction: reverse to Withdrawal (tabungan -> 1)
        update_transfer(&conn, tr_id, tabungan_id, 1, 400000, "2026-10-05", Some("Ditarik kembali"), Some(goal_id)).unwrap();
        let tr_after = get_transfer_by_id(&conn, tr_id).unwrap();
        assert_eq!(tr_after.saving_effect, Some("withdrawal".to_string()));
        assert_eq!(tr_after.note, Some("Ditarik kembali".to_string()));
    }

    #[test]
    fn test_delete_transfer_restores_goal_progress() {
        let mut conn = setup_test_db();
        let tabungan_id = crate::db::accounts::create_account(
            &mut conn,
            "Tabungan Hapus",
            "bank",
            None,
            None,
            Some(0),
            Some(false),
            Some(true),
        )
        .unwrap();

        let goal_id = crate::db::saving_goals::create_saving_goal(
            &conn,
            "Goal Hapus",
            5000000,
            None,
            Some(tabungan_id),
        )
        .unwrap();

        let tr_id = create_transfer(&conn, 1, tabungan_id, 750000, "2026-10-05", None, Some(goal_id)).unwrap();
        let goals_before = crate::db::saving_goals::list_saving_goals(&conn).unwrap();
        let g_before = goals_before.iter().find(|i| i.id == goal_id).unwrap();
        assert_eq!(g_before.current_amount, 750000);

        delete_transfer(&conn, tr_id).unwrap();
        let goals_after = crate::db::saving_goals::list_saving_goals(&conn).unwrap();
        let g_after = goals_after.iter().find(|i| i.id == goal_id).unwrap();
        assert_eq!(g_after.current_amount, 0);
    }
}
