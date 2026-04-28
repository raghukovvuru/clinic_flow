frappe.pages["arrival-counter-v1"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Arrival Counter",
        single_column: true,
    });

    page.main.empty();
    page.main.html(`
        <div class="p-6">
            <div class="mb-3 text-muted">Arrival Counter now runs outside Desk chrome.</div>
            <a class="btn btn-primary" href="/clinic/arrival-counter">Open Arrival Counter</a>
        </div>
    `);
};
