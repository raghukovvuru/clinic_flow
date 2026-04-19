// Arrival Counter — patient self-check-in via QR scan, phone, or name lookup.
// Primary input: HID USB QR scanner (keyboard-emulates the Queue Entry docname + Enter).
// Fallback inputs: phone number (last 6 digits matched) or patient name substring.
frappe.pages["arrival-counter"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: "Arrival Counter",
		single_column: true,
	});

	const page = wrapper.page;
	page.main.addClass("ac-page-main");
	_inject_styles();

	const state = {
		dept_abbr: "",
		sessions: [],
		recent: [],
		lookup_timer: null,
	};

	page.main.html(_page_html());

	const $root       = page.main;
	const $input      = $root.find(".ac-input");
	const $hint       = $root.find(".ac-input-hint");
	const $result     = $root.find(".ac-result-zone");
	const $recentList = $root.find(".ac-recent-list");

	// ── Session context ──────────────────────────────────────────────────────

	function _load_context() {
		frappe.call({
			method: "clinic_flow.api.arrival.get_arrival_session_context",
			args: { dept_abbr: state.dept_abbr },
			callback(r) {
				if (!r.exc && r.message) {
					_render_header(r.message);
					state.sessions = r.message.sessions || [];
				}
			},
		});
	}

	function _render_header(ctx) {
		$root.find(".ac-arrived-count").text(ctx.arrived_count ?? "-");
		$root.find(".ac-waiting-count").text(ctx.waiting_count ?? "-");

		const sessions = ctx.sessions || [];
		let label = "No active session";
		if (sessions.length === 1) {
			const s = sessions[0];
			const status = s.status === "Scheduled" ? `Scheduled ${_fmt_time(s.start_time)}` : s.status;
			label = `${s.dept_abbr || ""} · ${status}`;
		} else if (sessions.length > 1) {
			label = `${sessions.length} sessions active`;
		}
		$root.find(".ac-session-label").text(label);
	}

	// ── Input handling ───────────────────────────────────────────────────────

	$input.on("keydown", function (e) {
		if (e.key === "Enter") {
			e.preventDefault();
			const raw = $input.val().trim();
			if (raw) _do_lookup(raw);
		}
	});

	$input.on("input", function () {
		clearTimeout(state.lookup_timer);
		const raw = $input.val().trim();
		if (!raw) {
			_clear_result();
			return;
		}
		// Auto-submit after 800ms idle (for keyboard typed names)
		state.lookup_timer = setTimeout(() => {
			if ($input.val().trim() === raw) _do_lookup(raw);
		}, 800);
	});

	function _classify_input(raw) {
		// QR: matches Queue Entry autoname pattern QE-YYYY-##### (or any QE- prefix)
		if (/^QE-\d{4}-\d+$/i.test(raw)) return { mode: "qr_code", value: raw.toUpperCase() };
		// Phone: 6+ digits (possibly with leading +/spaces stripped)
		const digits = raw.replace(/[^\d]/g, "");
		if (digits.length >= 6 && /^[\d\s+\-()]+$/.test(raw)) return { mode: "phone", value: raw };
		// Name: anything else with 2+ non-digit chars
		if (raw.replace(/\d/g, "").length >= 2) return { mode: "name_query", value: raw };
		return null;
	}

	function _do_lookup(raw) {
		const classified = _classify_input(raw);
		if (!classified) {
			_show_hint("Type at least 2 characters for name search, 6 digits for phone, or scan a QR code.");
			return;
		}
		_show_loading();
		frappe.call({
			method: "clinic_flow.api.arrival.lookup_arrival_candidate",
			args: {
				dept_abbr: state.dept_abbr,
				[classified.mode]: classified.value,
			},
			callback(r) {
				if (r.exc) {
					_show_error(__("Lookup failed. Try again."));
					return;
				}
				const msg = r.message || {};
				if (msg.error === "no_active_session") {
					_show_error(__("No active session found. Ask the receptionist."));
					return;
				}
				if (msg.error === "phone_too_short") {
					_show_hint(__("Enter at least 6 digits of your phone number."));
					return;
				}
				const candidates = msg.candidates || [];
				if (!candidates.length) {
					_show_no_match();
					return;
				}
				if (candidates.length === 1) {
					_show_confirmation(candidates[0]);
				} else {
					_show_candidate_list(candidates);
				}
			},
		});
	}

	// ── Result zone states ────────────────────────────────────────────────────

	function _show_loading() {
		$result.html(`<div class="ac-status-card ac-loading"><div class="ac-spinner"></div><span>Looking up…</span></div>`);
	}

	function _show_hint(msg) {
		$result.html(`<div class="ac-status-card ac-hint-card">${msg}</div>`);
	}

	function _show_error(msg) {
		$result.html(`<div class="ac-status-card ac-error-card"><span class="ac-status-icon">✕</span>${msg}</div>`);
		setTimeout(_clear_result, 4000);
	}

	function _show_no_match() {
		$result.html(`
			<div class="ac-status-card ac-nomatch-card">
				<span class="ac-status-icon">?</span>
				<div>
					<strong>No match found</strong>
					<div class="ac-submsg">Check the token or ask the receptionist.</div>
				</div>
			</div>`);
		setTimeout(_clear_result, 5000);
	}

	function _show_confirmation(entry) {
		if (entry.status === "Arrived") {
			_show_already_arrived(entry);
			return;
		}
		$result.html(_confirmation_card_html(entry));
		$result.find(".ac-confirm-btn").on("click", function () {
			_mark_arrived(entry);
		});
		$result.find(".ac-cancel-btn").on("click", _clear_result);
	}

	function _show_candidate_list(candidates) {
		const cards = candidates.map(e => `
			<div class="ac-candidate-row" data-name="${e.name}">
				<div class="ac-cand-token">${_esc(e.token || e.name)}</div>
				<div class="ac-cand-name">${_esc(e.patient_name)}</div>
				<div class="ac-cand-meta">${_load_label(e.load_class)} · ${_esc(e.dept_abbr || "")}</div>
				<button class="ac-select-btn btn btn-xs btn-primary">Select</button>
			</div>`).join("");
		$result.html(`<div class="ac-candidate-list">${cards}</div>`);
		$result.find(".ac-select-btn").on("click", function () {
			const name = $(this).closest(".ac-candidate-row").data("name");
			const entry = candidates.find(e => e.name === name);
			if (entry) _show_confirmation(entry);
		});
	}

	function _show_already_arrived(entry) {
		$result.html(`
			<div class="ac-status-card ac-already-card">
				<span class="ac-status-icon ac-check">✓</span>
				<div>
					<strong>${_esc(entry.patient_name)}</strong> — ${_esc(entry.token || entry.name)}
					<div class="ac-submsg">Already checked in.</div>
				</div>
			</div>`);
		setTimeout(_clear_result, 4000);
	}

	function _show_success(entry) {
		$result.html(`
			<div class="ac-status-card ac-success-card">
				<span class="ac-status-icon ac-check">✓</span>
				<div>
					<div class="ac-success-token">${_esc(entry.token || entry.name)}</div>
					<div class="ac-success-name">${_esc(entry.patient_name)}</div>
					<div class="ac-submsg">Arrival recorded — please take a seat.</div>
				</div>
			</div>`);
		_push_recent(entry);
		setTimeout(() => {
			_clear_result();
			$input.val("").focus();
			_load_context();
		}, 3000);
	}

	function _clear_result() {
		$result.empty();
		$hint.text("");
	}

	function _show_hint(msg) {
		$hint.text(msg);
	}

	// ── mark_arrived RPC ─────────────────────────────────────────────────────

	function _mark_arrived(entry) {
		$result.find(".ac-confirm-btn").prop("disabled", true).text("Saving…");
		frappe.call({
			method: "clinic_flow.api.arrival.mark_arrived",
			args: { queue_entry: entry.name, queue_session: entry.queue_session },
			callback(r) {
				if (r.exc) {
					_show_error(__("Could not record arrival. Try again."));
					return;
				}
				const resp = r.message || {};
				if (resp.already_arrived) {
					_show_already_arrived({ ...entry, token: resp.token, patient_name: resp.patient_name });
				} else {
					_show_success({ ...entry, token: resp.token, patient_name: resp.patient_name });
				}
			},
		});
	}

	// ── Recent arrivals ticker ────────────────────────────────────────────────

	function _push_recent(entry) {
		state.recent.unshift({ token: entry.token || entry.name, name: entry.patient_name, ts: new Date() });
		if (state.recent.length > 8) state.recent.pop();
		_render_recent();
	}

	function _render_recent() {
		if (!state.recent.length) {
			$recentList.html(`<span class="ac-recent-empty">No arrivals yet this session</span>`);
			return;
		}
		$recentList.html(state.recent.map(r =>
			`<span class="ac-recent-chip"><span class="ac-rc-token">${_esc(r.token)}</span><span class="ac-rc-name">${_esc(r.name)}</span></span>`
		).join(""));
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	function _confirmation_card_html(entry) {
		const load = _load_label(entry.load_class);
		return `
			<div class="ac-confirm-card">
				<div class="ac-cc-token">${_esc(entry.token || entry.name)}</div>
				<div class="ac-cc-name">${_esc(entry.patient_name)}</div>
				<div class="ac-cc-meta">${load}${entry.channel ? " · " + _esc(entry.channel) : ""}</div>
				<button class="ac-confirm-btn btn btn-primary btn-lg">✓ Confirm Arrival</button>
				<button class="ac-cancel-btn btn btn-default btn-sm">Not this patient</button>
			</div>`;
	}

	function _load_label(load_class) {
		if (load_class === "review_load") return "Review";
		if (load_class === "non_review_load") return "New";
		return "";
	}

	function _fmt_time(t) {
		if (!t) return "";
		const parts = String(t).split(":");
		let h = parseInt(parts[0] || 0);
		const m = parts[1] || "00";
		const suffix = h >= 12 ? "pm" : "am";
		if (h > 12) h -= 12;
		if (h === 0) h = 12;
		return `${h}:${m} ${suffix}`;
	}

	function _esc(str) {
		return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}

	// ── Init ─────────────────────────────────────────────────────────────────

	_render_recent();
	_load_context();
	$input.focus();

	// Refresh context every 30s
	const _ctx_interval = setInterval(_load_context, 30000);
	$(wrapper).on("remove", () => clearInterval(_ctx_interval));
};


