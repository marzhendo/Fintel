use chrono::Local;
use std::fs;
use std::path::{Path, PathBuf};

pub fn backup_database(app_dir: &Path, db_path: &Path) {
    let backup_dir = app_dir.join("backups");
    if !backup_dir.exists() {
        if let Err(_) = fs::create_dir_all(&backup_dir) {
            return;
        }
    }

    let date_str = Local::now().format("%Y-%m-%d").to_string();
    let backup_file = backup_dir.join(format!("backup-{}.db", date_str));

    // Only backup if it does not exist today
    if !backup_file.exists() && db_path.exists() {
        let _ = fs::copy(db_path, &backup_file);
    }

    // Cleanup old backups (keep last 7)
    if let Ok(entries) = fs::read_dir(&backup_dir) {
        let mut backups: Vec<PathBuf> = entries
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("db"))
            .collect();

        backups.sort(); // String sort works since names are YYYY-MM-DD

        if backups.len() > 7 {
            let to_delete = backups.len() - 7;
            for i in 0..to_delete {
                let _ = fs::remove_file(&backups[i]);
            }
        }
    }
}

pub fn backup_pre_accounts(app_dir: &Path, db_path: &Path) {
    let backup_dir = app_dir.join("backups");
    if !backup_dir.exists() {
        let _ = fs::create_dir_all(&backup_dir);
    }

    let date_str = Local::now().format("%Y-%m-%d").to_string();
    let backup_file = backup_dir.join(format!("pre-accounts-{}.db", date_str));

    if !backup_file.exists() && db_path.exists() {
        let _ = fs::copy(db_path, &backup_file);
    }
}

pub fn backup_pre_savings_accounts(app_dir: &Path, db_path: &Path) {
    let backup_dir = app_dir.join("backups");
    if !backup_dir.exists() {
        let _ = fs::create_dir_all(&backup_dir);
    }

    let date_str = Local::now().format("%Y-%m-%d").to_string();
    let backup_file = backup_dir.join(format!("pre-savings-accounts-{}.db", date_str));

    if !backup_file.exists() && db_path.exists() {
        let _ = fs::copy(db_path, &backup_file);
    }
}
