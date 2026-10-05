export function normalizeTel(v) {
  return (v || "").replace(/[\s.-]/g, "");
}

export function estNumeroFixe(v) {
  const digits = normalizeTel(v);
  const local = digits.startsWith("+33") ? "0" + digits.slice(3) : digits;
  const prefix = local[1];
  return prefix !== undefined && prefix !== "6" && prefix !== "7";
}
