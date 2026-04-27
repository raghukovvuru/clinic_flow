frappe.pages["arrival-counter-v1"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: "Arrival Counter",
    single_column: true,
  });

  page.main.addClass("arrival-counter-v1-host");
  page.main.html('<div id="arrival-counter-v1-root"></div>');

  frappe.require("/assets/clinic_flow/head-app/arrival-counter-v1.js", () => {
    const mount = window.clinicFlowArrivalCounterV1;
    if (!mount || typeof mount.mount !== "function") {
      page.main.html('<div class="text-muted">Arrival Counter bundle failed to load.</div>');
      return;
    }

    mount.mount({
      target: page.main.find("#arrival-counter-v1-root")[0],
      props: {
        realtime: frappe.realtime,
        siteName: frappe.boot?.sitename || "site1.localhost",
        user: frappe.session.user,
      },
    });
  });
};
