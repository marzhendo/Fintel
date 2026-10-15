import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../useTranslation";
import { useStore } from "../store";

interface DailyExpenseTotal {
  date: string;
  total: number;
}

export function SpendingCalendar({ onDateClick }: { onDateClick: (date: string) => void }) {
  const { t, language } = useTranslation();
  const { refreshFlag, transactions } = useStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [data, setData] = useState<DailyExpenseTotal[]>([]);

  useEffect(() => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    invoke<DailyExpenseTotal[]>("get_daily_expense_totals", { month: `${year}-${month}` })
      .then((res) => setData(Array.isArray(res) ? res : []))
      .catch(console.error);
  }, [currentDate, refreshFlag, transactions]);

  const positiveTotals = data.map((d) => d.total).filter((v) => v > 0);
  const maxExpense = positiveTotals.length > 0 ? Math.max(...positiveTotals) : 0;
  const minPositive = positiveTotals.length > 0 ? Math.min(...positiveTotals) : 0;

  // 5 tingkatan kontras warna dari nominal terkecil (sangat terang) hingga terbesar (sangat gelap)
  const getIntensityStyle = (amount: number): { cell: string; badge: string; level: number } => {
    if (amount <= 0 || maxExpense <= 0) {
      return {
        cell: "bg-surface-container-lowest text-on-surface border-surface-container-high/60 hover:bg-surface-container-low",
        badge: "text-on-surface-variant",
        level: 0,
      };
    }

    // Normalisasi akar kuadrat (sqrt) antara nilai terkecil dan terbesar bulan ini
    // sehingga gradasi terang -> gelap tersebar merata di 5 level kontras
    let norm = 1;
    if (maxExpense > minPositive) {
      norm = Math.sqrt((amount - minPositive) / (maxExpense - minPositive));
    } else {
      norm = 0.5;
    }

    if (norm <= 0.15) {
      // Level 1: Sangat Terang (Nominal paling kecil)
      return {
        cell: "bg-[#D8F3DC] text-[#1B4332] border-[#B7E4C7] shadow-2xs",
        badge: "text-[#1B4332] bg-white/70 px-1.5 py-0.5 rounded-md",
        level: 1,
      };
    }
    if (norm <= 0.38) {
      // Level 2: Terang - Sedang
      return {
        cell: "bg-[#95D5B2] text-[#081C15] border-[#74C69D] shadow-2xs",
        badge: "text-[#081C15] bg-white/60 px-1.5 py-0.5 rounded-md",
        level: 2,
      };
    }
    if (norm <= 0.65) {
      // Level 3: Sedang (Medium Emerald)
      return {
        cell: "bg-[#40916C] text-white border-[#2D6A4F] shadow-xs",
        badge: "text-white bg-black/20 px-1.5 py-0.5 rounded-md",
        level: 3,
      };
    }
    if (norm <= 0.88) {
      // Level 4: Gelap (Deep Emerald)
      return {
        cell: "bg-[#1B4332] text-white border-[#081C15] shadow-sm",
        badge: "text-[#D8F3DC] bg-white/15 px-1.5 py-0.5 rounded-md",
        level: 4,
      };
    }
    // Level 5: Sangat Gelap (Nominal paling besar / Puncak pengeluaran)
    return {
      cell: "bg-[#081C15] text-white border-[#081C15] shadow-md ring-2 ring-[#40916C]/50",
      badge: "text-[#95D5B2] bg-white/15 px-1.5 py-0.5 rounded-md",
      level: 5,
    };
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const monthIndex = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const firstDay = getFirstDayOfMonth(year, monthIndex);

  const daysList: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) daysList.push(null);
  for (let i = 1; i <= daysInMonth; i++) daysList.push(i);

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      const jt = amount / 1000000;
      return (Number.isInteger(jt) ? jt.toString() : jt.toFixed(1)) + (language === "id" ? "jt" : "M");
    }
    if (amount >= 1000) {
      return Math.round(amount / 1000) + (language === "id" ? "rb" : "k");
    }
    return amount.toString();
  };

  const monthName = new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-US", {
    month: "long",
    year: "numeric",
  }).format(currentDate);

  const weekDays = [
    t("cal_sun"),
    t("cal_mon"),
    t("cal_tue"),
    t("cal_wed"),
    t("cal_thu"),
    t("cal_fri"),
    t("cal_sat"),
  ];

  return (
    <div className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm border border-surface-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="font-bold text-lg text-on-surface">{t("dash_spending_calendar")}</h3>
          <p className="text-xs text-on-surface-variant">
            {language === "id"
              ? "Semakin gelap warna tanggal, semakin besar pengeluaran pada hari tersebut."
              : "Darker dates indicate higher spending on that day."}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto bg-surface-container px-2 py-1 rounded-2xl border border-surface-container-high">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1.5 rounded-xl hover:bg-surface-container-high text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-rounded text-lg block">chevron_left</span>
          </button>
          <span className="font-bold text-sm w-36 text-center text-on-surface">{monthName}</span>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 rounded-xl hover:bg-surface-container-high text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-rounded text-lg block">chevron_right</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2.5">
        {weekDays.map((wd, i) => (
          <div
            key={i}
            className="text-center text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1"
          >
            {wd}
          </div>
        ))}
        {daysList.map((day, i) => {
          if (!day) return <div key={i} className="aspect-square" />;

          const dateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dailyTotal = data.find((d) => d.date === dateStr)?.total || 0;
          const style = getIntensityStyle(dailyTotal);

          return (
            <button
              key={i}
              type="button"
              onClick={() => onDateClick(dateStr)}
              title={
                dailyTotal > 0
                  ? `${dateStr}: Rp ${dailyTotal.toLocaleString("id-ID")}`
                  : `${dateStr}: Rp 0`
              }
              className={`aspect-square rounded-2xl flex flex-col items-center justify-center p-1.5 transition-all hover:scale-105 border cursor-pointer ${style.cell}`}
            >
              <span className="font-bold text-sm leading-tight">{day}</span>
              {dailyTotal > 0 && (
                <span className={`text-[10px] font-extrabold mt-1 leading-none ${style.badge}`}>
                  {formatCurrency(dailyTotal)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend Intensitas Heatmap */}
      <div className="mt-5 pt-4 border-t border-surface-container-high flex flex-wrap items-center justify-between gap-3 text-xs text-on-surface-variant">
        <span className="font-medium">
          {language === "id"
            ? "Klik tanggal untuk memfilter daftar transaksi pada hari tersebut."
            : "Click any date to filter transactions for that day."}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[11px] mr-1">
            {language === "id" ? "Kecil" : "Low"}
          </span>
          <span
            className="w-4 h-4 rounded-md bg-surface-container-lowest border border-surface-container-high inline-block"
            title="Rp 0"
          />
          <span
            className="w-4 h-4 rounded-md bg-[#D8F3DC] border border-[#B7E4C7] inline-block"
            title="Level 1 (Sangat Terang)"
          />
          <span
            className="w-4 h-4 rounded-md bg-[#95D5B2] border border-[#74C69D] inline-block"
            title="Level 2 (Terang)"
          />
          <span
            className="w-4 h-4 rounded-md bg-[#40916C] border border-[#2D6A4F] inline-block"
            title="Level 3 (Sedang)"
          />
          <span
            className="w-4 h-4 rounded-md bg-[#1B4332] border border-[#081C15] inline-block"
            title="Level 4 (Gelap)"
          />
          <span
            className="w-4 h-4 rounded-md bg-[#081C15] border border-[#081C15] inline-block"
            title="Level 5 (Sangat Gelap)"
          />
          <span className="font-semibold text-[11px] ml-1">
            {language === "id" ? "Besar" : "High"}
          </span>
        </div>
      </div>
    </div>
  );
}

