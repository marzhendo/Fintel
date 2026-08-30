use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize, Deserialize, Debug)]
pub struct ParsedTransaction {
    pub amount: i64,
    pub r#type: String, // "income" or "expense"
    pub category_guess: String,
    pub date: String,
    pub confidence: String,
}

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
    format: String,
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: String,
}

pub fn check_ollama_health() -> bool {
    let client = Client::builder().timeout(Duration::from_secs(2)).build().unwrap();
    match client.get("http://localhost:11434/api/tags").send() {
        Ok(res) => res.status().is_success(),
        Err(_) => false,
    }
}

pub fn parse_transaction_intent(
    text: &str,
    model: &str,
    categories: &[String],
    today_date: &str,
) -> Result<ParsedTransaction, String> {
    let categories_list = categories.join(", ");
    let prompt = format!(
        "Kamu adalah asisten keuangan yang sangat akurat. Ekstrak informasi dari kalimat user \
        menjadi JSON valid dengan schema PERSIS berikut, tanpa teks tambahan apapun:\n\
        {{\"amount\": number, \"type\": \"income\"|\"expense\", \"category_guess\": string, \
        \"date\": \"YYYY-MM-DD\", \"confidence\": \"high\"|\"medium\"|\"low\"}}\n\
        Aturan Penting:\n\
        1. Amount: Ubah singkatan gaul jadi angka penuh. 'rb'/'k'/'ribu' = kalikan 1.000. 'jt'/'juta' = kalikan 1.000.000. Contoh: '8rb' -> 8000. '50k' -> 50000. '1.5jt' -> 1500000.\n\
        2. Kategori: Pilih satu dari daftar ini yang Paling Relevan secara semantik (misal 'rames'/'kopi' -> Makan/Nongkrong): [{}].\n\
        3. Tanggal default hari ini jika tidak disebutkan: {}.\n\n\
        Teks user: \"{}\"",
        categories_list, today_date, text
    );

    let client = Client::new();
    let req_body = OllamaRequest {
        model: model.to_string(),
        prompt,
        stream: false,
        format: "json".to_string(),
    };

    let res = client
        .post("http://localhost:11434/api/generate")
        .json(&req_body)
        .send()
        .map_err(|e| format!("Ollama connection error: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Ollama API error: {}", res.status()));
    }

    let ollama_res: OllamaResponse = res.json().map_err(|e| format!("Ollama JSON parse error: {}", e))?;
    let parsed: ParsedTransaction = serde_json::from_str(&ollama_res.response)
        .map_err(|e| format!("Invalid JSON from model: {} - Raw: {}", e, ollama_res.response))?;

    Ok(parsed)
}

pub fn generate_insight(
    budget_json: &str,
    model: &str,
) -> Result<String, String> {
    let prompt = format!(
        "Kamu adalah asisten keuangan personal di app \"Fintel\". User kamu kebanyakan \
        mahasiswa/anak muda. Gaya bahasamu SANTAI dan AKRAB kayak lagi ngobrol sama \
        temen deket — boleh pakai \"lo/gue\", boleh pakai bahasa gaul ringan, JANGAN \
        formal atau kaku kayak laporan keuangan bank.\n\
        \n\
        ATURAN:\n\
        - Jangan ulang-ulang kata yang sama dalam 1 respons (mis. jangan sebut \
          \"pengeluaran realita\" berkali-kali, variasikan kalimat).\n\
        - Gunakan angka yang diberikan APA ADANYA, jangan menghitung ulang sendiri.\n\
        - Respons maksimal 3-4 kalimat total, gabung ringkasan dan saran jadi satu \
          narasi mengalir (jangan pisah \"Ringkasan:\" dan \"Saran:\" sebagai 2 section \
          terpisah kayak laporan).\n\
        - Kalau semua kategori masih sehat/di bawah budget, kasih apresiasi santai, \
          jangan cuma kasih peringatan melulu.\n\
        \n\
        CONTOH GAYA YANG DIINGINKAN (few-shot):\n\
        \n\
        Data: Needs terpakai 80% dari ideal, Wants 45%, Savings 0%\n\
        Respons yang BENAR: \"Nice, pengeluaran kebutuhan pokok lo masih aman di 80% \
        dari budget. Tapi tabungan lo masih Rp 0 nih bulan ini — coba sisihin dikit \
        dari sisa uang jajan lo, biar gak cuma numpang lewat doang tuh duit.\"\n\
        \n\
        Data: Needs terpakai 120%, Wants 60%, Savings 0%\n\
        Respons yang BENAR: \"Waduh, kebutuhan pokok lo udah kebablasan 20% dari \
        budget bulan ini. Coba cek lagi pengeluaran mana yang bisa dipangkas, terus \
        sisanya usahain nyisa buat nabung — sekarang tabungan lo masih kosong soalnya.\"\n\
        \n\
        Data: {}\n\
        Buat respons dengan gaya yang sama seperti contoh di atas, dalam Bahasa \
        Indonesia santai.",
        budget_json
    );

    let client = Client::new();
    let req_body = OllamaRequest {
        model: model.to_string(),
        prompt,
        stream: false,
        format: "".to_string(), // normal text
    };

    let res = client
        .post("http://localhost:11434/api/generate")
        .json(&req_body)
        .send()
        .map_err(|e| format!("Ollama connection error: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Ollama API error: {}", res.status()));
    }

    let ollama_res: OllamaResponse = res.json().map_err(|e| format!("Ollama parse error: {}", e))?;
    Ok(ollama_res.response)
}


pub fn get_ollama_models() -> Result<Vec<String>, String> {
    let client = reqwest::blocking::Client::new();
    let res = client.get("http://localhost:11434/api/tags").send().map_err(|e| e.to_string())?;
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

