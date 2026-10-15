export const getCategoryIcon = (name: string, group_type?: string | null): string => {
  const n = name.toLowerCase();
  if (n.includes("makan")) return "restaurant";
  if (n.includes("minum") || n.includes("kopi")) return "local_cafe";
  if (n.includes("galon") || n.includes("air")) return "water_drop";
  if (n.includes("bensin") || n.includes("bbm") || n.includes("gasoline")) return "local_gas_station";
  if (n.includes("transport") || n.includes("ojek") || n.includes("taksi")) return "directions_car";
  if (n.includes("tagihan") || n.includes("listrik") || n.includes("pdam")) return "receipt";
  if (n.includes("kesehatan") || n.includes("obat") || n.includes("dokter")) return "local_hospital";
  if (n.includes("pendidikan") || n.includes("kursus") || n.includes("buku")) return "school";
  if (n.includes("kuota") || n.includes("pulsa") || n.includes("internet")) return "wifi";
  if (n.includes("nongkrong") || n.includes("kafe") || n.includes("cafe")) return "local_bar";
  if (n.includes("hiburan") || n.includes("game") || n.includes("bioskop")) return "sports_esports";
  if (n.includes("belanja") || n.includes("shopping") || n.includes("mall")) return "shopping_bag";
  if (n.includes("tabungan") || n.includes("saving")) return "savings";
  if (n.includes("investasi") || n.includes("saham") || n.includes("reksadana")) return "trending_up";
  if (n.includes("gaji") || n.includes("salary")) return "payments";
  if (n.includes("bonus") || n.includes("hadiah")) return "redeem";
  if (n.includes("penjualan") || n.includes("bisnis") || n.includes("toko")) return "store";
  if (n.includes("pinjaman") || n.includes("talangan")) return "handshake";
  
  if (group_type === "fixed") return "home";
  if (group_type === "wants") return "shopping_cart";
  if (group_type === "savings") return "savings";
  return "category";
};
