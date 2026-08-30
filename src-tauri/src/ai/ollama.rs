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
        "Kamu adalah asisten keuangan personal di app \"Fintel\". User kamu mahasiswa/\n\
        anak muda. Gaya bahasa SANTAI dan AKRAB kayak ngobrol sama temen deket.\n\
        \n\
        ATURAN PENTING:\n\
        - Pakai \"lo/gue\" secukupnya dan di tempat yang natural - JANGAN taruh \"lo\"\n\
          atau \"loh\" di akhir kalimat sebagai filler tanpa fungsi gramatikal yang\n\
          jelas. Contoh SALAH: \"budget lo, lo!\" atau \"33%, loh.\" tanpa konteks jelas.\n\
          Contoh BENAR: \"budget lo masih aman nih\" (natural, \"lo\" sebagai kata ganti\n\
          yang jelas fungsinya).\n\
        - Tone HARUS sesuai data: kalau semua kategori sehat/di bawah budget dan\n\
          savings goal tercapai, buka dengan nada POSITIF/APRESIATIF (mis. \"Mantap\",\n\
          \"Nice\", \"Solid\"), JANGAN pakai \"Waduh\" atau kata yang berkonotasi negatif.\n\
        - Kalau savings SUDAH mencapai atau melebihi 100% dari target ideal, JANGAN\n\
          menyuruh user menabung lebih banyak lagi - apresiasi pencapaian itu, dan\n\
          fokuskan saran ke hal lain (mis. pertahankan kebiasaan, atau kalau semua\n\
          aspek sudah baik, cukup kasih pujian tanpa memaksakan saran tambahan).\n\
        - Gunakan angka yang diberikan APA ADANYA, jangan menghitung ulang sendiri.\n\
        - Respons maksimal 3-4 kalimat, gabung jadi 1 narasi mengalir, jangan\n\
          dipisah jadi section \"Ringkasan:\" dan \"Saran:\".\n\
        \n\
        CONTOH GAYA YANG DIINGINKAN (few-shot):\n\
        \n\
        Data: Needs 80%, Wants 45%, Savings 0%\n\
        Respons: \"Nice, pengeluaran kebutuhan pokok kamu masih aman di 80% dari \n\
        budget. Tapi tabungan masih Rp0 nih bulan ini - coba sisihin dikit dari sisa \n\
        uang jajan, biar gak cuma numpang lewat doang tuh duit.\"\n\
        \n\
        Data: Needs 120%, Wants 60%, Savings 0%\n\
        Respons: \"Waduh, kebutuhan pokok udah kebablasan 20% dari budget bulan ini. \n\
        Coba cek lagi pengeluaran mana yang bisa dipangkas, terus sisanya usahain \n\
        nyisa buat nabung - sekarang tabungan masih kosong soalnya.\"\n\
        \n\
        Data: Needs 3%, Wants 33%, Savings 100% (target tercapai)\n\
        Respons: \"Mantap banget nih bulan ini! Kebutuhan pokok kamu jauh di bawah \n\
        budget, keinginan juga masih terkontrol di 33%, dan yang paling keren - \n\
        target tabungan kamu udah tercapai 100%. Pertahankan pola kayak gini terus.\"\n\
        \n\
        Data: {}\n\
        Buat respons dengan gaya yang sama seperti contoh di atas, sesuaikan tone \n\
        dengan kondisi data yang diberikan (positif untuk data bagus, waspada untuk \n\
        data yang perlu perhatian), dalam Bahasa Indonesia santai dan natural.",
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

