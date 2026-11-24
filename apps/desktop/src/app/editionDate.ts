/** "TUESDAY, 24 NOVEMBER 2026": the dateline printed under every masthead. */
export function editionDate(date: Date, locale = "en-GB"): string {
  const weekday = date.toLocaleDateString(locale, { weekday: "long" });
  const rest = date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  return `${weekday}, ${rest}`.toUpperCase();
}

/** Greeting for the front page dateline. */
export function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
