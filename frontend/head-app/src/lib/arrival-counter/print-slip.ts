import type { ArrivalCardRecord } from "$arrival/types";

export function printTokenSlip(record: ArrivalCardRecord) {
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return;

  win.document.write(`
    <html>
      <head>
        <title>${record.display_token}</title>
        <style>
          body { font-family: 'Source Sans 3', sans-serif; padding: 20px; color: #10211f; }
          .token { font-family: 'Lexend', sans-serif; font-size: 40px; font-weight: 800; }
          .name { margin-top: 12px; font-size: 22px; font-weight: 600; }
          .qr { margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="token">${record.print_context.display_token}</div>
        <div class="name">${record.print_context.patient_name}</div>
        <div class="qr">${record.print_context.qr_svg}</div>
      </body>
    </html>
  `);
  win.document.close();
  win.print();
}
