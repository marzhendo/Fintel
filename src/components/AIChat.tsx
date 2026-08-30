import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";

export function AIChat() {
  const [ollamaReady, setOllamaReady] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{sender: "user" | "ai", text: string, parsed?: any}[]>([]);
  const [loading, setLoading] = useState(false);
  const { categories, triggerRefresh } = useStore();

  useEffect(() => {
    invoke<boolean>("check_ollama").then(res => setOllamaReady(res)).catch(() => setOllamaReady(false));
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userText = input;
    setMessages(prev => [...prev, { sender: "user", text: userText }]);
    setInput("");
    setLoading(true);

    try {
      const today = new Date().toISOString().split("T")[0];
      const parsed = await invoke<any>("parse_transaction_intent", { text: userText, todayDate: today });
      
      // Try to find the actual category id by fuzzy matching
      const guessed = parsed.category_guess.toLowerCase();
      const matchedCat = categories.find(c => c.name.toLowerCase().includes(guessed) || guessed.includes(c.name.toLowerCase()));
      
      const parsedWithId = {
        ...parsed,
        category_id: matchedCat ? matchedCat.id : (categories[0]?.id || 1),
        category_name: matchedCat ? matchedCat.name : categories[0]?.name
      };

      setMessages(prev => [...prev, { sender: "ai", text: "Here is what I found:", parsed: parsedWithId }]);
    } catch (e) {
      setMessages(prev => [...prev, { sender: "ai", text: `Error: ${String(e)}` }]);
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
        note: `AI: ${parsed.category_guess}`,
        transactionDate: parsed.date,
        source: "ai_chat"
      });
      triggerRefresh();
      setMessages(prev => {
        const next = [...prev];
        next[msgIndex].text = "? Transaction saved!";
        next[msgIndex].parsed = undefined;
        return next;
      });
    } catch(e) {
      alert("Failed to save: " + e);
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

  return (
    <div className="flex flex-col h-full bg-surface-container-lowest rounded-xl shadow-md overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[70%] rounded-2xl p-4 ${m.sender === "user" ? "bg-primary text-on-primary rounded-tr-none" : "bg-surface-container text-on-surface rounded-tl-none"}`}>
              <p>{m.text}</p>
              {m.parsed && (
                <div className="mt-4 p-4 bg-white rounded-xl shadow-sm text-black border border-gray-200">
                  <h4 className="font-bold text-sm mb-2 border-b pb-2">Konfirmasi Transaksi</h4>
                  <div className="text-sm space-y-1 mb-4">
                    <p><span className="text-gray-500 w-20 inline-block">Amount:</span> Rp {m.parsed.amount.toLocaleString()}</p>
                    <p><span className="text-gray-500 w-20 inline-block">Type:</span> <span className={m.parsed.type === "income" ? "text-green-600 font-bold" : "text-red-600 font-bold"}>{m.parsed.type}</span></p>
                    <p><span className="text-gray-500 w-20 inline-block">Category:</span> {m.parsed.category_name}</p>
                    <p><span className="text-gray-500 w-20 inline-block">Date:</span> {m.parsed.date}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => confirmTransaction(m.parsed, i)} className="flex-1 bg-primary text-on-primary py-2 rounded-lg font-bold text-sm">Simpan</button>
                    <button onClick={() => {
                        const next = [...messages];
                        next[i].text = "? Dibatalkan";
                        next[i].parsed = undefined;
                        setMessages(next);
                    }} className="flex-1 bg-surface-container-high text-on-surface py-2 rounded-lg font-bold text-sm">Batal</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="text-on-surface-variant animate-pulse">Ollama sedang berpikir...</div>}
      </div>
      <form onSubmit={handleSend} className="p-4 border-t border-surface-container-high bg-surface flex gap-2">
        <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Contoh: Beli kopi 50rb tadi siang..." className="flex-1 px-4 py-3 rounded-full bg-surface-container border-none outline-none focus:ring-2 focus:ring-primary" disabled={!ollamaReady} />
        <button type="submit" disabled={!input.trim() || loading} className="px-6 py-3 bg-primary text-on-primary rounded-full font-bold disabled:opacity-50">Kirim</button>
      </form>
    </div>
  );
}


