import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore, Transaction, BalanceResult, Category } from "./store";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AIChat } from "./components/AIChat";
import { Settings } from "./components/Settings";
import "./App.css";

function App() {
  const { categories, transactions, balance, budgetStatus, savingGoals, setCategories, setTransactions, setBalance, setBudgetStatus, setSavingGoals, refreshFlag, fintelAdvice, setFintelAdvice } = useStore();
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ amount: "", type: "expense", category_id: "", note: "", date: "", saving_goal_id: "" });
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  
  const [toastMessage, setToastMessage] = useState("");
  

  const [chartData, setChartData] = useState<any[]>([]);
  const [chartPeriod, setChartPeriod] = useState<"daily" | "monthly">("daily");

  const fetchData = async () => {
    try {
      const cats = await invoke<Category[]>("get_categories");
      setCategories(cats);
      
      const typeFilterParam = filterType === "all" ? null : filterType;
      const txs = await invoke<Transaction[]>("list_transactions", { dateFilter: null, typeFilter: typeFilterParam, categoryIdFilter: null, startDate: filterStartDate || null, endDate: filterEndDate || null });
      setTransactions(txs);
      const goals = await invoke<any[]>('list_saving_goals');
      setSavingGoals(goals);

      const d = new Date();
      const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bal = await invoke<BalanceResult>("get_balance", { currentMonth });
      setBalance(bal);
      
      const bs = await invoke<any>("get_budget_status", { currentMonth });
      setBudgetStatus(bs);
      

      const cData = await invoke<any[]>("get_chart_data", { currentDate: currentMonth, periodType: chartPeriod });
      setChartData(cData);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { fetchData(); }, [filterType, filterStartDate, filterEndDate, chartPeriod, refreshFlag]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const checkBudgetAlerts = (newTxAmount: number, categoryId: number) => {
    if (!budgetStatus) return;
    const cat = categories.find(c => c.id === categoryId);
    if (!cat) return;
    
    let currentSpent = 0;
    let ideal = 0;
    if (cat.group_type === "needs") { currentSpent = budgetStatus.real.needs_spent; ideal = budgetStatus.ideal.needs; }
    else if (cat.group_type === "wants") { currentSpent = budgetStatus.real.wants_spent; ideal = budgetStatus.ideal.wants; }
    else if (cat.group_type === "savings") { currentSpent = budgetStatus.real.savings_amount; ideal = budgetStatus.ideal.savings; }
    
    if (currentSpent + newTxAmount > ideal && ideal > 0) {
      showToast(`Warning: Category ${cat.group_type} has exceeded its 100% allocation!`);
    }
  };

  

  const openNewTransaction = () => {
    setEditingId(null);
    setForm({ amount: "", type: "expense", category_id: "", note: "", date: "", saving_goal_id: "" });
    setShowModal(true);
  };

  const openEditTransaction = (tx: Transaction) => {
    setEditingId(tx.id);
    setForm({
        amount: tx.amount.toString(),
        type: tx.transaction_type,
        category_id: tx.category_id?.toString() || "",
        note: tx.note || "",
        saving_goal_id: tx.saving_goal_id?.toString() || "",
        date: tx.transaction_date,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const txAmount = parseInt(form.amount);
      const goalId = form.saving_goal_id ? parseInt(form.saving_goal_id) : null;
      if (form.type === "expense" && !editingId) {
        checkBudgetAlerts(txAmount, parseInt(form.category_id));
      }

      if (editingId) {
        await invoke("update_transaction", {
            id: editingId,
            amount: txAmount,
            transactionType: form.type,
            categoryId: parseInt(form.category_id),
            note: form.note,
            transactionDate: form.date,
            savingGoalId: goalId,
        });
      } else {
        await invoke("create_transaction", {
            amount: txAmount,
            transactionType: form.type,
            categoryId: parseInt(form.category_id),
            note: form.note,
            transactionDate: form.date,
            savingGoalId: goalId,
        });
      }
      setShowModal(false);
      fetchData();
    } catch (e) {
      alert(String(e));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete transaction?")) return;
    try {
      await invoke("delete_transaction", { id });
      fetchData();
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <div className="min-h-screen flex bg-surface text-on-surface">
      <nav className="hidden md:flex flex-col h-full p-6 space-y-4 fixed left-0 top-0 w-[280px] bg-surface-container-lowest shadow-md z-40">
        <div className="flex items-center gap-3 mb-8">
          <img src="/icon.png" alt="Fintel Logo" className="w-10 h-10 rounded-xl" />
          <div>
            <h1 className="font-bold text-2xl text-primary">Fintel</h1>
            <p className="text-xs text-on-surface-variant">Financial Wellness</p>
          </div>
        </div>
        
        <div className="flex-1 space-y-2">
          {["Dashboard", "Transactions", "AI Chat", "Settings"].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
                activeTab === tab ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:bg-surface-container-high"
              }`}>
              <span className="material-symbols-rounded">
                {tab === "Dashboard" ? "dashboard" : tab === "Transactions" ? "receipt_long" : tab === "AI Chat" ? "smart_toy" : "settings"}
              </span>
              {tab}
            </button>
          ))}
        </div>
        
        <button onClick={openNewTransaction} className="w-full py-3 bg-primary text-on-primary rounded-full font-bold flex items-center justify-center gap-2 hover:bg-primary-container">
          <span className="material-symbols-rounded">add</span> New Transaction
        </button>
      </nav>

      <main className="flex-1 ml-0 md:ml-[280px] p-8 max-w-[1440px] mx-auto w-full space-y-8">
        {activeTab === "Dashboard" && (
          <>
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
              <div>
                <h2 className="text-3xl font-bold text-primary mb-4">Overview</h2>
                <div className="flex gap-6 mb-4">
                  <div>
                    <p className="text-sm text-on-surface-variant uppercase tracking-wider mb-1">Total Balance</p>
                    <p className="text-4xl font-bold text-on-surface">Rp {(balance?.balance || 0).toLocaleString()}</p>
                  </div>
                  <div className="border-l border-surface-container-high pl-6">
                    <p className="text-sm text-on-surface-variant uppercase tracking-wider mb-1">Monthly Balance</p>
                    <p className="text-2xl font-bold text-primary-container">Rp {(balance?.monthly_balance || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </header>

            <section className="bg-surface-container-lowest rounded-xl shadow-md p-6 border-l-4 border-blue-500">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold flex items-center gap-2">
                  <span className="material-symbols-rounded text-blue-500">flag</span>
                  Target Tabungan
                </h3>
                <button onClick={async () => { const name = prompt('Nama Target Tabungan:'); if (!name) return; const target = prompt('Target Nominal (Rp):'); if (!target) return; try { await invoke('create_saving_goal', { name, targetAmount: parseInt(target), targetDate: null }); fetchData(); } catch(e) { alert(String(e)) } }} className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold ml-auto">+ New Goal</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {savingGoals.map(goal => {
                  const pct = Math.min((goal.current_amount / goal.target_amount) * 100, 100);
                  return (
                    <div key={goal.id} className="bg-surface p-4 rounded-lg border border-surface-container-high">
                      <div className="flex justify-between mb-2">
                        <span className="font-bold">{goal.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-blue-600">{pct.toFixed(0)}%</span>
                          <button onClick={async () => { if(confirm('Delete goal?')) { await invoke('delete_saving_goal', { id: goal.id }); fetchData(); } }} className="text-red-500"><span className="material-symbols-rounded text-sm">delete</span></button>
                        </div>
                      </div>
                      <div className="w-full bg-blue-100 rounded-full h-2 mb-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${pct}%` }}></div>
                      </div>
                      <div className="flex justify-between text-xs text-on-surface-variant">
                        <span>Rp {goal.current_amount.toLocaleString()}</span>
                        <span>Target: Rp {goal.target_amount.toLocaleString()}</span>
                      </div>
                    </div>
                  )
                })}
                {savingGoals.length === 0 && <p className="text-sm text-on-surface-variant">Belum ada target tabungan.</p>}
              </div>
            </section>

            {budgetStatus && budgetStatus.income > 0 && (
              <section className="bg-surface-container-lowest rounded-xl shadow-md p-6">
                <h3 className="font-bold mb-4">Budget Tracker (50/30/20)</h3>
                <div className="space-y-6">
                  {/* Needs */}
                  {(() => {
                    const rawPct = (budgetStatus.real.needs_spent / budgetStatus.ideal.needs) * 100 || 0;
                    const pct = Math.min(rawPct, 100);
                    const color = rawPct > 100 ? "bg-red-500" : rawPct >= 80 ? "bg-yellow-500" : "bg-green-500";
                    const trackColor = rawPct > 100 ? "bg-red-100" : rawPct >= 80 ? "bg-yellow-100" : "bg-green-100";
                    return (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-bold">Needs (50%)</span>
                          <span>Rp {budgetStatus.real.needs_spent.toLocaleString()} / {budgetStatus.ideal.needs.toLocaleString()}</span>
                        </div>
                        <div className={`w-full h-3 rounded-full ${trackColor}`}>
                          <div className={`h-3 rounded-full ${color}`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })()}
                  {/* Wants */}
                  {(() => {
                    const rawPct = (budgetStatus.real.wants_spent / budgetStatus.ideal.wants) * 100 || 0;
                    const pct = Math.min(rawPct, 100);
                    const color = rawPct > 100 ? "bg-red-500" : rawPct >= 80 ? "bg-yellow-500" : "bg-green-500";
                    const trackColor = rawPct > 100 ? "bg-red-100" : rawPct >= 80 ? "bg-yellow-100" : "bg-green-100";
                    return (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-bold">Wants (30%)</span>
                          <span>Rp {budgetStatus.real.wants_spent.toLocaleString()} / {budgetStatus.ideal.wants.toLocaleString()}</span>
                        </div>
                        <div className={`w-full h-3 rounded-full ${trackColor}`}>
                          <div className={`h-3 rounded-full ${color}`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })()}
                  {/* Savings */}
                  {(() => {
                    const rawPct = (budgetStatus.real.savings_amount / budgetStatus.ideal.savings) * 100 || 0;
                    const pct = Math.min(rawPct, 100);
                    // For savings, higher is better, but to keep it simple, we just show green if they meet it. Wait, savings is income not expense!
                    // Let's assume savings is accumulated. 
                    const color = rawPct >= 100 ? "bg-green-500" : "bg-primary";
                    return (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-bold">Savings (20%)</span>
                          <span>Rp {budgetStatus.real.savings_amount.toLocaleString()} / {budgetStatus.ideal.savings.toLocaleString()}</span>
                        </div>
                        <div className="w-full h-3 rounded-full bg-surface-container-high">
                          <div className={`h-3 rounded-full ${color}`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </section>
            )}

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <section className="bg-surface-container-lowest rounded-xl shadow-md p-6 lg:col-span-2">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold">Income vs Expense</h3>
                  <div className="flex bg-surface rounded-lg p-1 border border-surface-container-high">
                    <button onClick={() => setChartPeriod("daily")} className={`px-4 py-1.5 rounded-md font-bold text-xs ${chartPeriod === "daily" ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant"}`}>Daily</button>
                    <button onClick={() => setChartPeriod("monthly")} className={`px-4 py-1.5 rounded-md font-bold text-xs ${chartPeriod === "monthly" ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant"}`}>Monthly</button>
                  </div>
                </div>
                <div className="h-64 w-full text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" stroke="#64748b" tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" tickLine={false} axisLine={false} tickFormatter={(val) => `Rp${val/1000}k`} />
                      <Tooltip formatter={(value: any) => `Rp ${value.toLocaleString()}`} />
                      <Legend />
                      <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Income" />
                      <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Expense" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="bg-surface-container-lowest rounded-xl shadow-md p-6 flex flex-col">
                <h3 className="font-bold mb-4">Spending Composition</h3>
                <div className="flex-1 min-h-[250px] relative">
                  {budgetStatus && (budgetStatus.real.needs_spent > 0 || budgetStatus.real.wants_spent > 0 || budgetStatus.real.savings_amount > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Needs', value: budgetStatus.real.needs_spent, color: '#f43f5e' }, // Rose for needs
                            { name: 'Wants', value: budgetStatus.real.wants_spent, color: '#eab308' }, // Yellow for wants
                            { name: 'Savings', value: budgetStatus.real.savings_amount, color: '#3b82f6' } // Blue for savings
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {
                            [
                              { name: 'Needs', value: budgetStatus.real.needs_spent, color: '#f43f5e' },
                              { name: 'Wants', value: budgetStatus.real.wants_spent, color: '#eab308' },
                              { name: 'Savings', value: budgetStatus.real.savings_amount, color: '#3b82f6' }
                            ].map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))
                          }
                        </Pie>
                        <Tooltip formatter={(value: any) => `Rp ${value.toLocaleString()}`} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-on-surface-variant text-center">
                      No spending data for this period
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Saran Fintel Section */}
            <section className="bg-surface-container-lowest rounded-xl shadow-md p-6 border-l-4 border-primary">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold flex items-center gap-2">
                  <span className="material-symbols-rounded text-primary">lightbulb</span>
                  Saran Fintel
                </h3>
                <button 
                  onClick={async () => {
                    const d = new Date();
                    const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                    setFintelAdvice("Sedang menganalisis data...");
                    try {
                      const res = await invoke<string>("generate_fintel_advice", { currentMonth });
                      setFintelAdvice(res);
                    } catch (e) {
                      setFintelAdvice("Gagal mendapatkan insight: " + String(e));
                    }
                  }} 
                  className="px-3 py-1.5 bg-surface-container-high rounded-lg text-xs font-bold hover:bg-surface-container-highest transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-rounded text-[16px]">refresh</span>
                  Perbarui
                </button>
              </div>
              
              <div className="text-sm text-on-surface leading-relaxed">
                {fintelAdvice === "Sedang menganalisis data..." ? (
                  <div className="flex items-center gap-2 text-on-surface-variant animate-pulse">
                     <span className="material-symbols-rounded animate-spin">sync</span>
                     Sedang menganalisis data keuangan Anda bulan ini...
                  </div>
                ) : fintelAdvice ? (
                  <p className="whitespace-pre-wrap">{fintelAdvice}</p>
                ) : (
                  <p className="text-on-surface-variant">Klik "Perbarui" untuk meminta saran cerdas dari asisten AI Anda.</p>
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === "Transactions" && (
          <div className="h-full">
            <h2 className="text-3xl font-bold text-primary mb-6">Transactions</h2>
            <section className="bg-surface-container-lowest rounded-xl shadow-md overflow-hidden">
              <div className="px-6 py-4 border-b border-surface-container-high flex flex-col sm:flex-row justify-between items-start sm:items-center bg-surface-container/50 gap-4">
                <h3 className="font-bold">History</h3>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="p-1.5 rounded-xl border border-surface-container-high bg-surface text-sm" title="Start Date" />
                    <span className="text-on-surface-variant text-sm">-</span>
                    <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="p-1.5 rounded-xl border border-surface-container-high bg-surface text-sm" title="End Date" />
                  </div>
                  <div className="flex bg-surface rounded-xl p-1 border border-surface-container-high">
                    <button onClick={() => setFilterType("all")} className={`px-4 py-1.5 rounded-xl font-bold text-sm ${filterType === "all" ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant"}`}>All</button>
                    <button onClick={() => setFilterType("income")} className={`px-4 py-1.5 rounded-xl font-bold text-sm ${filterType === "income" ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant"}`}>Income</button>
                    <button onClick={() => setFilterType("expense")} className={`px-4 py-1.5 rounded-xl font-bold text-sm ${filterType === "expense" ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant"}`}>Expense</button>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-surface-container-high">
                {transactions.map((tx) => (
                  <div key={tx.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-surface-container-low group">
                    <div className="col-span-2 text-sm text-on-surface-variant">{tx.transaction_date}</div>
                    <div className="col-span-5 flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.transaction_type === "income" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"}`}>
                        <span className="material-symbols-rounded">{tx.transaction_type === "income" ? "account_balance" : "shopping_cart"}</span>
                      </div>
                      <div>
                        <p className="font-bold">{tx.note?.replace("AI: ", "") || "No description"}</p>
                        <p className="text-xs text-on-surface-variant">{tx.source === "ai_chat" ? "AI Chat" : "Manual Entry"}</p>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-surface-container-high">{categories.find(c => c.id === tx.category_id)?.name}</span>
                    </div>
                    <div className="col-span-3 flex items-center justify-end gap-4">
                      <span className={`font-bold ${tx.transaction_type === "income" ? "text-primary" : "text-on-surface"}`}>
                        {tx.transaction_type === "income" ? "+" : "-"}Rp {tx.amount.toLocaleString()}
                      </span>
                      <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                          <button onClick={() => openEditTransaction(tx)} className="p-1.5 text-on-surface-variant hover:text-primary rounded-md hover:bg-surface-container"><span className="material-symbols-rounded">edit</span></button>
                          <button onClick={() => handleDelete(tx.id)} className="p-1.5 text-on-surface-variant hover:text-red-500 rounded-md hover:bg-surface-container"><span className="material-symbols-rounded">delete</span></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === "Settings" && <Settings />}

          {activeTab === "AI Chat" && (
          <div className="h-full">
            <AIChat />
          </div>
        )}
      </main>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-8 right-8 bg-red-500 text-white px-6 py-3 rounded-lg shadow-xl font-bold z-50 animate-bounce">
          {toastMessage}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form onSubmit={handleSave} className="bg-surface-container-lowest p-6 rounded-2xl w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold mb-4">{editingId ? "Edit Transaction" : "New Transaction"}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1">Type</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value, category_id: ""})} className="w-full p-2 border rounded-lg bg-surface">
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">Amount</label>
                <input required type="number" min="1" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full p-2 border rounded-lg bg-surface" />
              </div>
              <div>
                <div>
                  <label className="block text-sm font-bold mb-1">Category</label>
                  <select required value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="w-full p-2 border rounded-lg bg-surface">
                    <option value="">Select Category</option>
                    {categories.filter(c => c.transaction_type === form.type).map(c => <option key={c.id} value={c.id}>{c.name} {c.group_type ? `(${c.group_type})` : ''}</option>)}
                  </select>
                </div>
                {categories.find(c => c.id === parseInt(form.category_id))?.group_type === 'savings' && (
                  <div>
                    <label className="block text-sm font-bold mb-1">Saving Goal</label>
                    <select required value={form.saving_goal_id} onChange={e => setForm({...form, saving_goal_id: e.target.value})} className="w-full p-2 border rounded-lg bg-surface">
                      <option value="">Select Goal</option>
                      {savingGoals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-bold mb-1">Date</label>
                  <input required type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full p-2 border rounded-lg bg-surface" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">Note</label>
                <input type="text" value={form.note} onChange={e => setForm({...form, note: e.target.value})} className="w-full p-2 border rounded-lg bg-surface" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-full border text-sm font-bold">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-bold">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;








