use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::time::Duration;

const OLLAMA_BASE_URL: &str = "http://127.0.0.1:11434";

#[derive(Serialize, Deserialize, Debug)]
pub struct ParsedTransaction {
    pub amount: i64,
    pub r#type: String, // "income" or "expense"
    pub category_guess: String,
    pub date: String,
    pub note: String,
    pub confidence: String,
    #[serde(default)]
    pub account_guess: Option<String>,
    #[serde(default)]
    pub is_savings_deposit: bool,
    #[serde(default)]
    pub goal_guess: Option<String>,
}

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<String>,
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: String,
}

fn is_ollama_reachable() -> bool {
    let client = match Client::builder().timeout(Duration::from_secs(2)).build() {
        Ok(c) => c,
        Err(_) => return false,
    };
    match client.get(format!("{}/api/tags", OLLAMA_BASE_URL)).send() {
        Ok(res) => res.status().is_success(),
        Err(_) => false,
    }
}

/// Pastikan service Ollama berjalan. Jika belum aktif, coba jalankan `ollama serve` di background.
pub fn ensure_ollama_running() -> bool {
    if is_ollama_reachable() {
        return true;
    }

    let mut cmd = Command::new("ollama");
    cmd.arg("serve");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let _ = cmd
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();

    // Tunggu maksimal ~5 detik hingga server Ollama siap menerima koneksi
    for _ in 0..10 {
        std::thread::sleep(Duration::from_millis(500));
        if is_ollama_reachable() {
            return true;
        }
    }

    false
}

pub fn check_ollama_health() -> bool {
    ensure_ollama_running()
}

/// Pastikan model yang diminta tersedia; jika tidak ada, gunakan model pertama yang terinstal di Ollama.
fn resolve_model_name(requested_model: &str) -> String {
    if let Ok(models) = get_ollama_models() {
        if models.iter().any(|m| m == requested_model) {
            return requested_model.to_string();
        }
        if let Some(first) = models.first() {
            return first.clone();
        }
    }
    requested_model.to_string()
}

