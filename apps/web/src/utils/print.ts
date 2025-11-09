// apps/web/src/utils/print.ts
export function openHtmlAndPrint(html: string, title = "Receipt"): void {
  const w = window.open("", "_blank", "noopener,noreferrer,width=700,height=900");
  if (!w) throw new Error("Popup blocked. Allow popups to print the receipt.");

  let htmlToWrite = html;
  const hasTitle = /<title>[\s\S]*?<\/title>/i.test(htmlToWrite);
  if (hasTitle) {
    htmlToWrite = htmlToWrite.replace(/<title>/i, `<title>${title} — `);
  } else {
    htmlToWrite = htmlToWrite.replace(/<head>/i, `<head><title>${escapeHtml(title)}</title>`);
  }
  if (!/<!doctype/i.test(htmlToWrite)) {
    htmlToWrite = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${htmlToWrite}</body></html>`;
  }

  w.document.open();
  w.document.write(htmlToWrite);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch {} }, 200);
}
function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
