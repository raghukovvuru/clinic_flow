frappe.pages["arrival-counter-v1"].on_page_load = function (wrapper) {
  if (typeof wrapper.__arrivalCounterV1Teardown === "function") {
    wrapper.__arrivalCounterV1Teardown();
  }

  let mountInstance = null;
  let hasMounted = false;
  let isDisposed = false;

  const teardown = () => {
    if (isDisposed) {
      return;
    }

    isDisposed = true;

    if (mountInstance && typeof mountInstance.destroy === "function") {
      mountInstance.destroy();
    } else if (mountInstance && typeof mountInstance.unmount === "function") {
      mountInstance.unmount();
    }

    mountInstance = null;
    hasMounted = false;
    $(wrapper).off("remove.arrival-counter-v1", teardown);
    wrapper.__arrivalCounterV1Teardown = null;
  };

  wrapper.__arrivalCounterV1Teardown = teardown;
  $(wrapper).on("remove.arrival-counter-v1", teardown);

  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: "Arrival Counter",
    single_column: true,
  });

  page.main.addClass("arrival-counter-v1-host");
  page.main.html('<div id="arrival-counter-v1-root"></div>');

  frappe.require("/assets/clinic_flow/head-app/arrival-counter-v1.js", () => {
    if (isDisposed || hasMounted || !wrapper.isConnected) {
      return;
    }

    const target = page.main.find("#arrival-counter-v1-root")[0];
    if (!target || !target.isConnected) {
      return;
    }

    const mount = window.clinicFlowArrivalCounterV1;
    if (!mount || typeof mount.mount !== "function") {
      page.main.html('<div class="text-muted">Arrival Counter bundle failed to load.</div>');
      return;
    }

    const runtimeSiteName = frappe.boot?.sitename || window.location.host || window.location.hostname || "";

    mountInstance = mount.mount({
      target,
      props: {
        realtime: frappe.realtime,
        siteName: runtimeSiteName,
        user: frappe.session.user,
      },
    });

    hasMounted = true;
  });
};
