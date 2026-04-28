import type { ArrivalCardRecord } from "$arrival/types";

export type PrintSlipResult = { ok: true } | { ok: false; reason: "popup-blocked" };

function appendText(parent: Element, className: string, text: string) {
  const el = parent.ownerDocument.createElement("div");
  el.className = className;
  el.textContent = text;
  parent.appendChild(el);
}

function trustedQrContainer(doc: Document, qrSvg: string) {
  const wrapper = doc.createElement("div");
  wrapper.className = "qr";
  const template = doc.createElement("template");
  template.innerHTML = qrSvg.trim();
  const svg = template.content.firstElementChild;
  if (svg?.tagName.toLowerCase() === "svg") {
    wrapper.appendChild(svg);
  }
  return wrapper;
}

export function buildTokenSlipDocument(doc: Document, record: ArrivalCardRecord) {
  doc.title = record.print_context.display_token;
  const style = doc.createElement("style");
  style.textContent = "body{font-family:'Source Sans 3',sans-serif;padding:20px;color:#10211f}.token{font-family:'Lexend',sans-serif;font-size:40px;font-weight:800}.name{margin-top:12px;font-size:22px;font-weight:600}.qr{margin-top:20px}";
  doc.head.appendChild(style);

  doc.body.replaceChildren();
  appendText(doc.body, "token", record.print_context.display_token);
  appendText(doc.body, "name", record.print_context.patient_name);
  doc.body.appendChild(trustedQrContainer(doc, record.print_context.qr_svg));
}

export function printTokenSlip(record: ArrivalCardRecord): PrintSlipResult {
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return { ok: false, reason: "popup-blocked" };

  buildTokenSlipDocument(win.document, record);
  win.document.close();
  win.print();
  return { ok: true };
}
