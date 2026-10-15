import { useState, useEffect } from "react";
import { useTranslation } from "../useTranslation";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";

export function Settings(props: any) {
  const { showToast, openConfirm, closeConfirm } = props;
  const { t, language } = useTranslation();
  const { triggerRefresh, budgetStatus, setLanguage } = useStore();
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("qwen2.5:3b");
  const [income, setIncome] = useState<string>("");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("20:00");
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const fetchModels = async () => {
    setIsLoadingModels(true);
    try {
      const m = await invoke<string[]>("get_ollama_models");
      setModels(m);
      if (m.length > 0 && !m.includes(selectedModel)) {
        // Keep selected if present, else fallback
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    if (budgetStatus) {
      setIncome(budgetStatus.income.toString());
      setReminderEnabled(budgetStatus.reminder_enabled ?? false);
      setReminderTime(budgetStatus.reminder_time ?? "20:00");
    }
    fetchModels();
  }, [budgetStatus]);

  const handleSaveIncome = async () => {
    try {
      await invoke("set_monthly_income", { amount: parseInt(income, 10) });
      triggerRefresh();
      showToast(
        language === "id"
          ? "Pendapatan bulanan berhasil disimpan!"
          : "Monthly income successfully saved!",
        "success"
      );
    } catch (e) {
      showToast(
        language === "id"
          ? "Gagal menyimpan pendapatan: " + String(e)
          : "Failed to save income: " + String(e),
        "error"
      );
    }
  };

  const handleSelectModel = async (modelName: string) => {
    setSelectedModel(modelName);
    try {
      await invoke("set_ollama_model", { model: modelName });
      showToast(
        language === "id"
          ? `Model AI diperbarui ke "${modelName}".`
          : `AI Model updated to "${modelName}".`,
        "success"
      );
    } catch (e) {
      showToast(
        language === "id"
          ? "Gagal memperbarui model: " + String(e)
          : "Failed to update model: " + String(e),
        "error"
      );
    }
  };

  const handleSaveLanguage = async (newLang: string) => {
    try {
      await invoke("set_language", { language: newLang });
      setLanguage(newLang as "id" | "en");
      triggerRefresh();
      showToast(
        newLang === "id" ? "Bahasa diperbarui ke Indonesia!" : "Language updated to English!",
        "success"
      );
    } catch (e) {
      showToast(
        newLang === "id"
          ? "Gagal memperbarui bahasa: " + String(e)
          : "Failed to update language: " + String(e),
        "error"
      );
    }
  };

  const handleSaveReminder = async () => {
    try {
      await invoke("set_reminder_settings", { enabled: reminderEnabled, time: reminderTime });
      triggerRefresh();
      showToast(t("toast_saved"), "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const handleReset = () => {
    openConfirm({
      title: t("confirm_reset_title"),
      description: t("confirm_reset_desc"),
      confirmLabel: t("confirm_reset_yes"),
      confirmVariant: "danger",
      requireTyping: "RESET",
      onConfirm: async () => {
        closeConfirm();
        try {
          await invoke("reset_all_data");
          triggerRefresh();
          showToast(
            language === "id"
              ? "Semua data berhasil direset."
              : "All data successfully reset.",
            "info"
          );
        } catch (e) {
          showToast(
            language === "id"
              ? "Gagal mereset data: " + String(e)
              : "Failed to reset data: " + String(e),
            "error"
          );
        }
      },
    });
  };

  return (
    <div className="space-y-6 max-w-4xl pb-16">
      <h2 className="text-3xl font-bold text-primary mb-6">{t("set_title")}</h2>

      {/* Pendapatan Bulanan */}
      <section className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm border border-surface-container-high">
        <h3 className="font-bold text-base mb-1 text-on-surface">{t("set_monthly_income")}</h3>
        <p className="text-xs text-on-surface-variant mb-4">{t("set_income_desc")}</p>
        <div className="flex items-center gap-2 max-w-sm">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface-variant">
              Rp
            </span>
            <input
              type="number"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border rounded-xl bg-surface font-bold font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <button
            onClick={handleSaveIncome}
            className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold whitespace-nowrap hover:bg-primary-container hover:text-on-primary-container transition-colors shadow-sm"
          >
            {t("form_save")}
          </button>
        </div>
      </section>

      {/* Reminder Harian */}
      <section className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm border border-surface-container-high">
        <h3 className="font-bold text-base mb-1 text-on-surface">{t("set_reminder")}</h3>
        <p className="text-xs text-on-surface-variant mb-4">{t("set_reminder_desc")}</p>
        <div className="flex flex-col gap-4 max-w-sm">
          <label className="flex items-center gap-3 cursor-pointer p-3 bg-surface rounded-2xl border border-surface-container-high hover:border-primary/50 transition-colors">
            <input
              type="checkbox"
              checked={reminderEnabled}
              onChange={(e) => setReminderEnabled(e.target.checked)}
              className="w-5 h-5 rounded-md accent-primary"
            />
            <span className="font-bold text-sm text-on-surface">{t("set_reminder")}</span>
          </label>
          {reminderEnabled && (
            <div className="flex items-center gap-3 p-3 bg-surface rounded-2xl border border-surface-container-high">
              <span className="text-xs font-bold text-on-surface-variant">
                {t("set_reminder_time")}
              </span>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="p-2 border rounded-xl bg-surface-container text-sm font-bold font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 ml-auto"
              />
            </div>
          )}
          <button
            onClick={handleSaveReminder}
            className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold w-fit hover:bg-primary-container hover:text-on-primary-container transition-colors shadow-sm"
          >
            {t("form_save")}
          </button>
        </div>
      </section>

      {/* Bahasa: SEGMENTED TOGGLE */}
      <section className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm border border-surface-container-high">
        <h3 className="font-bold text-base mb-1 text-on-surface">{t("set_language")}</h3>
        <p className="text-xs text-on-surface-variant mb-4">
          {language === "id"
            ? "Pilih bahasa antarmuka aplikasi."
            : "Choose the application interface language."}
        </p>
        <div className="inline-flex p-1.5 bg-surface-container rounded-2xl border border-surface-container-high">
          <button
            type="button"
            onClick={() => handleSaveLanguage("id")}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
              language === "id"
                ? "bg-primary text-on-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span>🇮🇩</span>
            <span>Bahasa Indonesia</span>
          </button>
          <button
            type="button"
            onClick={() => handleSaveLanguage("en")}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
              language === "en"
                ? "bg-primary text-on-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span>🇬🇧</span>
            <span>English</span>
          </button>
        </div>
      </section>

      {/* Model Ollama: DAFTAR KARTU RADIO */}
      <section className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm border border-surface-container-high">
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-bold text-base text-on-surface">{t("set_ai_model")}</h3>
          <button
            type="button"
            onClick={fetchModels}
            className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
          >
            <span
              className={`material-symbols-rounded text-sm ${isLoadingModels ? "animate-spin" : ""}`}
            >
              sync
            </span>
            Refresh Models
          </button>
        </div>
        <p className="text-xs text-on-surface-variant mb-4">
          {language === "id"
            ? "Pilih model AI lokal yang aktif di Ollama untuk asisten chat dan saran keuangan."
            : "Select the active local Ollama AI model for chat assistant and financial insights."}
        </p>

        {models.length === 0 ? (
          <div className="p-6 rounded-2xl bg-surface-container border border-dashed border-surface-container-high text-center">
            <span className="material-symbols-rounded text-3xl text-on-surface-variant/50 mb-1">
              smart_toy
            </span>
            <p className="text-xs font-medium text-on-surface-variant">
              {isLoadingModels
                ? language === "id"
                  ? "Sedang memindai model Ollama lokal..."
                  : "Scanning local Ollama models..."
                : language === "id"
                ? "Tidak ada model ditemukan. Pastikan Ollama berjalan di http://localhost:11434."
                : "No models found. Make sure Ollama is running at http://localhost:11434."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {models.map((m) => {
              const isSelected = selectedModel === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleSelectModel(m)}
                  className={`p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${
                    isSelected
                      ? "bg-primary/5 border-2 border-primary shadow-sm scale-[1.01]"
                      : "bg-surface-container hover:bg-surface-container-high border-surface-container-high"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        isSelected
                          ? "bg-primary text-on-primary"
                          : "bg-surface text-on-surface-variant"
                      }`}
                    >
                      <span className="material-symbols-rounded text-lg">smart_toy</span>
                    </div>
                    <div>
                      <p className="font-bold text-sm text-on-surface">{m}</p>
                      <p className="text-[11px] text-on-surface-variant">Ollama Local</p>
                    </div>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected ? "border-primary bg-primary" : "border-surface-container-high"
                    }`}
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Danger Zone */}
      <section className="bg-red-50 p-6 rounded-3xl shadow-sm border border-red-200 mt-12">
        <h3 className="font-bold text-red-600 mb-2">{t("set_danger_zone")}</h3>
        <p className="text-sm text-red-500 mb-4">{t("set_reset_desc")}</p>
        <button
          onClick={handleReset}
          className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm"
        >
          {t("set_reset_data")}
        </button>
      </section>
    </div>
  );
}
