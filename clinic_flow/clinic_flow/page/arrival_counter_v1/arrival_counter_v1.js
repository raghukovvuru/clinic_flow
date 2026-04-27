frappe.pages["arrival-counter-v1"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: "Arrival Counter",
    single_column: true,
  });

  page.main.empty();

  const iframe = document.createElement("iframe");
  iframe.src = "/assets/clinic_flow/head-app/arrival-counter/index.html";
  iframe.style.width = "100%";
  iframe.style.height = "100vh";
  iframe.style.border = "none";
  iframe.style.background = "#f6f5f1";
  iframe.setAttribute("allow", "clipboard-read; clipboard-write");
  page.main.append(iframe);
};
