// apps/web/lib/date.ts
function todayYmd() {
  // local YYYY-MM-DD (works across timezones)
  return new Date().toLocaleDateString("en-CA");
}
