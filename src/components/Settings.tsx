import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { ToastVariant } from "./Toast";

// Props yang diteruskan dari App.tsx supaya Settings bisa pakai toast & modal global
interface SettingsProps {
  showToast: (message: string, variant?: ToastVariant, duration?: number) => number;
  openConfirm: (opts: Omit<{ isOpen: boolean; title: string; description?: string; confirmLabel?: string; confirmVariant?: "danger" | "primary"; requireTyping?: string; onConfirm: () => void }, "isOpen">) => void;
  closeConfirm: () => void;
}

export function Settings({ showToast, openConfirm, closeConfirm }: SettingsProps) {
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
      showToast("Pendapatan bulanan berhasil disimpan! 💰", "success");
    } catch (e) {
      showToast("Gagal menyimpan pendapatan: " + String(e), "error");
    }
  };

  const handleSaveModel = async () => {
    try {
      await invoke("set_ollama_model", { model: selectedModel });
      showToast(`Model AI diperbarui ke "${selectedModel}". ✨`, "success");
    } catch (e) {
      showToast("Gagal memperbarui model: " + String(e), "error");
    }
  };

  const handleReset = () => {
    openConfirm({
      title: "Reset semua data?",
      description:
        "Tindakan ini akan menghapus SELURUH data transaksi, riwayat, dan target tabungan Anda secara permanen. Ini tidak bisa dibatalkan.",
      confirmLabel: "Ya, Reset Sekarang",
      confirmVariant: "danger",
      requireTyping: "RESET",
      onConfirm: async () => {
        closeConfirm();
        try {
          await invoke("reset_all_data");
          triggerRefresh();
          showToast("Semua data berhasil direset.", "info");
        } catch (e) {
          showToast("Gagal mereset data: " + String(e), "error");
        }
      },
    });
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
        <p className="text-sm text-red-500 mb-4">
          Tindakan ini akan menghapus seluruh data transaksi Anda secara permanen. Tidak dapat dibatalkan.
        </p>
        <button
          onClick={handleReset}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors"
        >
          Reset Semua Data
        </button>
      </section>
    </div>
  );
}
