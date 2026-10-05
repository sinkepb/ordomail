export function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

export function defaultDateDebut() {
  return toDateInputValue(new Date());
}

export function defaultDateFin() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return toDateInputValue(d);
}
