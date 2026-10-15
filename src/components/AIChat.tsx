import React, { useState, useEffect } from "react";
import { useTranslation } from "../useTranslation";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";

export function AIChat({ showToast }: { showToast: (m: string, v?: "success" | "error" | "warning") => void }) {
  const { t } = useTranslation();
  const [ollamaReady, setOllamaReady] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ sender: "user" | "ai"; text: string; parsed?: any }[]>([]);
  const [loading, setLoading] = useState(false);
  const { categories, triggerRefresh, accounts, savingGoals } = useStore();

  useEffect(() => {
    invoke<boolean>("check_ollama")
      .then((res) => setOllamaReady(res))
      .catch(() => setOllamaReady(false));
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userText = input;
    setMessages((prev) => [...prev, { sender: "user", text: userText }]);
    setInput("");
    setLoading(true);

    try {
      const today = new Date().toISOString().split("T")[0];
      const parsed = await invoke<any>("parse_transaction_intent", { text: userText, todayDate: today });

      const isSavings = Boolean(
        parsed.is_savings_deposit ||
        parsed.category_guess?.toLowerCase().includes("tabung") ||
        userText.toLowerCase().includes("nabung") ||
        userText.toLowerCase().includes("tabungan")
      );

      if (isSavings) {
        // Daily accounts only
        const dailyAccounts = accounts.filter((a) => !a.is_savings && !a.is_archived);
        let matchedAccount = null;
        if (parsed.account_guess) {
          const guessAcc = parsed.account_guess.toLowerCase();
          matchedAccount = dailyAccounts.find(
            (a) => a.name.toLowerCase().includes(guessAcc) || guessAcc.includes(a.name.toLowerCase())
          );
        }
        if (!matchedAccount && dailyAccounts.length === 1) {
          matchedAccount = dailyAccounts[0];
        }

        // Match goal
        let matchedGoal = null;
        if (parsed.goal_guess) {
          const guessGoal = parsed.goal_guess.toLowerCase();
          matchedGoal = savingGoals.find(
            (g) => g.name.toLowerCase().includes(guessGoal) || guessGoal.includes(g.name.toLowerCase())
          );
        }
        if (!matchedGoal && savingGoals.length === 1) {
          matchedGoal = savingGoals[0];
        }

        const parsedWithSavings = {
          ...parsed,
          is_savings_deposit: true,
          account_id: matchedAccount ? matchedAccount.id : null,
          account_name: matchedAccount ? matchedAccount.name : null,
          saving_goal_id: matchedGoal ? matchedGoal.id : null,
          saving_goal_name: matchedGoal ? matchedGoal.name : null,
          note: parsed.note || (matchedGoal ? `Nabung → ${matchedGoal.name}` : "Setor Tabungan"),
        };

        setMessages((prev) => [
          ...prev,
          { sender: "ai", text: "Saya mendeteksi setoran tabungan. Mohon konfirmasi rinciannya:", parsed: parsedWithSavings },
        ]);
      } else {
        // Standard expense / income
        const guessed = (parsed.category_guess || "").toLowerCase();
        const matchedCat = categories.find(
          (c) => c.name.toLowerCase().includes(guessed) || guessed.includes(c.name.toLowerCase())
        );

        let matchedAccount = null;
        if (parsed.account_guess) {
          const guessAcc = parsed.account_guess.toLowerCase();
          matchedAccount = accounts.find(
            (a) => !a.is_archived && (a.name.toLowerCase().includes(guessAcc) || guessAcc.includes(a.name.toLowerCase()))
          );
        }
        if (!matchedAccount) {
          matchedAccount = accounts.find((a) => a.is_default && !a.is_archived) || accounts.find((a) => !a.is_archived) || null;
        }

        const parsedWithId = {
          ...parsed,
          is_savings_deposit: false,
          category_id: matchedCat ? matchedCat.id : categories[0]?.id || 1,
          category_name: matchedCat ? matchedCat.name : categories[0]?.name,
          account_id: matchedAccount ? matchedAccount.id : null,
          account_name: matchedAccount ? matchedAccount.name : null,
        };

        setMessages((prev) => [
          ...prev,
          { sender: "ai", text: "Berikut hasil analisis transaksi. Mohon periksa & konfirmasi:", parsed: parsedWithId },
        ]);
      }
    } catch (e) {
      setMessages((prev) => [...prev, { sender: "ai", text: `Error: ${String(e)}` }]);
    } finally {
      setLoading(false);
    }
  };

  const confirmTransaction = async (parsed: any, msgIndex: number) => {
    try {
      await invoke("create_transaction", {
        amount: parsed.amount,
        transactionType: parsed.type,
        categoryId: parsed.category_id,
        note: parsed.note || parsed.category_guess,
        transactionDate: parsed.date,
        source: "ai_chat",
        accountId: parsed.account_id || null,
      });
      triggerRefresh();
      showToast(t("ai_saved") || "Transaksi disimpan!", "success");
      setMessages((prev) => {
        const next = [...prev];
        next[msgIndex].text = "✓ " + (t("ai_saved") || "Transaksi berhasil disimpan!");
        next[msgIndex].parsed = undefined;
        return next;
      });
    } catch (e) {
      showToast("Gagal menyimpan transaksi: " + e, "error");
    }
  };

  const confirmSavingsDeposit = async (parsed: any, msgIndex: number) => {
    if (!parsed.account_id) {
      showToast("Pilih akun asal (Harian) terlebih dahulu.", "warning");
      return;
    }
    if (!parsed.saving_goal_id) {
      showToast("Pilih target goal tujuan terlebih dahulu.", "warning");
      return;
    }

    const targetGoal = savingGoals.find((g) => g.id === parsed.saving_goal_id);
    if (!targetGoal || !targetGoal.account_id) {
      showToast("Target goal belum terhubung ke Akun Tabungan.", "error");
      return;
    }

    try {
      await invoke("create_transfer", {
        fromAccountId: parsed.account_id,
        toAccountId: targetGoal.account_id,
        amount: parsed.amount,
        transferDate: parsed.date,
        note: parsed.note || `Nabung → ${targetGoal.name}`,
        savingGoalId: parsed.saving_goal_id,
      });
      triggerRefresh();
      showToast("Setoran tabungan berhasil disimpan!", "success");
      setMessages((prev) => {
        const next = [...prev];
        next[msgIndex].text = `✓ Berhasil menabung Rp ${parsed.amount.toLocaleString("id-ID")} ke ${targetGoal.name}!`;
        next[msgIndex].parsed = undefined;
        return next;
      });
    } catch (e) {
      showToast("Gagal menabung: " + e, "error");
    }
  };

  if (ollamaReady === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <h2 className="text-2xl font-bold text-red-500 mb-4">Fitur AI Tidak Aktif</h2>
        <p className="text-on-surface-variant">Pastikan Ollama berjalan di localhost:11434</p>
      </div>
    );
  }

  const dailyAccounts = accounts.filter((a) => !a.is_savings && !a.is_archived);

  return (
    <div className="flex flex-col h-full bg-surface-container-lowest rounded-3xl shadow-sm border border-surface-container-high overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
            <div className="w-14 h-14 rounded-3xl bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-rounded text-3xl">smart_toy</span>
            </div>
            <h3 className="text-base font-bold text-on-surface">Asisten AI Fintel</h3>
            <p className="text-xs text-on-surface-variant max-w-sm">
              Tulis transaksi atau setoran tabungan secara alami. Misalnya: <br />
              <span className="italic text-primary">"Nabung 100rb buat Dana Darurat"</span> atau{" "}
              <span className="italic text-primary">"Makan siang bakso 35rb dari BCA"</span>
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-3xl p-5 ${
                m.sender === "user"
                  ? "bg-primary text-on-primary rounded-tr-xs shadow-xs"
                  : "bg-surface-container-low text-on-surface rounded-tl-xs border border-surface-container-high"
              }`}
            >
              <p className="text-sm font-medium">{m.text}</p>

              {m.parsed && (
                <div className="mt-4 p-4 bg-surface rounded-2xl shadow-xs border border-surface-container-high text-on-surface space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-surface-container-high">
                    <span
                      className={`material-symbols-rounded text-lg ${
                        m.parsed.is_savings_deposit ? "text-indigo-600" : "text-primary"
                      }`}
                    >
                      {m.parsed.is_savings_deposit ? "savings" : "check_circle"}
                    </span>
                    <h4 className="font-bold text-xs uppercase tracking-wider">
                      {m.parsed.is_savings_deposit ? "Konfirmasi Setor Tabungan" : "Konfirmasi Transaksi"}
                    </h4>
                  </div>

                  <div className="space-y-3 text-xs">
                    {/* Amount */}
                    <div>
                      <span className="block font-bold text-on-surface-variant uppercase tracking-wider text-[10px] mb-1">
                        Nominal
                      </span>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-on-surface-variant text-xs">
                          Rp
                        </span>
                        <input
                          type="number"
                          value={m.parsed.amount}
                          onChange={(e) => {
                            const next = [...messages];
                            next[i].parsed.amount = Number(e.target.value);
                            setMessages(next);
                          }}
                          className="w-full pl-9 pr-3 py-2 rounded-xl border border-surface-container-high bg-surface-container/30 font-black font-mono text-sm text-on-surface"
                        />
                      </div>
                    </div>

                    {/* Savings Deposit Specific Chips */}
                    {m.parsed.is_savings_deposit ? (
                      <>
                        {/* Akun Sumber (Harian) Chips */}
                        <div>
                          <span className="block font-bold text-on-surface-variant uppercase tracking-wider text-[10px] mb-1.5">
                            Dari Akun Harian:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {dailyAccounts.map((acc) => {
                              const isSelected = m.parsed.account_id === acc.id;
                              return (
                                <button
                                  key={acc.id}
                                  type="button"
                                  onClick={() => {
                                    const next = [...messages];
                                    next[i].parsed.account_id = acc.id;
                                    next[i].parsed.account_name = acc.name;
                                    setMessages(next);
                                  }}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                    isSelected
                                      ? "bg-indigo-600 text-white shadow-xs"
                                      : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                                  }`}
                                >
                                  <span className="material-symbols-rounded text-xs">
                                    {acc.icon || "account_balance"}
                                  </span>
                                  <span>{acc.name}</span>
                                </button>
                              );
                            })}
                          </div>
                          {!m.parsed.account_id && (
                            <p className="text-[10px] text-amber-600 mt-1 font-medium">
                              * Pilih salah satu akun harian di atas
                            </p>
                          )}
                        </div>

                        {/* Target Goal Chips */}
                        <div>
                          <span className="block font-bold text-on-surface-variant uppercase tracking-wider text-[10px] mb-1.5">
                            Target Goal Tujuan:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {savingGoals.map((goal) => {
                              const isSelected = m.parsed.saving_goal_id === goal.id;
                              return (
                                <button
                                  key={goal.id}
                                  type="button"
                                  onClick={() => {
                                    const next = [...messages];
                                    next[i].parsed.saving_goal_id = goal.id;
                                    next[i].parsed.saving_goal_name = goal.name;
                                    setMessages(next);
                                  }}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                    isSelected
                                      ? "bg-blue-600 text-white shadow-xs"
                                      : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                                  }`}
                                >
                                  <span className="material-symbols-rounded text-xs">flag</span>
                                  <span>{goal.name}</span>
                                  <span className="text-[10px] opacity-80 font-normal">
                                    ({goal.account_name || "Tabungan"})
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {!m.parsed.saving_goal_id && (
                            <p className="text-[10px] text-amber-600 mt-1 font-medium">
                              * Pilih salah satu target goal di atas
                            </p>
                          )}
                        </div>
                      </>
                    ) : (
                      /* Standard Transaction (Chips - Tanpa Dropdown) */
                      <>
                        {/* Type Segmented Chips */}
                        <div>
                          <span className="block font-bold text-on-surface-variant uppercase tracking-wider text-[10px] mb-1.5">
                            Tipe
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...messages];
                                next[i].parsed.type = "expense";
                                setMessages(next);
                              }}
                              className={`flex-1 py-1.5 rounded-xl font-bold text-xs transition-all ${
                                m.parsed.type === "expense"
                                  ? "bg-rose-600 text-white shadow-xs"
                                  : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                              }`}
                            >
                              Pengeluaran
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...messages];
                                next[i].parsed.type = "income";
                                setMessages(next);
                              }}
                              className={`flex-1 py-1.5 rounded-xl font-bold text-xs transition-all ${
                                m.parsed.type === "income"
                                  ? "bg-emerald-600 text-white shadow-xs"
                                  : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                              }`}
                            >
                              Pemasukan
                            </button>
                          </div>
                        </div>

                        {/* Category Chips */}
                        <div>
                          <span className="block font-bold text-on-surface-variant uppercase tracking-wider text-[10px] mb-1.5">
                            Kategori
                          </span>
                          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 bg-surface-container/30 rounded-xl">
                            {categories
                              .filter((c) => c.transaction_type === m.parsed.type)
                              .map((cat) => {
                                const isSelected = m.parsed.category_id === cat.id;
                                return (
                                  <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => {
                                      const next = [...messages];
                                      next[i].parsed.category_id = cat.id;
                                      next[i].parsed.category_name = cat.name;
                                      setMessages(next);
                                    }}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                                      isSelected
                                        ? "bg-primary text-on-primary shadow-xs"
                                        : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                                    }`}
                                  >
                                    {cat.name}
                                  </button>
                                );
                              })}
                          </div>
                        </div>

                        {/* Account Chips */}
                        {accounts.length > 0 && (
                          <div>
                            <span className="block font-bold text-on-surface-variant uppercase tracking-wider text-[10px] mb-1.5">
                              Akun
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {accounts
                                .filter((a) => !a.is_archived || a.id === m.parsed.account_id)
                                .map((acc) => {
                                  const isSelected = m.parsed.account_id === acc.id;
                                  return (
                                    <button
                                      key={acc.id}
                                      type="button"
                                      onClick={() => {
                                        const next = [...messages];
                                        next[i].parsed.account_id = acc.id;
                                        next[i].parsed.account_name = acc.name;
                                        setMessages(next);
                                      }}
                                      className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                                        isSelected
                                          ? "bg-teal-700 text-white shadow-xs"
                                          : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                                      }`}
                                    >
                                      <span className="material-symbols-rounded text-xs">
                                        {acc.icon || "account_balance"}
                                      </span>
                                      <span>{acc.name}</span>
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Note & Date */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <span className="block font-bold text-on-surface-variant uppercase tracking-wider text-[10px] mb-1">
                          Catatan
                        </span>
                        <input
                          type="text"
                          value={m.parsed.note || ""}
                          onChange={(e) => {
                            const next = [...messages];
                            next[i].parsed.note = e.target.value;
                            setMessages(next);
                          }}
                          className="w-full px-3 py-1.5 rounded-xl border border-surface-container-high bg-surface-container/30 text-xs text-on-surface"
                        />
                      </div>
                      <div>
                        <span className="block font-bold text-on-surface-variant uppercase tracking-wider text-[10px] mb-1">
                          Tanggal
                        </span>
                        <input
                          type="date"
                          value={m.parsed.date}
                          onChange={(e) => {
                            const next = [...messages];
                            next[i].parsed.date = e.target.value;
                            setMessages(next);
                          }}
                          className="w-full px-3 py-1.5 rounded-xl border border-surface-container-high bg-surface-container/30 text-xs text-on-surface"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2 border-t border-surface-container-high">
                    <button
                      type="button"
                      onClick={() => {
                        if (m.parsed.is_savings_deposit) {
                          confirmSavingsDeposit(m.parsed, i);
                        } else {
                          confirmTransaction(m.parsed, i);
                        }
                      }}
                      className="flex-1 bg-primary text-on-primary py-2 rounded-xl font-bold text-xs hover:bg-primary-container hover:text-on-primary-container shadow-xs active:scale-95 transition-all"
                    >
                      {m.parsed.is_savings_deposit ? "Simpan Setoran" : "Simpan Transaksi"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...messages];
                        next[i].text = "❌ Dibatalkan";
                        next[i].parsed = undefined;
                        setMessages(next);
                      }}
                      className="px-4 bg-surface-container hover:bg-surface-container-high text-on-surface py-2 rounded-xl font-bold text-xs transition-colors"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant animate-pulse">
            <span className="material-symbols-rounded animate-spin text-sm">sync</span>
            Ollama sedang berpikir...
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-surface-container-high bg-surface flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Contoh: Nabung 100rb buat Dana Darurat, atau Beli kopi 30rb..."
          className="flex-1 px-4 py-3 rounded-full bg-surface-container border-none outline-none focus:ring-2 focus:ring-primary text-xs font-medium"
          disabled={!ollamaReady}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="px-6 py-3 bg-primary text-on-primary rounded-full font-bold text-xs hover:bg-primary-container hover:text-on-primary-container shadow-xs active:scale-95 transition-all disabled:opacity-50"
        >
          {t("ai_send")}
        </button>
      </form>
    </div>
  );
}