pub fn parse_transaction_intent(
    text: &str,
    model: &str,
    categories: &[String],
    today_date: &str,
    language: &str,
) -> Result<ParsedTransaction, String> {
    if !ensure_ollama_running() {
        return Err(
            "Ollama belum berjalan di komputer Anda. Pastikan aplikasi Ollama sudah terinstal dan aktif (127.0.0.1:11434).".to_string(),
        );
    }

    let active_model = resolve_model_name(model);
    let categories_list = categories.join(", ");

    let prompt = if language == "en" {
        format!(
            "You are a highly accurate financial assistant. Extract information from the user's sentence into valid JSON with EXACTLY this schema, without any additional text:
            {{\"amount\": number, \"type\": \"income\"|\"expense\", \"category_guess\": string, \"date\": \"YYYY-MM-DD\", \"note\": string, \"confidence\": \"high\"|\"medium\"|\"low\", \"account_guess\": string|null, \"is_savings_deposit\": boolean, \"goal_guess\": string|null}}
            Important Rules:
            1. Amount: Convert slang to full numbers. 'k' = multiply by 1,000. 'm' = multiply by 1,000,000. Example: '8k' -> 8000.
            2. Category: Choose one from this list that is Most Relevant semantically: [{}].
            3. Date defaults to today if not mentioned: {}.
            4. Note: Extract 1-3 short noun words representing the item/activity. Do NOT repeat the whole sentence.
               Examples: 'bought coffee for 13k' -> note: 'Coffee' (category: Minuman), 'paid electricity bill 200' -> note: 'Electricity' (category: Tagihan), 'bought gallon water 20k' -> note: 'Galon' (category: Galon), 'filled gasoline 50k' -> note: 'Bensin' (category: Bensin), 'bought data package 50k' -> note: 'Kuota' (category: Kuota).
            5. Account Guess: If the user mentions an account or payment method (e.g. 'BCA', 'Mandiri', 'GoPay', 'Cash'), extract its name into 'account_guess'. Otherwise set 'account_guess': null.
            6. Savings Deposit: If the user intends to save money / deposit into savings (e.g. 'save 100k', 'deposit 500k for vacation', 'nabung 50k'), set 'is_savings_deposit': true, set 'category_guess': 'Tabungan', and if a goal is mentioned set 'goal_guess' (else null).

            User text: \"{}\"",
            categories_list, today_date, text
        )
    } else {
        format!(
            "Kamu adalah asisten keuangan yang sangat akurat. Ekstrak informasi dari kalimat user menjadi JSON valid dengan schema PERSIS berikut, tanpa teks tambahan apapun:
            {{\"amount\": number, \"type\": \"income\"|\"expense\", \"category_guess\": string, \"date\": \"YYYY-MM-DD\", \"note\": string, \"confidence\": \"high\"|\"medium\"|\"low\", \"account_guess\": string|null, \"is_savings_deposit\": boolean, \"goal_guess\": string|null}}
            Aturan Penting:
            1. Amount: Ubah singkatan gaul jadi angka penuh. 'rb'/'k'/'ribu' = kalikan 1.000. 'jt'/'juta' = kalikan 1.000.000. Contoh: '8rb' -> 8000. '50k' -> 50000. '1.5jt' -> 1500000.
            2. Kategori: Pilih satu dari daftar ini yang Paling Relevan secara semantik: [{}].
            3. Tanggal default hari ini jika tidak disebutkan: {}.
            4. Note: Ekstrak 1-3 kata benda singkat yang merepresentasikan item/aktivitas. BUKAN mengulang seluruh kalimat.
               Contoh: 'gua tadi beli kopi 13k' -> note: 'Kopi' (kategori: Minuman). 'beli galon 20rb' -> note: 'Galon' (kategori: Galon). 'isi bensin motor 30k' -> note: 'Bensin' (kategori: Bensin). 'beli kuota telkomsel 50rb' -> note: 'Kuota' (kategori: Kuota). 'abis makan siang nasi padang 25rb' -> note: 'Nasi Padang' (kategori: Makan).
            5. Akun Guess: Jika user menyebutkan nama akun/dompet (misal: 'BCA', 'Mandiri', 'GoPay', 'OVO', 'DANA', 'ShopeePay', 'Cash', 'Tunai'), isi ke 'account_guess'. Jika tidak disebutkan, isi null.
            6. Setoran Tabungan: Jika user bermaksud menabung (contoh: 'nabung 100rb', 'simpan uang 500k buat liburan', 'nabung 50rb dana darurat'), set 'is_savings_deposit': true, set 'category_guess': 'Tabungan', dan jika ada target goal atau tujuan tabungan yang disebut, isi ke 'goal_guess' (jika tidak ada, set null).

            Teks user: \"{}\"",
            categories_list, today_date, text
        )
    };

    let req = OllamaRequest {
        model: active_model,
        prompt,
        stream: false,
        format: Some("json".to_string()),
    };

    let client = Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .post(format!("{}/api/generate", OLLAMA_BASE_URL))
        .json(&req)
        .send()
        .map_err(|e| format!("Ollama unreachable: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().unwrap_or_default();
        return Err(format!("Ollama API error ({}): {}", status, err_text));
    }

    let ollama_res: OllamaResponse = res
        .json()
        .map_err(|e| format!("Ollama JSON parse error: {}", e))?;
    let mut parsed: ParsedTransaction = serde_json::from_str(&ollama_res.response).map_err(|e| {
        format!(
            "Invalid JSON from model: {} - Raw: {}",
            e, ollama_res.response
        )
    })?;

    let lower_text = text.to_lowercase();
    if lower_text.contains("nabung") || lower_text.contains("menabung") || parsed.category_guess.to_lowercase().contains("tabung") {
        parsed.is_savings_deposit = true;
    }

    Ok(parsed)
}

pub fn generate_insight(budget_json: &str, model: &str, language: &str) -> Result<String, String> {
    if !ensure_ollama_running() {
        return Err(
            "Ollama belum berjalan di komputer Anda. Pastikan aplikasi Ollama aktif di 127.0.0.1:11434.".to_string(),
        );
    }

    let active_model = resolve_model_name(model);

    let prompt = if language == "en" {
        format!(
            "You are a personal financial consultant in the \"Fintel\" app. Your tone is PROFESSIONAL but approachable, \n\
            like a financial advisor explaining things to a young adult client. Avoid slang entirely. \n\
            Use clear, objective, and analytical English.\n\
            \n\
            CRITICAL LOGIC RULES:\n\
            - Any category with a 0% realization MUST ALWAYS be categorized as \"needs attention\", NEVER as an achievement, regardless of other categories.\n\
            - A realization >0% but <100% of the envelope budget limit for Fixed Monthly / Wants can be described as \"on track\" or \"well-controlled\".\n\
            - Achieving or exceeding 100% of the budget limit means: for Fixed Monthly / Wants it is a WARNING (overspending); for Savings, it is a POSITIVE ACHIEVEMENT (goal met).\n\
            - If savings ratio meets the guideline (>= 20%), acknowledge it positively. If below 20%, recommend adjustments.\n\
            - Use the exact numbers provided. Do not recalculate them.\n\
            \n\
            RESPONSE STRUCTURE (Max 3-4 sentences total):\n\
            1. One opening sentence objectively summarizing the overall condition (analytical, no emotional exclamations like \"Awesome!\").\n\
            2. Identify ONE specific area needing the most attention (highest priority), with a brief reason why.\n\
            3. One concrete, actionable recommendation regarding that priority area.\n\
            \n\
            DESIRED TONE EXAMPLES (few-shot):\n\
            \n\
            Data: Fixed Monthly 45%, Wants 80%, Savings 0%\n\
            Response: \"Your overall spending this month is well-controlled, with both Fixed Monthly and Discretionary expenses staying under budget limit. However, no funds have been allocated to Savings this month, which should be the priority given the 0% progress toward your target. Consider redirecting a portion of your remaining budget toward Savings before the month ends.\"\n\
            \n\
            Data: Fixed Monthly 120%, Wants 60%, Savings 0%\n\
            Response: \"Fixed Monthly expenses this month have exceeded the envelope budget by 20%, which should be the primary priority for review. This overspending has consequently left Savings completely unfunded. It is recommended to review your Fixed expense items to identify areas where costs can be reduced, allowing you to begin building your Savings.\"\n\
            \n\
            Data: {}\n\
            Create a response with the same professional structure as the examples above, adjusting to the provided data.\n\
            Remember: 0% savings is always a point of concern, never praise it.",
            budget_json
        )
    } else {
        format!(
            "Kamu adalah konsultan keuangan personal di app \"Fintel\". Tone kamu PROFESIONAL tapi tetap approachable, \n\
            seperti financial advisor yang menjelaskan ke klien muda. Hindari bahasa gaul/slang sepenuhnya. \n\
            Gunakan Bahasa Indonesia baku yang jelas, objektif, dan analitis.\n\
            \n\
            ATURAN LOGIC (SANGAT PENTING):\n\
            - Kategori dengan realisasi 0% dari alokasi/target tabungan SELALU dikategorikan sebagai \"perlu perhatian\", TIDAK PERNAH sebagai pencapaian, terlepas dari kondisi kategori lain.\n\
            - Kategori dengan realisasi tapi masih di bawah 100% dari plafon anggaran (dan bukan 0%) boleh disebut \"on track\" atau \"terkendali\".\n\
            - Kategori yang mencapai/melebihi 100% dari plafon anggaran: untuk Bulanan Tetap/Keinginan, itu peringatan (overspending); untuk Tabungan, itu pencapaian positif (target tercapai).\n\
            - Jika rasio tabungan >= 20% (memenuhi panduan), apresiasi dengan wajar. Jika di bawah 20%, sarankan penyesuaian.\n\
            - Gunakan angka yang diberikan APA ADANYA, jangan menghitung ulang.\n\
            \n\
            STRUKTUR RESPONS (Maksimal 3-4 kalimat total):\n\
            1. Satu kalimat pembuka yang merangkum kondisi keseluruhan secara objektif (ringkasan analitis singkat, hindari seruan seperti \"Mantap!\").\n\
            2. Sebutkan SATU area yang paling butuh perhatian secara spesifik (prioritas tertinggi), dengan alasan singkat kenapa itu prioritas.\n\
            3. Satu rekomendasi konkret dan actionable terkait area tersebut.\n\
            \n\
            CONTOH GAYA BARU (few-shot):\n\
            \n\
            Data: Bulanan Tetap 45%, Keinginan 80%, Tabungan 0%\n\
            Respons: \"Kondisi keuangan bulan ini secara umum terkendali, dengan pengeluaran Bulanan Tetap dan Keinginan berada di bawah batas plafon. Namun, belum ada dana yang dialokasikan ke Tabungan bulan ini, yang perlu menjadi prioritas mengingat target masih 0% tercapai. Disarankan untuk mulai mengalokasikan sebagian dari sisa anggaran yang belum terpakai ke Tabungan sebelum akhir bulan.\"\n\
            \n\
            Data: Bulanan Tetap 120%, Keinginan 60%, Tabungan 0%\n\
            Respons: \"Pengeluaran Bulanan Tetap bulan ini telah melampaui plafon anggaran sebesar 20%, yang menjadi prioritas utama untuk dievaluasi. Kondisi ini turut berdampak pada Tabungan yang belum terisi sama sekali. Disarankan untuk meninjau ulang pos pengeluaran Bulanan Tetap guna mengidentifikasi komponen yang dapat dikurangi, sehingga alokasi untuk Tabungan dapat mulai berjalan.\"\n\
            \n\
            Data: {}\n\
            Buat respons dengan struktur profesional yang sama seperti contoh di atas, sesuaikan dengan kondisi data yang diberikan.\n\
            Ingat: Tabungan 0% selalu merupakan area yang perlu perhatian, jangan pernah memujinya.",
            budget_json
        )
    };

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let req_body = OllamaRequest {
        model: active_model,
        prompt,
        stream: false,
        format: None,
    };

    let res = client
        .post(format!("{}/api/generate", OLLAMA_BASE_URL))
        .json(&req_body)
        .send()
        .map_err(|e| format!("Gagal terhubung ke Ollama (pastikan Ollama aktif): {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().unwrap_or_default();
        return Err(format!("Ollama API error ({}): {}", status, err_text));
    }

    let ollama_res: OllamaResponse = res
        .json()
        .map_err(|e| format!("Ollama parse error: {}", e))?;
    Ok(ollama_res.response)
}

pub fn get_ollama_models() -> Result<Vec<String>, String> {
    let _ = ensure_ollama_running();
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get(format!("{}/api/tags", OLLAMA_BASE_URL))
        .send()
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = res.json().map_err(|e| e.to_string())?;

    let mut models = Vec::new();
    if let Some(models_arr) = json.get("models").and_then(|m| m.as_array()) {
        for m in models_arr {
            if let Some(name) = m.get("name").and_then(|n| n.as_str()) {
                models.push(name.to_string());
            }
        }
    }
    Ok(models)
}
