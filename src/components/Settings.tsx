import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";

export function Settings() {
  const { triggerRefresh, budgetStatus } = useStore();
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("llama3.2:3b");
  const [income, setIncome] = useState<string>("");

  useEffect(() => {
    if (budgetStatus) setIncome(budgetStatus.income.toString());
    invoke<string[]>("get_ollama_models").then(setModels).catch(console.error);
    // Ideally get current model from backend, assuming default or need to fetch
  }, [budgetStatus]);

  const handleSaveIncome = async () => {
    try {
      await invoke("set_monthly_income", { amount: parseInt(income) });
      triggerRefresh();
      alert("Income updated!");
    } catch (e) { alert(String(e)); }
  };

  const handleSaveModel = async () => {
    try {
      await invoke("set_ollama_model", { model: selectedModel });
      alert("Model updated!");
    } catch (e) { alert(String(e)); }
  };

  const handleReset = async () => {
    const confirmation = prompt("Ketik 'RESET' untuk menghapus semua data transaksi dan mereset tabungan:");
    if (confirmation === "RESET") {
      try {
        await invoke("reset_all_data");
        triggerRefresh();
        alert("Semua data berhasil direset!");
      } catch (e) { alert(String(e)); }
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-primary mb-6">Settings</h2>
      
      <section className="bg-surface-container-lowest p-6 rounded-xl shadow-md border border-surface-container-high">
        <h3 className="font-bold mb-4">Set Monthly Income</h3>
        <div className="flex items-center gap-2 max-w-sm">
          <input type="number" value={income} onChange={e => setIncome(e.target.value)} className="w-full p-2 border rounded-lg bg-surface" />
          <button onClick={handleSaveIncome} className="px-4 py-2 bg-primary text-on-primary rounded-lg font-bold whitespace-nowrap">Save</button>
        </div>
      </section>

      <section className="bg-surface-container-lowest p-6 rounded-xl shadow-md border border-surface-container-high">
        <h3 className="font-bold mb-4">AI Model (Ollama)</h3>
        <div className="flex items-center gap-2 max-w-sm">
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="w-full p-2 border rounded-lg bg-surface">
            {models.length > 0 ? models.map(m => <option key={m} value={m}>{m}</option>) : <option>Loading models...</option>}
          </select>
          <button onClick={handleSaveModel} className="px-4 py-2 bg-primary text-on-primary rounded-lg font-bold whitespace-nowrap">Save</button>
        </div>
      </section>

      <section className="bg-red-50 p-6 rounded-xl shadow-md border border-red-200 mt-12">
        <h3 className="font-bold text-red-600 mb-2">Danger Zone</h3>
        <p className="text-sm text-red-500 mb-4">Tindakan ini akan menghapus seluruh data transaksi Anda secara permanen. Tidak dapat dibatalkan.</p>
        <button onClick={handleReset} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold">Reset Semua Data</button>
      </section>
    </div>
  );
}