// ── HTML template ─────────────────────────────────────────────────────────────

function _page_html() {
	return `
<div class="ac-page">
  <div class="ac-header">
    <div class="ac-header-left">
      <span class="ac-page-title">Arrival Counter</span>
      <span class="ac-session-label"></span>
    </div>
    <div class="ac-stats">
      <div class="ac-stat-tile">
        <span class="ac-stat-value ac-arrived-count">-</span>
        <span class="ac-stat-label">Here now</span>
      </div>
      <div class="ac-stat-tile">
        <span class="ac-stat-value ac-waiting-count">-</span>
        <span class="ac-stat-label">Expected</span>
      </div>
    </div>
  </div>

  <div class="ac-scan-zone">
    <input
      type="text"
      class="ac-input"
      placeholder="Scan QR code · phone number · patient name"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
    />
    <div class="ac-input-hint"></div>
  </div>

  <div class="ac-result-zone"></div>

  <div class="ac-recent">
    <div class="ac-recent-title">Recent arrivals</div>
    <div class="ac-recent-list ac-recent-empty">No arrivals yet this session</div>
  </div>
</div>`;
}


// ── Styles ────────────────────────────────────────────────────────────────────

function _inject_styles() {
	if (document.getElementById("ac-styles")) return;
	const style = document.createElement("style");
	style.id = "ac-styles";
	style.textContent = `
/* ── Layout ── */
.ac-page-main .page-content { padding: 0; }
.ac-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 24px 20px 40px;
  font-family: var(--font-stack, 'Inter', 'Segoe UI', Arial, sans-serif);
}

/* ── Header ── */
.ac-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 28px;
}
.ac-header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ac-page-title {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.01em;
}
.ac-session-label {
  font-size: 12px;
  color: #64748b;
}
.ac-stats {
  display: flex;
  gap: 12px;
}
.ac-stat-tile {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 14px;
  text-align: center;
  min-width: 62px;
}
.ac-stat-value {
  display: block;
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
  color: #0f172a;
  letter-spacing: -0.02em;
}
.ac-stat-label {
  display: block;
  font-size: 10px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-top: 2px;
}

/* ── Scan zone ── */
.ac-scan-zone {
  margin-bottom: 20px;
}
.ac-input {
  width: 100%;
  height: 56px;
  font-size: 17px;
  padding: 0 18px;
  border: 2px solid #cbd5e1;
  border-radius: 10px;
  outline: none;
  background: #fff;
  color: #0f172a;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ac-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
}
.ac-input-hint {
  font-size: 12px;
  color: #64748b;
  margin-top: 6px;
  min-height: 18px;
}

/* ── Result zone ── */
.ac-result-zone { margin-bottom: 24px; min-height: 48px; }

.ac-status-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 10px;
  font-size: 14px;
}
.ac-loading { background: #f1f5f9; color: #475569; }
.ac-hint-card { background: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; }
.ac-error-card { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
.ac-nomatch-card { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.ac-already-card { background: #fefce8; color: #713f12; border: 1px solid #fef08a; }
.ac-success-card { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

.ac-status-icon {
  font-size: 20px;
  font-weight: 700;
  flex-shrink: 0;
}
.ac-check { color: #16a34a; }
.ac-submsg { font-size: 12px; opacity: 0.8; margin-top: 2px; }

.ac-spinner {
  width: 20px; height: 20px;
  border: 2px solid #cbd5e1;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: ac-spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes ac-spin { to { transform: rotate(360deg); } }

/* ── Confirmation card ── */
.ac-confirm-card {
  background: #fff;
  border: 2px solid #3b82f6;
  border-radius: 12px;
  padding: 24px 20px 20px;
  text-align: center;
}
.ac-cc-token {
  font-size: 36px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #0f172a;
  line-height: 1;
}
.ac-cc-name {
  font-size: 18px;
  font-weight: 600;
  margin-top: 6px;
  color: #1e293b;
}
.ac-cc-meta {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
  margin-bottom: 20px;
}
.ac-confirm-btn {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  margin-bottom: 10px;
  background: #16a34a;
  border-color: #16a34a;
  color: #fff;
}
.ac-confirm-btn:hover { background: #15803d; border-color: #15803d; color: #fff; }
.ac-confirm-btn:disabled { opacity: 0.6; }
.ac-cancel-btn { color: #64748b; border-color: #e2e8f0; }

/* ── Candidate list ── */
.ac-candidate-list { display: flex; flex-direction: column; gap: 8px; }
.ac-candidate-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}
.ac-cand-token { font-size: 14px; font-weight: 700; min-width: 90px; color: #0f172a; }
.ac-cand-name { flex: 1; font-size: 14px; color: #1e293b; }
.ac-cand-meta { font-size: 11px; color: #94a3b8; }
.ac-select-btn { flex-shrink: 0; }

/* ── Success state ── */
.ac-success-token { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; }
.ac-success-name  { font-size: 15px; font-weight: 600; margin-top: 2px; }

/* ── Recent arrivals ── */
.ac-recent { margin-top: 8px; }
.ac-recent-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 8px; }
.ac-recent-list { display: flex; flex-wrap: wrap; gap: 6px; }
.ac-recent-empty { font-size: 12px; color: #cbd5e1; }
.ac-recent-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #f1f5f9;
  border-radius: 99px;
  padding: 3px 10px 3px 8px;
  font-size: 12px;
}
.ac-rc-token { font-weight: 700; color: #334155; }
.ac-rc-name  { color: #64748b; }
`;
	document.head.appendChild(style);
}
