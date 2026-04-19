// Receptionist Dashboard — v2
// Phase 4: Shell + Left Panel (Admission Flow)
// Phase 5: Token Board (center panel) — placeholder
// Phase 6: Live Session Panel (right panel) — placeholder

// ETA datetimes are stored as local time (naive, no UTC offset).
// frappe.datetime.str_to_user() treats strings as UTC before converting —
// that would add the timezone offset a second time. Extract HH:MM directly.
function _eta_fmt(dt_str) {
	if (!dt_str) return '—';
	const t = String(dt_str).split(/[T ]/)[1];
	return t ? t.substring(0, 5) : '—';
}

// Calculate age from an ISO date string (YYYY-MM-DD).
// Returns a compact string like "3y 2m", "5m", "12d", or "" if no dob.
function _age_from_dob(dob_str) {
	if (!dob_str) return '';
	const dob = new Date(dob_str);
	const now = new Date();
	let years  = now.getFullYear() - dob.getFullYear();
	let months = now.getMonth() - dob.getMonth();
	if (now.getDate() < dob.getDate()) months--;
	if (months < 0) { years--; months += 12; }
	if (years > 0)  return months > 0 ? `${years}y ${months}m` : `${years}y`;
	if (months > 0) return `${months}m`;
	const days = Math.max(0, Math.floor((now - dob) / 86400000));
	return `${days}d`;
}

function _display_token(row_or_token, token_number = null) {
	if (row_or_token && typeof row_or_token === 'object') {
		if (row_or_token.token) return String(row_or_token.token);
		if (row_or_token.token_number !== undefined && row_or_token.token_number !== null) {
			return String(row_or_token.token_number);
		}
		return '—';
	}
	if (row_or_token) return String(row_or_token);
	if (token_number !== null && token_number !== undefined) return String(token_number);
	return '—';
}

// Returns short elapsed string from a datetime string: "3m", "1h 4m"
function _elapsed_short(dt_str) {
	if (!dt_str) return '';
	const d = new Date(dt_str.replace(' ', 'T'));
	if (isNaN(d.getTime())) return '';
	const mins = Math.floor((Date.now() - d.getTime()) / 60000);
	if (mins < 1)  return '<1m';
	if (mins < 60) return `${mins}m`;
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Returns elapsed time since a called_to_reception_at datetime string.
// { label: "2:14", urgent: true } — urgent when >= 120 seconds elapsed.
function _call_elapsed(dt_str) {
	if (!dt_str) return null;
	const called = new Date(dt_str.replace(' ', 'T'));
	if (isNaN(called.getTime())) return null;
	const elapsed = Math.floor((Date.now() - called.getTime()) / 1000);
	if (elapsed < 0) return null;
	const m = Math.floor(elapsed / 60);
	const s = elapsed % 60;
	return {
		label: `${m}:${String(s).padStart(2, '0')}`,
		elapsed,
		urgent: elapsed >= 120,
		pct: Math.min(100, Math.round(elapsed / 300 * 100)), // 5 min = 100%
	};
}

function _eta_slot(predicted, windowEnd = null) {
	const start = _eta_fmt(predicted);
	if (!start || start === '—') return '—';
	const end = _eta_fmt(windowEnd);
	if (!end || end === '—') return start;
	return `${start}-${end}`;
}

function _report_by_label(reportBy) {
	const report = _eta_fmt(reportBy);
	if (!report || report === '—') return '—';
	return `By ${report}`;
}

function _report_band(reportBy) {
	if (!reportBy) return 'Later';
	const report = _eta_fmt(reportBy);
	if (!report || report === '—') return 'Later';
	const [hh, mm] = report.split(':').map(Number);
	if (Number.isNaN(hh) || Number.isNaN(mm)) return 'Later';
	const totalMinutes = hh * 60 + mm;
	const rounded = Math.round(totalMinutes / 30) * 30;
	const normalized = ((rounded % 1440) + 1440) % 1440;
	const bandHour = Math.floor(normalized / 60);
	const bandMinute = normalized % 60;
	const suffix = bandHour >= 12 ? 'PM' : 'AM';
	const hour12 = ((bandHour + 11) % 12) + 1;
	const minuteText = String(bandMinute).padStart(2, '0');
	return `Around ${hour12}:${minuteText} ${suffix}`;
}

frappe.pages['receptionist-dashboard'].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Receptionist Dashboard',
		single_column: true,
	});
	$(wrapper).find('.page-content').html(get_dashboard_html());
	new ReceptionistDashboard(wrapper);
};

// ─────────────────────────────────────────────────────────────────────────────
// HTML shell
// ─────────────────────────────────────────────────────────────────────────────
function get_dashboard_html() {
	return `
<style>
#rd-root {
	--rd-bg: #f4f6f5;
	--rd-panel: #fffdfb;
	--rd-panel-soft: #eef3f0;
	--rd-panel-tint: #f7fbf8;
	--rd-border: #d9e1dc;
	--rd-border-strong: #b9c9c0;
	--rd-text: #1f2a24;
	--rd-muted: #66736d;
	--rd-primary: #14624d;
	--rd-primary-tint: #dff2ea;
	--rd-primary-soft: #edf8f2;
	--rd-blue-tint: #dbeafe;
	--rd-amber-tint: #fef3c7;
	background: var(--rd-bg);
	color: var(--rd-text);
}
#rd-root * { box-sizing: border-box; }
.rd-topbar-shell {
	flex-shrink:0;
	padding:8px 20px;
	background:linear-gradient(180deg, #fffdfb 0%, #f7faf8 100%);
	border-bottom:1px solid var(--rd-border);
	display:flex;
	align-items:center;
	justify-content:space-between;
	gap:14px;
	flex-wrap:wrap;
}
.rd-topbar-title {
	display:flex;
	flex-direction:column;
	gap:2px;
}
.rd-topbar-kicker {
	font-size:10px;
	font-weight:800;
	text-transform:uppercase;
	letter-spacing:.08em;
	color:var(--rd-muted);
}
.rd-topbar-heading {
	font-size:15px;
	font-weight:800;
	color:var(--rd-text);
}
.rd-topbar-meta {
	display:flex;
	align-items:center;
	gap:8px;
	flex-wrap:wrap;
	font-size:12px;
	color:var(--rd-muted);
}
.rd-shell-grid {
	display:grid;
	grid-template-columns:minmax(520px, 1.2fr) minmax(420px, 1fr) 320px;
	flex:1;
	overflow:hidden;
	min-height:0;
}
#rd-root.phone-mode:not(.board-open) .rd-shell-grid {
	grid-template-columns:minmax(640px, 1.55fr) minmax(360px, 1fr);
}
#rd-root.phone-mode.board-open .rd-shell-grid {
	grid-template-columns:minmax(520px, 1.15fr) minmax(360px, .92fr) minmax(340px, .95fr);
}
#rd-root.phone-mode:not(.board-open) #rd-center {
	display:none !important;
}
#rd-root.walkin-mode .rd-shell-grid {
	grid-template-columns:minmax(0, 2.35fr) minmax(320px, 1fr);
}
#rd-root.walkin-mode #rd-center {
	display:flex !important;
	border-right:1px solid var(--border-color);
}
#rd-root.walkin-mode #rd-right {
	display:flex !important;
}
#rd-root.walkin-mode #rd-left {
	display:none !important;
}
#rd-root.walkin-mode #rd-steps {
	display:none !important;
}
#rd-root.walkin-mode #rd-special-label {
	display:none !important;
}
#rd-root.walkin-mode #rd-center > div:first-child,
#rd-root.walkin-mode #rd-center > #rd-board-legend,
#rd-root.walkin-mode #rd-center > #rd-board-context {
	padding-left:16px;
	padding-right:16px;
}
#rd-root.walkin-mode #rd-board-main {
	background: linear-gradient(180deg, rgba(15, 92, 77, 0.02) 0%, transparent 100%);
	display:grid;
	grid-template-columns:minmax(0, 1.25fr) minmax(300px, .75fr);
	gap:0;
}
#rd-root.walkin-mode #rd-board-legend {
	padding-top: 6px;
	padding-bottom: 6px;
}
#rd-root.walkin-mode #rd-board-grid {
	max-width:none;
	margin:0;
	width:100%;
	padding:16px !important;
	border-right:1px solid var(--border-color);
}
#rd-root.walkin-mode #rd-board-context {
	max-width:none;
	margin:0;
	width:100%;
	border-top:none !important;
	padding:16px !important;
	background:rgba(255,255,255,.88);
	overflow-y:auto;
}
#rd-root.walkin-mode #rd-right {
	min-width: 320px;
}
#rd-root.phone-mode #rd-right { min-width:340px; }
.rd-availability-groups {
	display:flex;
	flex-direction:column;
	gap:12px;
	margin-bottom:12px;
}
.rd-availability-group-grid {
	display:grid;
	grid-template-columns:repeat(2, minmax(280px, 1fr));
	gap:10px;
}
.rd-availability-date-head {
	display:flex;
	align-items:flex-end;
	gap:8px;
	margin-bottom:8px;
}
.rd-availability-date-title {
	font-size:15px;
	font-weight:800;
	color:var(--rd-text);
}
.rd-availability-date-meta {
	font-size:11px;
	font-weight:600;
	color:var(--rd-muted);
	text-transform:uppercase;
	letter-spacing:.06em;
}
.rd-walkin-session-strip {
	display:flex;
	flex-direction:column;
	gap:8px;
	margin-bottom:12px;
}
.rd-walkin-session-chips {
	display:flex;
	gap:8px;
	flex-wrap:wrap;
	margin-bottom:12px;
}
.rd-walkin-session-chip {
	display:flex;
	align-items:center;
	gap:8px;
	padding:8px 10px;
	border:1px solid var(--border-color);
	border-radius:999px;
	background:var(--card-bg);
	cursor:pointer;
	font-size:12px;
	font-weight:600;
}
.rd-walkin-session-chip.active {
	border-color:var(--primary);
	background:var(--primary-light);
	box-shadow:0 0 0 2px rgba(34, 197, 94, 0.08);
}
.rd-walkin-session-btn {
	display:flex;
	align-items:center;
	justify-content:space-between;
	gap:10px;
	width:100%;
	padding:10px 12px;
	border:1px solid var(--border-color);
	border-radius:10px;
	background:var(--card-bg);
	cursor:pointer;
	text-align:left;
}
.rd-walkin-session-btn.active {
	border-color:var(--primary);
	box-shadow:0 0 0 2px rgba(34, 197, 94, 0.10);
	background:var(--primary-light);
}
.rd-walkin-dock {
	position:sticky;
	top:0;
}
.rd-walkin-selected-token {
	padding:12px 14px;
	border:1px solid var(--rd-border-strong);
	border-radius:12px;
	background:
		linear-gradient(180deg, rgba(20, 98, 77, 0.06) 0%, rgba(255,255,255,0.98) 100%);
	margin-bottom:10px;
	box-shadow:0 10px 24px rgba(17, 24, 39, 0.05);
}
.rd-walkin-confirm {
	border:1px solid var(--border-color);
	border-radius:8px;
	background:var(--card-bg);
	padding:10px;
}
.rd-walkin-token-hero {
	display:flex;
	align-items:flex-start;
	justify-content:space-between;
	gap:12px;
}
.rd-walkin-token-badge {
	display:flex;
	flex-direction:column;
	gap:4px;
	min-width:84px;
}
.rd-walkin-token-badge .token-label {
	font-size:10px;
	font-weight:800;
	text-transform:uppercase;
	letter-spacing:.08em;
	color:var(--rd-primary);
}
.rd-walkin-token-badge .token-value {
	font-size:34px;
	line-height:1;
	font-weight:900;
	color:var(--rd-primary);
}
.rd-walkin-stage-card {
	border:1px solid var(--rd-border);
	border-radius:12px;
	background:linear-gradient(180deg, rgba(255,255,255,.98) 0%, rgba(247,250,248,.96) 100%);
	padding:12px 14px;
	box-shadow:0 8px 20px rgba(17, 24, 39, 0.04);
}
.rd-walkin-stage-title {
	font-size:14px;
	font-weight:800;
	color:var(--rd-text);
	margin-bottom:4px;
}
.rd-walkin-stage-meta {
	font-size:11px;
	color:#5f6d67;
	margin-bottom:10px;
}
.rd-walkin-board-shell {
	border:1px solid var(--rd-border);
	border-radius:14px;
	background:
		linear-gradient(180deg, rgba(20, 98, 77, 0.04) 0%, rgba(255,255,255,0.98) 100%);
	padding:14px;
	box-shadow:0 12px 28px rgba(17, 24, 39, 0.05);
	min-height:100%;
}
.rd-walkin-board-head {
	display:flex;
	align-items:flex-start;
	justify-content:space-between;
	gap:12px;
	margin-bottom:12px;
}
.rd-walkin-board-copy {
	display:flex;
	flex-direction:column;
	gap:4px;
}
.rd-walkin-board-title {
	font-size:15px;
	font-weight:800;
	color:var(--rd-text);
}
.rd-walkin-board-grid {
	display:flex;
	flex-wrap:wrap;
	gap:7px;
	align-content:flex-start;
}
.rd-walkin-board-groups {
	display:flex;
	flex-direction:column;
	gap:12px;
}
.rd-walkin-board-group {
	display:flex;
	flex-direction:column;
	gap:8px;
}
.rd-walkin-board-band {
	display:flex;
	align-items:center;
	justify-content:space-between;
	gap:8px;
	padding-top:2px;
}
.rd-walkin-board-band-title {
	font-size:12px;
	font-weight:800;
	text-transform:uppercase;
	letter-spacing:.06em;
	color:var(--rd-primary);
}
@media (max-width: 1600px) {
	.rd-shell-grid {
		grid-template-columns:minmax(470px, 1.1fr) minmax(380px, 1fr) 300px;
	}
	#rd-root.phone-mode:not(.board-open) .rd-shell-grid {
		grid-template-columns:minmax(560px, 1.45fr) minmax(330px, .95fr);
	}
	#rd-root.phone-mode.board-open .rd-shell-grid {
		grid-template-columns:minmax(470px, 1.05fr) minmax(330px, .88fr) minmax(310px, .92fr);
	}
	#rd-root.walkin-mode .rd-shell-grid {
		grid-template-columns:minmax(0, 2.2fr) minmax(300px, 1fr);
	}
}
@media (max-width: 1280px) {
	.rd-shell-grid {
		grid-template-columns:minmax(440px, 1fr) minmax(320px, .9fr) 280px;
	}
	#rd-root.phone-mode:not(.board-open) .rd-shell-grid {
		grid-template-columns:minmax(460px, 1.2fr) minmax(300px, .9fr);
	}
	#rd-root.phone-mode.board-open .rd-shell-grid {
		grid-template-columns:minmax(400px, 1fr) minmax(300px, .86fr) 280px;
	}
	#rd-root.walkin-mode .rd-shell-grid {
		grid-template-columns:minmax(0, 1.9fr) minmax(280px, .95fr);
	}
	.rd-availability-group-grid {
		grid-template-columns:1fr;
	}
}
.rd-session-tile {
	border: 1px solid var(--rd-border);
	border-radius: 10px;
	background: linear-gradient(180deg, var(--rd-panel) 0%, var(--rd-panel-tint) 100%);
	padding: 10px 12px;
	box-shadow: 0 1px 2px rgba(17, 24, 39, 0.03);
	display:flex;
	flex-direction:column;
	gap:10px;
}
.rd-session-tile.is-active {
	border-color: #2563eb;
	background: linear-gradient(180deg, #eff6ff 0%, var(--rd-panel) 100%);
	box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12), 0 8px 18px rgba(37, 99, 235, 0.05);
}
.rd-session-tile.is-recommended {
	border-color: #16a34a;
	background: linear-gradient(180deg, rgba(223, 242, 234, 0.95) 0%, var(--rd-panel) 100%);
}
.rd-session-tile.is-active.is-recommended {
	border-color: #2563eb;
	background: linear-gradient(180deg, #eff6ff 0%, var(--rd-panel) 100%);
}
.rd-session-tile-top {
	display:flex;
	align-items:flex-start;
	justify-content:space-between;
	gap:10px;
}
.rd-session-tile-doctor {
	min-width:0;
}
.rd-session-tile-middle {
	display:flex;
	align-items:flex-end;
	justify-content:space-between;
	gap:10px;
	flex-wrap:wrap;
}
.rd-session-tile-slots {
	display:flex;
	flex-direction:column;
	gap:2px;
}
.rd-session-tile-chips {
	display:flex;
	gap:6px;
	flex-wrap:wrap;
	align-items:flex-start;
}
.rd-session-tile-actions {
	display:flex;
	gap:6px;
	justify-content:flex-end;
}
.rd-session-inline-form {
	margin-top:10px;
	padding-top:10px;
	border-top:1px solid var(--border-color);
}
.rd-session-tile-footer {
	margin-top:8px;
	padding-top:8px;
	border-top:1px solid rgba(37, 99, 235, 0.16);
	display:grid;
	grid-template-columns:auto minmax(0, 1fr) auto;
	align-items:center;
	justify-content:space-between;
	gap:10px;
}
.rd-session-footer-status {
	display:flex;
	align-items:center;
}
.rd-session-footer-center {
	display:flex;
	flex-direction:column;
	align-items:center;
	justify-content:center;
	gap:3px;
	text-align:center;
	min-width:0;
}
.rd-session-token-pill {
	display:flex;
	align-items:baseline;
	gap:6px;
	padding:5px 10px;
	border-radius:10px;
	background:rgba(37, 99, 235, 0.08);
	border:1px solid rgba(37, 99, 235, 0.14);
}
.rd-session-token-label {
	font-size:10px;
	font-weight:800;
	text-transform:uppercase;
	letter-spacing:.08em;
	color:#1d4ed8;
}
.rd-session-token-value {
	font-size:28px;
	line-height:1;
	font-weight:900;
	color:#1d4ed8;
}
.rd-session-eta {
	font-size:12px;
	font-weight:700;
	color:#1e40af;
	background:rgba(37, 99, 235, 0.08);
	border-radius:999px;
	padding:3px 8px;
	white-space:nowrap;
}
.rd-availability-selection-dock {
	margin-top:10px;
	padding:10px 12px;
	border:1px solid var(--rd-border-strong);
	border-radius:10px;
	background:linear-gradient(180deg, #eff6ff 0%, var(--rd-panel) 100%);
	box-shadow:0 1px 2px rgba(17, 24, 39, 0.03);
}
.rd-availability-selection-copy {
	display:flex;
	flex-direction:column;
	gap:2px;
	min-width:220px;
}
.rd-availability-selection-meta {
	display:flex;
	align-items:center;
	gap:8px;
	flex-wrap:wrap;
}
.rd-selection-badge {
	display:inline-flex;
	align-items:center;
	padding:2px 7px;
	border-radius:999px;
	font-size:10px;
	font-weight:800;
	background:#1d4ed8;
	color:#fff;
}
@media (max-width: 1280px) {
	.rd-availability-group-grid {
		grid-template-columns:1fr;
	}
}
.rd-scan-chip {
	display:inline-flex;
	align-items:center;
	gap:4px;
	padding:3px 8px;
	border-radius:999px;
	font-size:10px;
	font-weight:700;
	white-space:nowrap;
}
.rd-scan-chip.stress-low { background:#dcfce7; color:#15803d; }
.rd-scan-chip.stress-mid { background:#fef3c7; color:#b45309; }
.rd-scan-chip.stress-high { background:#fee2e2; color:#b91c1c; }
.rd-scan-chip.fit-chip { background:var(--rd-blue-tint); color:#1d4ed8; }
.rd-scan-chip.hour-chip { background:#eef2f1; color:#42514a; }
.rd-best-badge {
	display:inline-flex;
	align-items:center;
	padding:2px 7px;
	border-radius:999px;
	font-size:10px;
	font-weight:800;
	background:#166534;
	color:#fff;
	margin-bottom:6px;
}

/* typography helpers */
.rd-label {
	font-size: 10px; font-weight: 700; color: var(--rd-muted);
	text-transform: uppercase; letter-spacing: 1px;
}
.rd-caption { font-size: 11px; color: var(--rd-muted); }

/* workspace mode switch */
#rd-mode-bar {
	flex-shrink: 0;
	display: flex;
	align-items: stretch;
	gap: 0;
	padding: 10px 20px;
	background: var(--rd-panel);
	border-bottom: 1px solid var(--rd-border);
}
.rd-mode-btn {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 2px;
	padding: 8px 20px;
	border: 1.5px solid var(--rd-border);
	background: transparent;
	cursor: pointer;
	font-size: 13px;
	font-weight: 700;
	color: var(--rd-muted);
	transition: all .15s;
	border-radius: 0;
	min-width: 180px;
}
.rd-mode-btn:first-child { border-radius: 8px 0 0 8px; }
.rd-mode-btn:last-child  { border-radius: 0 8px 8px 0; border-left: none; }
.rd-mode-btn .rd-mode-sub {
	font-size: 10px;
	font-weight: 500;
	color: var(--rd-muted);
	opacity: 0.7;
}
.rd-mode-btn.active {
	background: var(--rd-primary);
	border-color: var(--rd-primary);
	color: #fff;
}
.rd-mode-btn.active .rd-mode-sub { color: rgba(255,255,255,0.75); opacity: 1; }
.rd-mode-btn:not(.active):hover {
	background: var(--rd-panel-soft);
	color: var(--rd-text);
}

/* step indicator */
.rd-step {
	flex: 1; text-align: center; padding: 6px 4px;
	font-size: 10px; font-weight: 700; color: var(--rd-muted);
	border-bottom: 2px solid var(--rd-border); transition: all .2s;
}
.rd-step.active { color: var(--rd-primary); border-bottom-color: var(--rd-primary); }
.rd-step.done   { color: #16a34a;       border-bottom-color: #16a34a; }

/* inputs */
.rd-input {
	width: 100%; padding: 9px 12px; border: 1.5px solid var(--rd-border);
	border-radius: 7px; font-size: 13px; outline: none;
	background: #fff; color: var(--rd-text);
	transition: border-color .15s, box-shadow .15s, background .15s;
}
.rd-input:focus {
	border-color: var(--rd-primary);
	box-shadow: 0 0 0 3px rgba(20, 98, 77, 0.12);
	background: #fff;
}

/* buttons */
.rd-btn-primary {
	padding: 9px 20px; border-radius: 7px; border: none;
	background: var(--rd-primary); color: #fff; font-size: 13px;
	font-weight: 600; cursor: pointer; transition: opacity .15s; width: 100%;
}
.rd-btn-primary:hover { opacity: .88; }
.rd-btn-primary:disabled { opacity: .45; cursor: not-allowed; }
.rd-btn-secondary {
	padding: 8px 16px; border-radius: 7px;
	border: 1px solid var(--rd-border-strong); background: var(--rd-panel);
	color: var(--rd-text);
	font-size: 12px; font-weight: 500; cursor: pointer; transition: all .15s;
}
.rd-btn-secondary:hover {
	border-color: var(--rd-primary);
	color: var(--rd-primary);
	background: var(--rd-panel-soft);
}
.rd-btn-subtle {
	padding: 7px 12px;
	border-radius: 7px;
	border: 1px solid var(--rd-border);
	background: transparent;
	color: var(--rd-muted);
	font-size: 11px;
	font-weight: 600;
	cursor: pointer;
	transition: all .15s;
}
.rd-btn-subtle:hover {
	border-color: var(--rd-border-strong);
	color: var(--rd-text);
	background: #fafcfb;
}

/* cards */
.rd-card {
	border: 1px solid var(--rd-border); border-radius: 8px;
	padding: 12px 14px; margin-bottom: 8px; background: var(--rd-panel);
	box-shadow: 0 1px 2px rgba(17, 24, 39, 0.03);
}
.rd-card-selectable {
	border: 1px solid var(--rd-border); border-radius: 8px;
	padding: 12px 14px; margin-bottom: 8px; background: var(--rd-panel);
	cursor: pointer; transition: border-color .15s, box-shadow .15s;
}
.rd-card-selectable:hover {
	border-color: var(--rd-primary); box-shadow: 0 6px 16px rgba(17,24,39,.06);
}
.rd-card-selectable.selected {
	border-color: var(--rd-primary); background: var(--rd-primary-tint);
}

/* child row */
.rd-child-row {
	display: flex; align-items: center; gap: 10px; padding: 10px 12px;
	border-radius: 7px; cursor: pointer; transition: background .1s;
	border: 1.5px solid var(--rd-border); margin-bottom: 6px;
	background: var(--rd-panel);
}
.rd-child-row:hover { background: var(--rd-panel-soft); border-color: var(--rd-primary); }
.rd-child-row.selected { border-color: var(--rd-primary); background: var(--rd-primary-tint); }

/* badges */
.rd-badge {
	padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700;
	display: inline-block;
}
.rd-badge-green  { background: #dcfce7; color: #15803d; }
.rd-badge-amber  { background: #fef9c3; color: #a16207; }
.rd-badge-blue   { background: #dbeafe; color: #1d4ed8; }
.rd-badge-gray   { background: #eef2f1; color: var(--rd-muted); }

/* session offer card */
.rd-session-card {
	border: 1.5px solid var(--rd-primary); border-radius: 10px; padding: 16px;
	background: var(--rd-panel); margin-bottom: 12px;
}

/* confirmation slip */
.rd-confirm-slip {
	border: 2px solid #16a34a; border-radius: 10px; padding: 18px;
	background: #f0fdf4; text-align: center;
}

/* spinner */
.rd-spinner {
	display: inline-block; width: 18px; height: 18px;
	border: 2px solid var(--rd-border); border-top-color: var(--rd-primary);
	border-radius: 50%; animation: rd-spin .6s linear infinite;
}
@keyframes rd-spin { to { transform: rotate(360deg); } }

/* token board cells */
.rd-token-cell {
	width: 38px; height: 38px; border-radius: 6px; border: 1.5px solid;
	display: flex; flex-direction: column; align-items: center; justify-content: center;
	font-size: 10px; font-weight: 700; cursor: default;
	transition: box-shadow .1s; position: relative; flex-shrink: 0;
}
.rd-token-cell.has-eta {
	width: 54px;
	height: 40px;
	padding: 0;
	border-radius: 10px;
	background: #f8fcfa;
	box-shadow: 0 1px 2px rgba(17, 24, 39, 0.03);
}
.rd-token-cell.clickable { cursor: pointer; }
.rd-token-cell.clickable:hover { box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.10), 0 6px 14px rgba(17, 24, 39, 0.05); }
.rd-token-cell.recommended {
	box-shadow: 0 0 0 3px var(--primary) !important;
}
.rd-token-cell.override-selected {
	box-shadow: 0 0 0 3px #0f766e !important;
	border-color: #0f766e !important;
	background: linear-gradient(180deg, rgba(13, 148, 136, 0.16) 0%, rgba(240, 253, 250, 1) 100%) !important;
}
.rd-token-cell .rd-cell-sub {
	font-size: 7px; font-weight: 400; line-height: 1; margin-top: 1px;
}
.rd-token-cell .rd-cell-eta {
	font-size: 8px;
	font-weight: 700;
	line-height: 1.1;
	margin-top: 2px;
	opacity: .9;
}
.rd-token-cell .rd-cell-report {
	display:none;
}
.rd-token-cell.has-eta > span:first-child {
	font-size: 15px;
	font-weight: 900;
	line-height: 1;
}

/* detail drawer */
.rd-drawer-section { margin-bottom: 14px; }
.rd-drawer-section .rd-label { margin-bottom: 4px; }
.rd-drawer-section .rd-val { font-size: 14px; font-weight: 600; }

/* live session panel */
.rd-pipeline-section { margin-bottom: 14px; }
.rd-pipeline-header {
	font-size: 10px; font-weight: 800; text-transform: uppercase;
	letter-spacing: 1px; color: var(--rd-muted);
	padding: 5px 0 7px; border-bottom: 1px solid rgba(185, 201, 192, 0.75);
	margin-bottom: 7px;
}
.rd-pipeline-header.is-urgent {
	color:#b91c1c;
	border-bottom-color:rgba(248, 113, 113, 0.45);
}
.rd-pipeline-header.is-active {
	color:#1d4ed8;
	border-bottom-color:rgba(59, 130, 246, 0.4);
}
.rd-pipeline-header.is-ready {
	color:#7c3aed;
	border-bottom-color:rgba(168, 85, 247, 0.35);
}
.rd-pipeline-header.is-arrived {
	color:#0369a1;
	border-bottom-color:rgba(14, 165, 233, 0.45);
}
.rd-pipeline-header.is-due {
	color:#64726c;
	border-bottom-color:rgba(185, 201, 192, 0.9);
}
.rd-pipeline-header.is-passive {
	color:var(--rd-muted);
	border-bottom-color:rgba(185, 201, 192, 0.45);
}
@keyframes rd-pulse {
	0%, 100% { opacity: 1; }
	50%       { opacity: 0.3; }
}
.rd-in-session-dot {
	display:inline-block;
	width:6px; height:6px;
	border-radius:50%;
	background:#16a34a;
	margin-right:5px;
	vertical-align:middle;
	animation:rd-pulse 2s ease-in-out infinite;
}
.rd-patient-card {
	border: 1px solid var(--rd-border); border-radius: 10px;
	padding: 8px 10px; margin-bottom: 6px;
	background: linear-gradient(180deg, rgba(255,255,255,.99) 0%, rgba(248,250,249,.96) 100%);
	box-shadow: 0 8px 18px rgba(17, 24, 39, 0.05);
}
.rd-patient-card.with-doctor {
	border-color: #cbd5e1; background: #f8fafc; opacity: 0.82;
}
.rd-patient-card.ready   { border-color: #7c3aed; background: #faf5ff; }
.rd-patient-card.called  { border-color: #1d4ed8; border-left: 3px solid #1d4ed8; background: #eff6ff; overflow: hidden; }
.rd-patient-card.no-resp { border-color: #ea580c; background: #fff7ed; }
.rd-patient-card.emergency {
	border-color:#ef4444;
	border-left:3px solid #dc2626;
	background:linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%);
}
.rd-action-btn {
	padding: 4px 10px; border-radius: 7px; font-size: 11px; font-weight: 700;
	cursor: pointer; border: 1.5px solid; transition: all .15s; white-space: nowrap;
}
.rd-action-btn:hover { opacity: .85; }
.rd-action-btn-green  { border-color: #16a34a; color: #15803d; background: transparent; }
.rd-action-btn-green:hover  { background: #16a34a; color: #fff; }
.rd-action-btn-blue   { border-color: #1d4ed8; color: #1e40af; background: transparent; }
.rd-action-btn-blue:hover   { background: #1d4ed8; color: #fff; }
.rd-action-btn-orange { border-color: #ea580c; color: #9a3412; background: transparent; }
.rd-action-btn-orange:hover { background: #ea580c; color: #fff; }
.rd-action-btn-red    { border-color: #dc2626; color: #991b1b; background: transparent; }
.rd-action-btn-red:hover    { background: #dc2626; color: #fff; }
.rd-rail-utility-btn {
	padding: 5px 9px;
	border-radius: 8px;
	font-size: 11px;
	font-weight: 700;
}
.rd-rail-btn-primary {
	background:#16a34a;
	color:#fff;
	border-color:#16a34a;
	box-shadow:0 6px 14px rgba(22, 163, 74, 0.16);
}
.rd-rail-btn-primary:hover {
	opacity:.92;
}
.rd-rail-btn-positive {
	background:#f0fdf4;
}
.rd-rail-btn-warning {
	background:#fff7ed;
}
.rd-rail-btn-neutral {
	background:#fff;
	border-color:#cbd5e1;
	color:#64748b;
}
.rd-rail-btn-neutral:hover {
	background:#f8fafc;
	color:#334155;
	border-color:#94a3b8;
}
.rd-emergency-token {
	font-size: 22px;
	font-weight: 900;
	line-height: 1;
	color: #b91c1c;
}
.rd-emergency-status {
	display:inline-flex;
	align-items:center;
	padding:2px 8px;
	border-radius:999px;
	font-size:10px;
	font-weight:800;
	text-transform:uppercase;
	letter-spacing:.05em;
	background:#fee2e2;
	color:#b91c1c;
	margin-bottom:6px;
}
.rd-rail-token {
	font-size:18px;
	font-weight:900;
	line-height:1;
	letter-spacing:-0.02em;
}
.rd-rail-card-title {
	font-size:12px;
	font-weight:800;
	color:var(--rd-text);
}
.rd-rail-card-meta {
	font-size:11px;
	color:#64726c;
	margin-top:2px;
}
.rd-rail-card-side {
	display:flex;
	flex-direction:column;
	align-items:flex-end;
	justify-content:center;
	gap:4px;
	text-align:right;
}
.rd-due-soon-block {
	border:1px dashed rgba(185, 201, 192, 0.95);
	border-radius:10px;
	background:linear-gradient(180deg, rgba(255,255,255,.98) 0%, rgba(245, 248, 246, .95) 100%);
	padding:10px;
	box-shadow:0 4px 12px rgba(15, 23, 42, 0.03);
}
.rd-due-soon-copy {
	font-size:11px;
	color:#64726c;
	margin-bottom:8px;
}
.rd-due-token-chip {
	display:inline-flex;
	align-items:center;
	justify-content:center;
	padding:5px 10px;
	border-radius:8px;
	background:#ffffff;
	border:1px solid rgba(203, 213, 225, 0.95);
	box-shadow:0 2px 8px rgba(15, 23, 42, 0.04);
	font-size:12px;
	font-weight:800;
	cursor:pointer;
	transition:all .15s;
}
.rd-due-token-chip:hover {
	border-color:#93c5fd;
	background:#eff6ff;
	color:#1d4ed8;
}
.rd-due-soon-row {
	display:flex;align-items:center;gap:8px;
	padding:6px 8px;border-radius:8px;
	background:#fff;border:1px solid rgba(203,213,225,.9);
	cursor:pointer;transition:all .15s;
}
.rd-due-soon-row:hover { border-color:#93c5fd; background:#eff6ff; }
.rd-due-token-num {
	font-size:13px;font-weight:800;min-width:56px;
	color:var(--rd-text);flex-shrink:0;
}
.rd-due-load-badge {
	display:inline-block;padding:1px 6px;border-radius:999px;
	font-size:9px;font-weight:800;letter-spacing:.04em;margin-left:5px;
}
.rd-recep-form {
	margin-top: 8px;
	padding: 10px;
	border-radius: 10px;
	background: linear-gradient(180deg, rgba(255,255,255,.96) 0%, rgba(241, 247, 244, .92) 100%);
	border: 1px solid rgba(185, 201, 192, 0.95);
	box-shadow: inset 0 1px 0 rgba(255,255,255,.6);
}
.rd-recep-input {
	padding: 8px 10px;
	border: 1.5px solid #d7e0db;
	border-radius: 8px;
	font-size: 12px;
	outline: none;
	background: var(--rd-panel-tint);
	width: 100%;
	color: var(--rd-text);
	min-height: 36px;
	transition: border-color .15s, box-shadow .15s;
}
.rd-recep-input:focus {
	border-color: var(--rd-primary);
	box-shadow: 0 0 0 3px rgba(20, 98, 77, 0.12);
}
.rd-recep-head {
	display:flex;
	align-items:center;
	justify-content:space-between;
	gap:8px;
	margin-bottom:8px;
}
.rd-recep-head-title {
	font-size:12px;
	font-weight:700;
	letter-spacing:.01em;
	color:var(--rd-text);
}
.rd-recep-fee-band {
	font-size:11px;
	font-weight:700;
	border-radius:8px;
	padding:6px 8px;
	margin-bottom:8px;
}
.rd-recep-fee-band.covered {
	color:#166534;
	background:#f0fdf4;
	border:1px solid #bbf7d0;
}
.rd-recep-fee-band.due {
	color:#b45309;
	background:#fffbeb;
	border:1px solid #fde68a;
}
.rd-recep-fee-band.pending {
	color:#64748b;
	background:#f8fafc;
	border:1px solid #e2e8f0;
}
.rd-recep-actions {
	display:flex;
	gap:6px;
	align-items:center;
}
.rd-walkin-panel {
	padding: 10px 12px;
	border: 1px solid var(--rd-border);
	border-radius: 8px;
	background: var(--rd-panel);
	box-shadow: 0 1px 2px rgba(17, 24, 39, 0.03);
}
.rd-walkin-note {
	margin-top: 8px;
	padding: 5px 8px;
	border-radius: 6px;
	background: #fff9e8;
	border: 1px solid #f0c97f;
	font-size: 11px;
	color: #92400e;
}
.rd-walkin-rows {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.rd-context-strip {
	border: 1px solid var(--rd-border);
	border-radius: 10px;
	background: linear-gradient(180deg, var(--rd-panel) 0%, var(--rd-panel-tint) 100%);
	padding: 10px 12px;
	margin-bottom: 12px;
	box-shadow: 0 1px 2px rgba(17, 24, 39, 0.03);
}
.rd-context-strip-head {
	display:flex;
	align-items:center;
	justify-content:space-between;
	gap:10px;
	flex-wrap:wrap;
}
.rd-context-strip-title {
	font-size: 13px;
	font-weight: 700;
	color: var(--rd-text);
}
.rd-context-strip-meta {
	display:flex;
	align-items:center;
	gap:8px;
	flex-wrap:wrap;
	margin-top:6px;
}
.rd-context-strip.is-collapsed .rd-context-details {
	display:none;
}
.rd-context-details {
	margin-top:10px;
	padding-top:10px;
	border-top:1px solid var(--rd-border);
}
.rd-flow-stack {
	display:flex;
	flex-direction:column;
	gap:12px;
	width:min(760px, 100%);
	margin:0 auto;
}
.rd-flow-card {
	border: 1px solid var(--rd-border);
	border-radius: 10px;
	background: var(--rd-panel);
	padding: 12px 14px;
	box-shadow: 0 1px 2px rgba(17, 24, 39, 0.03);
}
.rd-flow-card-soft {
	background: linear-gradient(180deg, var(--rd-panel) 0%, var(--rd-panel-tint) 100%);
}
.rd-flow-card-head {
	display:flex;
	align-items:flex-start;
	justify-content:space-between;
	gap:10px;
	flex-wrap:wrap;
	margin-bottom:10px;
}
.rd-flow-card-title {
	font-size:13px;
	font-weight:700;
	color:var(--rd-text);
}
.rd-flow-field-grid {
	display:grid;
	grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);
	gap:8px;
}
.rd-flow-action-row {
	display:flex;
	align-items:center;
	justify-content:center;
	gap:8px;
	flex-wrap:wrap;
}
.rd-ops-rail {
	display:flex;
	flex-direction:column;
	gap:10px;
	padding:10px;
	border-bottom:1px solid var(--rd-border);
	background:
		linear-gradient(180deg, rgba(20, 98, 77, 0.09) 0%, rgba(20, 98, 77, 0.03) 100%),
		linear-gradient(180deg, #f4f8f6 0%, #eef4f1 100%);
}
.rd-ops-head {
	display:flex;
	align-items:flex-start;
	justify-content:space-between;
	gap:10px;
}
.rd-ops-actions {
	display:flex;
	flex-direction:column;
	gap:8px;
}
.rd-ops-action-btn {
	border-radius:999px;
	padding:7px 12px;
	font-size:12px;
	font-weight:700;
	cursor:pointer;
	white-space:nowrap;
}
.rd-ops-action-btn.phone {
	border:1px solid #fdba74;
	background:#fff7ed;
	color:#9a3412;
}
.rd-ops-action-btn.emergency {
	border:none;
	background:#b91c1c;
	color:#fff;
	box-shadow:0 8px 20px rgba(185,28,28,0.18);
}
.rd-ops-summary-grid {
	display:grid;
	grid-template-columns:repeat(2, minmax(0, 1fr));
	gap:8px;
}
.rd-ops-summary-card {
	border:1px solid var(--rd-border);
	border-radius:12px;
	background:linear-gradient(180deg, rgba(255,255,255,.98) 0%, rgba(246, 250, 247, .94) 100%);
	padding:10px 12px;
	box-shadow:0 12px 28px rgba(17, 24, 39, 0.07);
}
.rd-ops-session-list {
	display:flex;
	flex-direction:column;
	gap:6px;
	max-height:152px;
	overflow-y:auto;
}
.rd-ops-session-chip {
	display:flex;
	align-items:flex-start;
	justify-content:space-between;
	gap:10px;
	padding:10px 11px;
	border-radius:10px;
	border:1px solid var(--rd-border);
	background:rgba(255,255,255,.98);
	font-size:11px;
	font-weight:600;
	box-shadow:0 6px 14px rgba(15, 23, 42, 0.05);
}
.rd-ops-session-chip.active {
	border-color:#86efac;
	background:linear-gradient(180deg, #f5fff8 0%, #ecfdf3 100%);
}
.rd-ops-session-chip.paused {
	border-color:#fcd34d;
	background:linear-gradient(180deg, #fffdf4 0%, #fffbeb 100%);
}
.rd-ops-session-code {
	font-size:12px;
	font-weight:800;
	color:var(--rd-text);
	white-space:nowrap;
	overflow:hidden;
	text-overflow:ellipsis;
}
.rd-ops-session-meta {
	font-size:11px;
	color:#607069;
	margin-top:2px;
	white-space:nowrap;
	overflow:hidden;
	text-overflow:ellipsis;
}
.rd-ops-lozenge {
	display:inline-flex;
	align-items:center;
	justify-content:center;
	padding:2px 8px;
	border-radius:999px;
	font-size:10px;
	font-weight:800;
	letter-spacing:.04em;
	text-transform:uppercase;
}
.rd-ops-lozenge.live {
	background:#dcfce7;
	color:#15803d;
}
.rd-ops-lozenge.paused {
	background:#fef3c7;
	color:#b45309;
}
.rd-ops-session-token {
	font-size:18px;
	font-weight:900;
	line-height:1.1;
	color:var(--rd-text);
	margin-top:7px;
	text-align:right;
}
.rd-live-session-chip {
	display:inline-flex;
	align-items:center;
	gap:5px;
	padding:4px 9px;
	border-radius:999px;
	border:1.5px solid var(--rd-border);
	background:var(--card-bg);
	font-size:11px;
	font-weight:700;
	cursor:pointer;
	white-space:nowrap;
	transition:border-color .15s, background .15s;
}
.rd-live-session-chip:hover {
	border-color:#94a3b8;
	background:#f8fafc;
}
.rd-live-session-chip.is-active {
	border-color:var(--primary);
	background:rgba(15,92,77,.08);
	color:var(--primary);
}
.rd-live-session-chip.is-active-status { border-color:#86efac; background:#ecfdf3; }
.rd-live-session-chip.is-paused-status { border-color:#fcd34d; background:#fffbeb; }
.rd-live-chip-dot {
	width:7px; height:7px; border-radius:50%; flex-shrink:0;
}
.rd-live-chip-dot.active  { background:#16a34a; }
.rd-live-chip-dot.paused  { background:#d97706; }
.rd-live-chip-dot.scheduled { background:#94a3b8; }
.rd-live-chip-badge {
	display:inline-flex;align-items:center;justify-content:center;
	min-width:16px;height:16px;padding:0 4px;
	border-radius:999px;font-size:9px;font-weight:800;
	line-height:1;
}
.rd-live-chip-badge.emerg { background:#fee2e2; color:#b91c1c; }
.rd-live-chip-badge.arrived { background:#dbeafe; color:#1d4ed8; }
.rd-live-chip-badge.active-ct { background:#f1f5f9; color:#475569; }
.rd-live-chip-token {
	font-size:10px; font-weight:800; color:var(--primary);
	letter-spacing:.02em; margin-left:2px;
}
.rd-ops-stat-grid {
	display:grid;
	grid-template-columns:repeat(2, minmax(0, 1fr));
	gap:8px;
	margin-top:8px;
}
.rd-ops-stat-tile {
	border:1px solid rgba(217, 225, 220, 0.95);
	border-radius:10px;
	background:rgba(255,255,255,.98);
	padding:9px 10px;
	min-height:68px;
	display:flex;
	flex-direction:column;
	justify-content:space-between;
	box-shadow:0 6px 16px rgba(15, 23, 42, 0.05);
}
.rd-ops-stat-tile.emergency {
	border-color:#fecaca;
	background:linear-gradient(180deg, #fff8f8 0%, #fff3f3 100%);
}
.rd-ops-stat-label {
	font-size:10px;
	font-weight:800;
	text-transform:uppercase;
	letter-spacing:.06em;
	color:var(--rd-muted);
}
.rd-ops-stat-value {
	font-size:26px;
	line-height:1;
	font-weight:900;
	letter-spacing:-.02em;
	color:var(--rd-text);
}
.rd-ops-stat-note {
	font-size:10px;
	color:#73807a;
}
.rd-intake-hint {
	border:1px solid var(--rd-border);
	border-radius:10px;
	background:linear-gradient(180deg, rgba(20, 98, 77, 0.04) 0%, rgba(255,255,255,0.95) 100%);
	padding:12px 14px;
	box-shadow:0 8px 20px rgba(17, 24, 39, 0.03);
}
.rd-intake-hint-grid {
	display:grid;
	grid-template-columns:repeat(2, minmax(0, 1fr));
	gap:10px;
	margin-top:10px;
}
.rd-intake-hint-card {
	border:1px solid rgba(217, 225, 220, 0.9);
	border-radius:9px;
	background:rgba(255,255,255,.88);
	padding:10px 11px;
}
.rd-intake-hint-title {
	font-size:11px;
	font-weight:800;
	color:var(--rd-text);
	margin-bottom:4px;
}
#rd-left {
	background:linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(244,246,245,0.92) 100%);
}
#rd-right {
	background:linear-gradient(180deg, rgba(247,250,248,0.9) 0%, rgba(244,246,245,0.95) 100%);
}
</style>

<div id="rd-root" style="display:flex;flex-direction:column;height:calc(100vh - 60px);overflow:hidden;">

	<!-- ── TOP BAR ─────────────────────────────────────────────────────────── -->
	<div id="rd-topbar" class="rd-topbar-shell">
		<div class="rd-topbar-title">
			<div class="rd-topbar-kicker">Reception Control</div>
			<div id="rd-topbar-heading" class="rd-topbar-heading">Phone Booking Workspace</div>
		</div>
		<div class="rd-topbar-meta">
			<span id="rd-topbar-date"></span>
			<span id="rd-topbar-doctor"></span>
		</div>
	</div>

	<!-- ── MODE SWITCH ──────────────────────────────────────────────────────── -->
	<div id="rd-mode-bar">
		<button class="rd-mode-btn active" data-channel="phone">
			Phone Booking
			<span class="rd-mode-sub">Multi-day booking</span>
		</button>
		<button class="rd-mode-btn" data-channel="walkin">
			Walk-in Intake
			<span class="rd-mode-sub">Today's fast intake</span>
		</button>
	</div>

	<!-- ── THREE-COLUMN BODY ────────────────────────────────────────────────── -->
	<div class="rd-shell-grid">

		<!-- LEFT: Admission Panel ─────────────────────────────────────────── -->
		<div id="rd-left"
			style="display:flex;flex-direction:column;overflow:hidden;
				border-right:1px solid var(--border-color);">

			<!-- Left header -->
			<div style="padding:10px 16px;border-bottom:1px solid var(--border-color);flex-shrink:0;
				display:flex;align-items:center;justify-content:space-between;">
				<div>
					<div class="rd-label">Task Workspace</div>
					<div id="rd-workspace-subtitle" class="rd-caption" style="margin-top:2px;">Phone intake and booking flow</div>
				</div>
				<label id="rd-special-label"
					style="display:flex;align-items:center;gap:5px;cursor:pointer;
						font-size:12px;font-weight:600;color:var(--text-muted);
						white-space:nowrap;"
					title="Mark this patient as Special for later doctor-side priority handling">
					<input type="checkbox" id="rd-special-toggle" style="cursor:pointer;">
					Special
				</label>
			</div>

			<!-- Step indicator -->
			<div id="rd-steps"
				style="display:flex;border-bottom:1px solid var(--border-color);flex-shrink:0;">
				<div class="rd-step active" data-step="search">Search</div>
				<div class="rd-step" data-step="guardian">Guardian</div>
				<div class="rd-step" data-step="child">Child</div>
				<div class="rd-step" data-step="session">Session</div>
				<div class="rd-step" data-step="confirm">Confirm</div>
			</div>

			<!-- Left body — admission flow renders here -->
			<div id="rd-admission-body" style="flex:1;overflow-y:auto;padding:12px 14px;"></div>
		</div>

		<!-- CENTER: Token Board ─────────────────────────────────────────── -->
		<div id="rd-center"
			style="display:flex;flex-direction:column;overflow:hidden;
				border-right:1px solid var(--border-color);">
			<!-- Board header: session selector + refresh -->
			<div style="padding:8px 12px;border-bottom:1px solid var(--border-color);
				flex-shrink:0;display:flex;align-items:center;gap:8px;">
				<span class="rd-label" style="flex-shrink:0;">Token Board</span>
				<div id="rd-board-session-label" class="rd-caption"
					style="flex:1;font-weight:600;white-space:nowrap;overflow:hidden;
						text-overflow:ellipsis;">Select a session…</div>
				<select id="rd-board-session" style="display:none;flex:1;padding:5px 8px;
					border:1.5px solid var(--border-color);border-radius:6px;
					font-size:12px;background:var(--input-bg);outline:none;">
					<option value="">Select session…</option>
				</select>
				<button id="rd-board-close" title="Close token board"
					style="display:none;border:none;background:transparent;cursor:pointer;
						color:var(--text-muted);font-size:16px;line-height:1;
						padding:0 4px;flex-shrink:0;">✕</button>
				<button id="rd-board-refresh" title="Refresh"
					style="border:none;background:transparent;cursor:pointer;
						color:var(--text-muted);font-size:18px;line-height:1;
						padding:0 4px;flex-shrink:0;">⟳</button>
			</div>
			<!-- Legend -->
			<div id="rd-board-legend"
				style="padding:5px 12px;border-bottom:1px solid var(--border-color);
					flex-shrink:0;display:flex;gap:10px;flex-wrap:wrap;"></div>
			<!-- Grid / drawer area -->
			<div id="rd-board-main" style="flex:1;overflow:hidden;position:relative;">
				<div id="rd-board-grid"
					style="height:100%;overflow-y:auto;padding:12px;"></div>
				<div id="rd-board-context"
					style="display:none;overflow-y:auto;background:var(--card-bg);"></div>
				<!-- Detail drawer overlays the grid -->
				<div id="rd-board-drawer"
					style="position:absolute;top:0;left:0;right:0;bottom:0;
						background:var(--card-bg);overflow-y:auto;padding:16px;
						display:none;"></div>
			</div>
		</div>

		<!-- RIGHT: Live Session Panel ──────────────────────────────────────── -->
		<div id="rd-right" style="display:flex;flex-direction:column;overflow:hidden;">
			<div class="rd-ops-rail">
				<div class="rd-ops-head">
					<div>
						<div class="rd-label">Operations Rail</div>
						<div class="rd-caption" style="margin-top:3px;">Live queue context stays visible while reception works.</div>
					</div>
					<div class="rd-ops-actions">
						<button id="rd-emergency-alert-btn" class="rd-ops-action-btn phone">Phone Alert</button>
						<button id="rd-emergency-btn" class="rd-ops-action-btn emergency">Issue Emergency</button>
					</div>
				</div>
				<div class="rd-ops-summary-grid" style="grid-template-columns:1fr;">
					<div class="rd-ops-summary-card">
						<div class="rd-label">Live Snapshot</div>
						<div id="rd-live-counts" style="display:flex;flex-direction:column;gap:4px;margin-top:6px;"></div>
					</div>
				</div>
			</div>
			<!-- Header: urgency session chip bar + refresh -->
			<div style="padding:8px 10px;border-bottom:1px solid var(--border-color);
				flex-shrink:0;display:flex;align-items:center;gap:6px;min-height:44px;">
				<div id="rd-live-session-chips"
					style="flex:1;overflow-x:auto;display:flex;gap:5px;align-items:center;
						scrollbar-width:none;">
					<span class="rd-caption" style="white-space:nowrap;">Loading sessions…</span>
				</div>
				<button id="rd-live-refresh" title="Refresh"
					style="border:none;background:transparent;cursor:pointer;
						color:var(--text-muted);font-size:18px;line-height:1;
						padding:0 4px;flex-shrink:0;">⟳</button>
			</div>
			<!-- Pipeline body -->
			<div id="rd-live-panel" style="flex:1;overflow-y:auto;padding:10px;"></div>
		</div>

	</div>
</div>`;
}


// ─────────────────────────────────────────────────────────────────────────────
// Dashboard controller
// ─────────────────────────────────────────────────────────────────────────────
class ReceptionistDashboard {
	constructor(wrapper) {
		this.$root     = $(wrapper).find('#rd-root');

		this.$topdate  = this.$root.find('#rd-topbar-date');
		this.$topdoc   = this.$root.find('#rd-topbar-doctor');
		this.$topheading = this.$root.find('#rd-topbar-heading');
		this.$workspaceSubtitle = this.$root.find('#rd-workspace-subtitle');
		this.$emergencyAlert = this.$root.find('#rd-emergency-alert-btn');
		this.$emergency = this.$root.find('#rd-emergency-btn');
		this.$body     = this.$root.find('#rd-admission-body');
		this.$steps    = this.$root.find('#rd-steps');
		this.$channels = this.$root.find('#rd-mode-bar');

		// Admission state
		this.state = {
			step:            'search',  // search | guardian_found | guardian_not_found |
			                            // register | child_selected | session_offered | confirmed
			channel:         'phone',   // walkin | phone
			is_special:      false,     // Special priority flag for later queue handling
			mobile:          '',
			guardian:        null,      // {name, guardian_name, mobile, relationship, notes}
			children:        [],        // [{patient, patient_name, dob, age_display}]
			child:           null,      // selected child object
			visit_type:      null,      // result from get_visit_type
			sessions:        [],        // result from get_suggested_sessions
			walkin_preview_sessions: [], // today-only preview sessions for token-first intake
			walkin_preview_loading: false,
			session_idx:     0,         // which session in the list is being offered
			booking:         null,      // result from confirm_booking
			override_token:  null,      // token selected by clicking a cell on the board
			complaint:       null,      // selected Complaint name
			weight_at_booking: null,    // weight in kg (float string)
			age_at_visit:    null,      // age string e.g. "3y 2m"
			phone_context_collapsed: false,
			phone_flow_mode: 'availability', // availability | direct
			phone_inquiry_load_class: 'non_review_load',
			phone_post_session_lookup: false,
			provisional_load_class: null, // walk-in intake guess before actual review/new is confirmed
			walkin_phase:    'token_pick', // token_pick | guardian_result | guardian_missing | register_child | confirm | done
			walkin_notice:   null,      // explicit walk-in state reconciliation message
			token_board_open: false,    // phone mode opens board only for manual token selection
		};

		// Token board (center panel)
		this.token_board = new TokenBoard(this, this.$root.find('#rd-center'));

		// Live session panel (right panel)
		this.live_panel = new LiveSessionPanel(this, this.$root.find('#rd-right'));

		this._bind_channel_tabs();
		this._bind_global_actions();
		this._apply_mode_layout();
		this.load_top_bar();
		this.render_admission();

		// Refresh top bar every 60 seconds
		this._topbar_timer = setInterval(() => this.load_top_bar(), 60000);
	}

	// ── Top bar ──────────────────────────────────────────────────────────────
	load_top_bar() {
		const today = frappe.datetime.get_today();
		// str_to_user second arg is only_time in Frappe v16 — pass false to get date format
		this.$topdate.text(frappe.datetime.str_to_user(today, false, true));

		frappe.call({
			method: 'clinic_flow.api.queue.get_queue_state_for_display',
			args: { dept: 'all' },
			callback: (r) => {
				if (!r.message) return;
				const { sessions } = r.message;
				this.$topdoc.text(
					sessions && sessions.length
						? `${sessions.length} active queue${sessions.length === 1 ? '' : 's'}`
						: 'No active queues'
				);

				// Refresh ETAs for all active sessions every 60 s so report times
				// stay current even when no booking/completion events have fired.
				sessions
					.filter(s => s.session_status === 'Active')
					.forEach(s => {
						frappe.call({
							method: 'clinic_flow.api.eta.recalculate_downstream_etas',
							args: { queue_session: s.session },
							callback: () => {
								// Silently refresh board/panel if they're showing this session
								if (this.token_board && this.token_board.current_session === s.session) {
									this.token_board.refresh();
								}
								if (this.live_panel && this.live_panel.current_session === s.session) {
									this.live_panel.refresh();
								}
							},
						});
					});
			},
		});
	}

	// ── Channel tabs ─────────────────────────────────────────────────────────
	_bind_channel_tabs() {
		this.$channels.on('click', '.rd-mode-btn', (e) => {
			const $btn = $(e.currentTarget);
			this.$channels.find('.rd-mode-btn').removeClass('active');
			$btn.addClass('active');
			this.state.channel = $btn.data('channel');
			this.state.token_board_open = this.state.channel === 'walkin';
			this._reset_to_search();
		});

		this.$root.find('#rd-special-toggle').on('change', (e) => {
			this.state.is_special = e.target.checked;
			// Highlight label when active
			const $lbl = this.$root.find('#rd-special-label');
			$lbl.css('color', this.state.is_special ? '#d97706' : 'var(--text-muted)');
			if (this.state.channel === 'walkin') {
				this.state.walkin_notice = 'Token guidance refreshed because Special mode changed.';
			}
			this._reset_to_search();
		});
	}

	_bind_global_actions() {
		this.$emergency.on('click', () => this._start_emergency_flow('walkin'));
		this.$emergencyAlert.on('click', () => this._start_emergency_flow('phone'));
	}

	_start_emergency_flow(mode) {
		frappe.call({
			method: 'clinic_flow.api.emergency.get_emergency_sessions',
			callback: (r) => {
				const sessions = r.message || [];
				if (!sessions.length) {
					frappe.show_alert({
						message: 'No active session is available for emergency intake right now.',
						indicator: 'orange',
					});
					return;
				}
				const preferredSession = this.live_panel.current_session || sessions[0].name;
				if (sessions.length === 1 || preferredSession) {
					const selected = sessions.find(s => s.name === preferredSession) || sessions[0];
					if (sessions.length === 1 || this.live_panel.current_session) {
						this._run_emergency_action({
							method: mode === 'phone'
								? 'clinic_flow.api.emergency.create_emergency_alert'
								: 'clinic_flow.api.emergency.issue_emergency_token',
							args: { queue_session: selected.name },
							successMessage: mode === 'phone' ? 'Emergency alert created' : 'Emergency token issued',
							indicator: mode === 'phone' ? 'orange' : 'red',
						});
						return;
					}
				}
				this._select_emergency_session(mode, sessions, preferredSession);
			},
		});
	}

	_select_emergency_session(mode, sessions, defaultSession) {
		const dialog = new frappe.ui.Dialog({
			title: mode === 'phone' ? 'Select Session for Emergency Alert' : 'Select Session for Emergency',
			fields: [
				{
					fieldname: 'queue_session',
					fieldtype: 'Select',
					label: 'Active Session',
					options: sessions.map(s => `${s.name}|${s.session_name || s.name}${s.dept_abbr ? ` (${s.dept_abbr})` : ''}`).join('\n'),
					default: defaultSession || sessions[0].name,
					reqd: 1,
				},
				{
					fieldname: 'emergency_note',
					fieldtype: 'HTML',
				},
			],
			primary_action_label: mode === 'phone' ? 'Create Emergency Alert' : 'Issue Emergency Token',
			primary_action: (values) => {
				dialog.hide();
				this._run_emergency_action({
					method: mode === 'phone'
						? 'clinic_flow.api.emergency.create_emergency_alert'
						: 'clinic_flow.api.emergency.issue_emergency_token',
					args: { queue_session: values.queue_session },
					successMessage: mode === 'phone' ? 'Emergency alert created' : 'Emergency token issued',
					indicator: mode === 'phone' ? 'orange' : 'red',
				});
			},
		});
		dialog.fields_dict.emergency_note.$wrapper.html(`
			<div style="font-size:11px;color:var(--text-muted);line-height:1.5;
				background:var(--rd-panel-soft);border:1px solid var(--border-color);
				border-radius:8px;padding:8px 10px;">
				${mode === 'phone'
					? 'This creates only an emergency alert. The real queue entry is created when the patient arrives.'
					: 'This issues the emergency token immediately. Any identity or billing formalities can be completed later.'}
			</div>
		`);
		dialog.show();
	}

	_run_emergency_action({ method, args, successMessage, indicator, refreshSession = null }) {
		frappe.call({
			method,
			args,
			callback: (r) => {
				if (!r.message) return;
				frappe.show_alert({
					message: successMessage,
					indicator: indicator || 'red',
				});
				this.load_top_bar();
				const queueSession = refreshSession || args.queue_session;
				if (queueSession) {
					this.live_panel.load(queueSession);
				}
			}
		});
	}

	_apply_mode_layout() {
		const isWalkin = this.state.channel === 'walkin';
		const boardOpen = isWalkin || !!this.state.token_board_open;
		this.$root.toggleClass('phone-mode', !isWalkin);
		this.$root.toggleClass('walkin-mode', isWalkin);
		this.$root.toggleClass('board-open', boardOpen);
		this.$root.find('#rd-board-close').toggle(!isWalkin && boardOpen);
		this.$topheading.text(isWalkin ? 'Walk-in Intake Workspace' : 'Phone Booking Workspace');
		this.$workspaceSubtitle.text(
			isWalkin
				? 'Live token intake and queue handoff'
				: 'Phone intake, session comparison, and booking'
		);
	}

	// ── Step indicator ───────────────────────────────────────────────────────
	_update_steps(active_step) {
		const order = ['search', 'guardian', 'child', 'session', 'confirm'];
		const active_idx = order.indexOf(active_step);
		this.$steps.find('.rd-step').each(function (i) {
			const $s = $(this);
			$s.removeClass('active done');
			if (i < active_idx)       $s.addClass('done');
			else if (i === active_idx) $s.addClass('active');
		});
	}

	_load_label(loadClass) {
		return loadClass === 'review_load' ? 'Review' : 'New';
	}

	_effective_load_class() {
		if (this.state.channel === 'walkin' && this.state.provisional_load_class) {
			return this.state.provisional_load_class;
		}
		if (this.state.channel === 'phone'
			&& this.state.phone_flow_mode === 'availability'
			&& !this.state.visit_type) {
			return this.state.phone_inquiry_load_class || 'non_review_load';
		}
		return this.state.visit_type?.load_class || 'non_review_load';
	}

	_render_phone_flow_switch() {
		const mode = this.state.phone_flow_mode;
		return `
			<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
				<button class="rd-btn-secondary rd-phone-flow-btn ${mode === 'availability' ? 'is-active' : ''}"
					data-mode="availability"
					style="width:auto;${mode === 'availability' ? 'border-color:var(--rd-primary);background:var(--rd-primary-soft);color:var(--rd-primary);' : ''}">
					Check Availability
				</button>
				<button class="rd-btn-secondary rd-phone-flow-btn ${mode === 'direct' ? 'is-active' : ''}"
					data-mode="direct"
					style="width:auto;${mode === 'direct' ? 'border-color:var(--rd-primary);background:var(--rd-primary-soft);color:var(--rd-primary);' : ''}">
					Direct Booking
				</button>
			</div>
		`;
	}

	// ── Main render dispatcher ───────────────────────────────────────────────
	render_admission() {
		this._apply_mode_layout();
		if (this.state.channel === 'walkin') {
			this.token_board.render_walkin_context();
			return;
		}
		this.$steps.show();
		const step = this.state.step;
		this._update_steps(
			step === 'search'                        ? 'search'  :
			step === 'guardian_found'                ? 'guardian':
			step === 'guardian_not_found'            ? 'guardian':
			step === 'register'                      ? 'guardian':
			step === 'child_selected'                ? 'child'   :
			step === 'session_offered'               ? 'session' :
			step === 'confirmed'                     ? 'confirm' : 'search'
		);

		switch (step) {
		case 'search':
		case 'guardian_found':
		case 'guardian_not_found':
		case 'register':
		case 'child_selected':
			return this._render_phone_progressive_context();
		case 'session_offered':  return this._render_session_offered();
		case 'confirmed':        return this._render_confirmed();
		default:                 return this._render_phone_progressive_context();
		}
	}

	_render_phone_progressive_context() {
		const step = this.state.step;
		const g = this.state.guardian;
		const c = this.state.child;
		const vt = this.state.visit_type;
		const children = this.state.children || [];
		const isRegisterNew = this.state._register_mode === 'new';
		const hasSelectedChildState = !!(c && vt);
		const isCollapsed = !!(hasSelectedChildState && this.state.phone_context_collapsed);
		const isReview = vt && vt.load_class === 'review_load';
		const badgeClass = isReview ? 'rd-badge-green' : 'rd-badge-blue';
		const visitLabel = isReview ? 'Review Patient' : 'New Patient';
		const inAvailabilityMode = this.state.phone_flow_mode === 'availability';
		const inquiryIsReview = this.state.phone_inquiry_load_class === 'review_load';
		const inquiryLabel = inquiryIsReview ? 'Review' : 'New';
		const selectedSession = this.state.sessions[this.state.session_idx] || null;
		const selectedSessionSummary = selectedSession ? [
			selectedSession.practitioner_name || selectedSession.session_name || '',
			selectedSession.session_date ? frappe.datetime.str_to_user(selectedSession.session_date, false, true) : '',
			selectedSession.start_time && selectedSession.end_time ? `${selectedSession.start_time} - ${selectedSession.end_time}` : '',
		].filter(Boolean).join(' · ') : '';
		const selectedSessionMeta = selectedSession ? [
			selectedSession.likely_hour_band || '',
			this.state.override_token ? `Token ${this.state.override_token}` : 'Best token ready',
		].filter(Boolean).join(' · ') : '';
		const childRows = children.length
			? children.map(row => {
				const isSelectedRow = !!(c && c.patient === row.patient);
				const rowDob = isSelectedRow ? (c?.dob || row.dob || '') : (row.dob || '');
				const rowAge = isSelectedRow ? (this.state.age_at_visit || row.age_display || '') : (row.age_display || '');
				return `
				<div class="rd-child-row ${isSelectedRow ? 'selected' : ''}"
					data-patient="${frappe.utils.escape_html(row.patient)}">
					<div style="flex:1;">
						<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;">
							<div>
								<div style="font-size:13px;font-weight:600;">
									${frappe.utils.escape_html(row.patient_name || row.patient)}
								</div>
								<div class="rd-caption">
									${rowDob ? `DOB ${frappe.utils.escape_html(rowDob)}` : 'DOB unknown'}
									${rowAge ? `&nbsp;·&nbsp;Age ${frappe.utils.escape_html(rowAge)}` : ''}
								</div>
							</div>
							<span style="font-size:11px;color:var(--rd-muted);">${isSelectedRow ? 'Selected' : 'Select →'}</span>
						</div>
					</div>
				</div>`;
			}).join('')
			: `<div class="rd-caption">No children linked yet.</div>`;

		if (inAvailabilityMode && !this.state.phone_post_session_lookup && !hasSelectedChildState) {
			this.$body.html(`
				<div>
					<div class="rd-flow-stack">
					<div>${this._render_phone_flow_switch()}</div>
					<div class="rd-context-strip">
						<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
							<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
								<span class="rd-label">Inquiry</span>
								<button class="rd-btn-secondary rd-phone-inquiry-load"
									data-load-class="review_load"
									style="width:auto;${inquiryIsReview ? 'border-color:var(--rd-primary);background:var(--rd-primary-soft);color:var(--rd-primary);' : ''}">
									Review
								</button>
								<button class="rd-btn-secondary rd-phone-inquiry-load"
									data-load-class="non_review_load"
									style="width:auto;${!inquiryIsReview ? 'border-color:var(--rd-primary);background:var(--rd-primary-soft);color:var(--rd-primary);' : ''}">
									New
								</button>
							</div>
							<button id="rd-find-slot-btn" class="rd-btn-primary" style="width:auto;padding:9px 18px;">
								Find Sessions
							</button>
						</div>
					</div>
					<div class="rd-intake-hint">
						<div class="rd-flow-card-head" style="margin-bottom:0;">
							<div>
								<div class="rd-flow-card-title">Fast Phone Path</div>
								<div class="rd-caption" style="margin-top:3px;">Keep the call moving: identify patient type, offer the best session, then collect details only if the caller accepts.</div>
							</div>
						</div>
						<div class="rd-intake-hint-grid">
							<div class="rd-intake-hint-card">
								<div class="rd-intake-hint-title">Availability-first</div>
								<div class="rd-caption">Best for live calls. Compare upcoming sessions quickly, then continue with patient details after the caller agrees.</div>
							</div>
							<div class="rd-intake-hint-card">
								<div class="rd-intake-hint-title">Emergency stays separate</div>
								<div class="rd-caption">Urgent cases should use the operations rail on the right. Emergency is an interrupt, not part of routine booking.</div>
							</div>
						</div>
					</div>
					</div>
				</div>
			`);
			this.$body.find('.rd-phone-flow-btn').on('click', (e) => {
				const next = $(e.currentTarget).data('mode');
				if (next === this.state.phone_flow_mode) return;
				this.state.phone_flow_mode = next;
				this.state.phone_post_session_lookup = false;
				this.state.phone_context_collapsed = false;
				this.render_admission();
			});
			this.$body.find('.rd-phone-inquiry-load').on('click', (e) => {
				this.state.phone_inquiry_load_class = $(e.currentTarget).data('load-class');
				this.render_admission();
			});
			this.$body.find('#rd-find-slot-btn').on('click', () => this._do_find_slot());
			return;
		}

		this.$body.html(`
			<div>
				<div class="rd-flow-stack">
				<div>${this._render_phone_flow_switch()}</div>
				${this.state.phone_post_session_lookup && this.state.sessions.length ? `
				<div class="rd-flow-card rd-flow-card-soft">
					<div class="rd-flow-card-head">
						<div>
							<div class="rd-flow-card-title">Selected Session</div>
							<div class="rd-context-strip-meta">
								<span class="rd-badge ${badgeClass}">
									${frappe.utils.escape_html(visitLabel)}
								</span>
							</div>
						</div>
						<button id="rd-back-sessions" class="rd-btn-secondary" style="width:auto;font-size:11px;">Back to Sessions</button>
					</div>
					<div style="font-size:12px;font-weight:700;">
						${frappe.utils.escape_html(selectedSessionSummary)}
					</div>
					<div class="rd-caption" style="margin-top:4px;">
						${frappe.utils.escape_html(selectedSessionMeta)}
					</div>
				</div>` : ''}
				<div class="rd-context-strip ${isCollapsed ? 'is-collapsed' : ''}" id="rd-phone-progress-card">
					${hasSelectedChildState ? `
					<div class="rd-context-strip-head" style="margin-bottom:10px;">
						<div>
							<div class="rd-context-strip-title">${frappe.utils.escape_html(c.patient_name || c.patient)}</div>
							<div class="rd-context-strip-meta">
								<span class="rd-badge ${badgeClass}">${visitLabel}</span>
								<span class="rd-caption">${frappe.utils.escape_html(g.guardian_name || '')}</span>
								${this.state.age_at_visit ? `<span class="rd-caption">Age ${frappe.utils.escape_html(this.state.age_at_visit)}</span>` : ''}
								${isReview && vt.fee_validity_till ? `<span class="rd-caption">✓ Valid till ${frappe.utils.escape_html(vt.fee_validity_till)}</span>` : ''}
							</div>
						</div>
						<button id="rd-toggle-phone-progress" class="rd-btn-secondary" style="font-size:11px;width:auto;">
							${isCollapsed ? 'Show Details' : 'Hide Details'}
						</button>
					</div>` : ''}
					<div class="rd-context-details" style="${hasSelectedChildState ? '' : 'display:block;margin-top:0;padding-top:0;border-top:none;'}">
						<div style="margin-bottom:12px;">
							<div class="rd-label" style="margin-bottom:8px;">Parent / Guardian Mobile</div>
							<div style="display:flex;gap:8px;align-items:center;">
								<input id="rd-mobile-input" class="rd-input"
									type="tel" placeholder="e.g. 9876543210"
									value="${frappe.utils.escape_html(this.state.mobile)}"
									autocomplete="off" style="flex:1;" />
								<button id="rd-search-btn" class="rd-btn-primary" style="width:auto;padding:9px 18px;">
									${g ? 'Refresh' : 'Search'}
								</button>
							</div>
						</div>

						${g ? `
						<div style="margin-bottom:12px;">
							<div class="rd-context-strip-head" style="margin-bottom:10px;">
								<div>
									<div class="rd-label">Guardian</div>
									<div class="rd-context-strip-title">${frappe.utils.escape_html(g.guardian_name)}</div>
									<div class="rd-caption">
										${frappe.utils.escape_html(g.mobile)}
										${g.relationship ? '&nbsp;·&nbsp;' + frappe.utils.escape_html(g.relationship) : ''}
									</div>
								</div>
								<button id="rd-back-search" class="rd-btn-secondary" style="font-size:11px;width:auto;">Change</button>
							</div>
						</div>` : ''}

						${step === 'guardian_not_found' ? `
						<div class="rd-card" style="border-color:#f0c97f;background:#fff9e8;margin-bottom:12px;">
							<div style="font-size:12px;font-weight:700;color:#b45309;margin-bottom:4px;">
								No guardian found
							</div>
						</div>
						<div style="margin-bottom:12px;">
							<button id="rd-register-btn" class="rd-btn-primary" style="width:auto;">Register New Guardian & Child</button>
						</div>` : ''}

						${g && !(step === 'register' && isRegisterNew) ? `
						<div style="margin-bottom:12px;">
							<div class="rd-context-strip-head" style="margin-bottom:8px;">
								<div class="rd-label">Selected Child</div>
								${hasSelectedChildState ? `
								<input id="rd-age-input" class="rd-input" type="text"
									placeholder="3y 2m"
									value="${frappe.utils.escape_html(this.state.age_at_visit || '')}"
									style="width:110px;padding:6px 8px;font-size:12px;">` : ''}
							</div>
							<div class="rd-walkin-rows">
								${childRows}
							</div>
						</div>` : ''}

						${g ? `
						<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:${step === 'register' ? '12px' : '0'};">
							<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
								${hasSelectedChildState ? `
								<button id="rd-choose-another-child" class="rd-btn-subtle" style="width:auto;">Choose Another</button>` : ''}
								<button id="rd-add-child-btn" class="rd-btn-subtle" style="width:auto;">+ Add New Child</button>
							</div>
							${hasSelectedChildState ? `
							<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
								${!this.state.phone_post_session_lookup ? `
								<button id="rd-find-slot-btn" class="rd-btn-primary" style="width:auto;padding:9px 18px;">
									Find Sessions
								</button>` : ''}
							</div>` : ''}
						</div>` : ''}

						${step === 'register' ? `
						<div class="rd-context-details" style="display:block;margin-top:12px;padding-top:12px;">
							<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
								<div class="rd-context-strip-title">
									${isRegisterNew ? 'Register New Guardian & Child' : 'Add Child to ' + frappe.utils.escape_html(g.guardian_name)}
								</div>
								<button id="rd-reg-back" class="rd-btn-secondary" style="font-size:11px;width:auto;">Back</button>
							</div>
							${isRegisterNew ? `
							<div class="rd-label" style="margin-bottom:6px;">Guardian</div>
							<div style="display:grid;grid-template-columns:1.1fr .9fr;gap:8px;margin-bottom:8px;">
								<input id="rd-reg-guardian-name" class="rd-input" placeholder="Guardian full name *" />
								<input id="rd-reg-mobile" class="rd-input" placeholder="Mobile number *"
									value="${frappe.utils.escape_html(this.state.mobile)}" />
							</div>
							<select id="rd-reg-relationship" class="rd-input" style="margin-bottom:10px;">
								<option value="">Relationship (optional)</option>
								<option value="Father">Father</option>
								<option value="Mother">Mother</option>
								<option value="Guardian">Guardian</option>
								<option value="Other">Other</option>
							</select>` : ''}
							<div class="rd-label" style="margin-bottom:6px;">Child</div>
							<input id="rd-reg-child-name" class="rd-input" placeholder="Child full name *" style="margin-bottom:8px;" />
							<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
								<input id="rd-reg-dob" class="rd-input" type="date" />
								<select id="rd-reg-sex" class="rd-input">
									<option value="Male">Male</option>
									<option value="Female">Female</option>
								</select>
							</div>
							<button id="rd-reg-submit" class="rd-btn-primary">
								${isRegisterNew ? 'Register & Continue' : 'Add Child & Continue'}
							</button>
						</div>` : ''}
					</div>
				</div>
				${this.state.phone_post_session_lookup && hasSelectedChildState && selectedSession ? `
				<div class="rd-flow-card rd-flow-card-soft">
					<div class="rd-flow-card-title" style="margin-bottom:8px;">Current Visit</div>
					<div style="margin-bottom:8px;position:relative;">
						<div class="rd-label" style="margin-bottom:3px;">Complaint</div>
						<input id="rd-complaint-input" class="rd-input" type="text"
							autocomplete="off" placeholder="Type to search…"
							value="${frappe.utils.escape_html(this.state.complaint || '')}">
						<div id="rd-complaint-dd" style="display:none;position:absolute;
							top:100%;left:0;right:0;background:var(--card-bg);
							border:1px solid var(--border-color);border-top:none;
							border-radius:0 0 6px 6px;max-height:160px;overflow-y:auto;
							z-index:200;box-shadow:0 4px 12px rgba(0,0,0,.1);"></div>
					</div>

					<div class="rd-flow-field-grid" style="grid-template-columns:minmax(0, 1fr);">
						<div>
							<div class="rd-label" style="margin-bottom:3px;">Weight</div>
							<input id="rd-weight-input" class="rd-input" type="number"
								step="0.1" min="0" placeholder="kg"
								value="${this.state.weight_at_booking || ''}">
						</div>
					</div>
				</div>

				<div class="rd-flow-card">
					<div class="rd-flow-action-row">
						<button id="rd-phone-context-confirm" class="rd-btn-primary" style="width:auto;min-width:180px;">
							Confirm Booking
						</button>
					</div>
				</div>` : ''}
				</div>
			</div>
		`);

		this.$body.find('.rd-phone-flow-btn').on('click', (e) => {
			const next = $(e.currentTarget).data('mode');
			if (next === this.state.phone_flow_mode) return;
			this.state.phone_flow_mode = next;
			this.state.phone_post_session_lookup = false;
			this.state.phone_context_collapsed = false;
			this.state.sessions = [];
			this.state.session_idx = 0;
			this.state.override_token = null;
			this.state.token_board_open = false;
			this._reset_to_search();
		});
		this.$body.find('#rd-back-sessions').on('click', () => {
			this.state.phone_post_session_lookup = false;
			this.state.phone_context_collapsed = false;
			this.state.step = 'session_offered';
			this.render_admission();
		});
		const $input = this.$body.find('#rd-mobile-input');
		if (step === 'search') $input.focus();
		const do_search = () => {
			const mobile = $input.val().trim();
			if (!mobile) { frappe.show_alert({ message: 'Enter a mobile number.', indicator: 'orange' }); return; }
			this.state.mobile = mobile;
			this._do_search_guardian(mobile);
		};
		this.$body.find('#rd-search-btn').on('click', do_search);
		$input.on('keydown', (e) => { if (e.key === 'Enter') do_search(); });

		if (hasSelectedChildState) {
			this.$body.find('#rd-toggle-phone-progress').on('click', () => {
				const $card = this.$body.find('#rd-phone-progress-card');
				const collapsed = $card.hasClass('is-collapsed');
				$card.toggleClass('is-collapsed', !collapsed);
				this.state.phone_context_collapsed = !collapsed;
				this.$body.find('#rd-toggle-phone-progress').text(collapsed ? 'Hide Details' : 'Show Details');
			});
		}

		if (step === 'guardian_not_found') {
			this.$body.find('#rd-register-btn').on('click', () => {
				this.state.step = 'register';
				this.state._register_mode = 'new';
				this.render_admission();
			});
		}

		if (step === 'register') {
			this.$body.find('#rd-reg-back').on('click', () => {
				this.state.step = isRegisterNew ? 'guardian_not_found' : 'guardian_found';
				this.render_admission();
			});
			this.$body.find('#rd-reg-submit').on('click', () => this._do_register(isRegisterNew));
		}

		this.$body.find('#rd-back-search').on('click', () => this._reset_to_search());
		this.$body.find('.rd-child-row').on('click', (e) => {
			const patient = $(e.currentTarget).data('patient');
			const child = this.state.children.find(row => row.patient === patient);
			if (child) this._do_select_child(child);
		});
		this.$body.find('#rd-choose-another-child').on('click', () => {
			this.state.phone_context_collapsed = false;
			this.render_admission();
		});
		this.$body.find('#rd-add-child-btn').on('click', () => {
			this.state.step = 'register';
			this.state._register_mode = 'add_child';
			this.render_admission();
		});
		if (hasSelectedChildState) {
			this.$body.find('#rd-find-slot-btn').on('click', () => {
				if (this.state.phone_post_session_lookup && this.state.sessions.length) {
					this.state.step = 'session_offered';
					this.render_admission();
					return;
				}
				this._do_find_slot();
			});
		}
		if (this.state.phone_post_session_lookup && hasSelectedChildState && selectedSession) {
			this._bind_booking_inputs();
			this.$body.find('#rd-phone-context-confirm').on('click', () => this._do_confirm_booking(selectedSession));
		}
	}

	_load_walkin_preview(force = false) {
		if (this.state.channel !== 'walkin') return;
		if (this.state.walkin_preview_loading) return;
		if (!force && this.state.walkin_preview_sessions.length) {
			if (!this.token_board.current_session) {
				const picked = this.state.walkin_preview_sessions[this.state.session_idx] || this.state.walkin_preview_sessions[0];
				if (picked) this.token_board.load(picked.queue_session, this.state.override_token || picked.recommended_token || null);
			}
			return;
		}

		this.state.walkin_preview_loading = true;
		frappe.call({
			method: 'clinic_flow.api.admission.get_suggested_sessions',
			args: {
				load_class: this._effective_load_class(),
				channel: 'walkin',
				from_date: frappe.datetime.get_today(),
				is_special: this.state.is_special ? 1 : 0,
			},
			callback: (r) => {
				this.state.walkin_preview_loading = false;
				this.state.walkin_preview_sessions = r.message || [];
				if (this.state.walkin_preview_sessions.length) {
					const current = this.state.walkin_preview_sessions.findIndex(
						(row) => row.queue_session === (this.state.sessions[this.state.session_idx]?.queue_session || '')
					);
					this.state.session_idx = current >= 0 ? current : 0;
					const picked = this.state.walkin_preview_sessions[this.state.session_idx];
					if (picked) this.token_board.load(picked.queue_session, this.state.override_token || picked.recommended_token || null);
				} else {
					this.token_board._clear_board();
				}
				if (this.state.channel === 'walkin' && this.state.step === 'search') this.render_admission();
			},
			error: () => {
				this.state.walkin_preview_loading = false;
				if (this.state.channel === 'walkin' && this.state.step === 'search') this.render_admission();
			},
		});
	}

	// ── Step: Search ─────────────────────────────────────────────────────────
	_render_search() {
		this.$body.html(`
			<div>
				<div class="rd-card" style="padding:10px 12px;margin-bottom:12px;">
					<div style="font-size:13px;font-weight:700;margin-bottom:3px;">
						Phone Booking
					</div>
					<div class="rd-caption">
						Always-on phone booking board. Compare upcoming sessions and book calmly.
					</div>
				</div>
				<div class="rd-label" style="margin-bottom:8px;">Parent / Guardian Mobile</div>
				<div style="display:flex;gap:8px;align-items:center;">
					<input id="rd-mobile-input" class="rd-input"
						type="tel" placeholder="e.g. 9876543210"
						value="${frappe.utils.escape_html(this.state.mobile)}"
						autocomplete="off" style="flex:1;" />
					<button id="rd-search-btn" class="rd-btn-primary" style="width:auto;padding:9px 18px;">
						Search
					</button>
				</div>
				<div id="rd-search-hint"
					style="margin-top:6px;font-size:11px;color:var(--text-muted);">
					Enter the guardian's mobile number to look up their children.
				</div>
			</div>
		`);

		const $input = this.$body.find('#rd-mobile-input').focus();
		const do_search = () => {
			const mobile = $input.val().trim();
			if (!mobile) { frappe.show_alert({ message: 'Enter a mobile number.', indicator: 'orange' }); return; }
			this.state.mobile = mobile;
			this._do_search_guardian(mobile);
		};

		this.$body.find('#rd-search-btn').on('click', do_search);
		$input.on('keydown', (e) => { if (e.key === 'Enter') do_search(); });
	}

	_do_search_guardian(mobile) {
		const $scope = this.state.channel === 'walkin' ? this.token_board.$context : this.$body;
		const $btn = $scope.find(this.state.channel === 'walkin' ? '#rd-board-search-btn' : '#rd-search-btn');
		if ($btn.length) {
			$btn.prop('disabled', true).html('<span class="rd-spinner"></span>');
		}

		frappe.call({
			method: 'clinic_flow.api.family.search_guardian',
			args: { mobile },
			callback: (r) => {
				if (!r.message) return;
				const result = r.message;
				if (result.found) {
					this.state.guardian = result.guardian;
					this.state.children = result.children || [];
					if (this.state.channel === 'walkin') this.state.walkin_phase = 'guardian_result';
					this.state.step = 'guardian_found';
				} else {
					if (this.state.channel === 'walkin') this.state.walkin_phase = 'guardian_missing';
					this.state.step = 'guardian_not_found';
				}
				this.render_admission();
			},
		});
	}

	// ── Step: Guardian Found ─────────────────────────────────────────────────
	_render_guardian_found() {
		const g = this.state.guardian;
		const children = this.state.children;

		let children_html = '';
		if (children.length === 0) {
			children_html = `<div class="rd-caption" style="margin-bottom:8px;">
				No children linked yet.</div>`;
		} else {
			children_html = children.map(c => `
				<div class="rd-child-row" data-patient="${frappe.utils.escape_html(c.patient)}">
					<div style="flex:1;">
						<div style="font-size:13px;font-weight:600;">
							${frappe.utils.escape_html(c.patient_name || c.patient)}
						</div>
						<div class="rd-caption">
							${c.dob ? frappe.utils.escape_html(c.dob) : 'DOB unknown'}
							${c.age_display ? '&nbsp;·&nbsp;' + frappe.utils.escape_html(c.age_display) : ''}
						</div>
					</div>
					<span style="font-size:11px;color:var(--text-muted);">Select →</span>
				</div>
			`).join('');
		}

		this.$body.html(`
			<div>
				<div class="rd-context-strip">
					<div class="rd-context-strip-head">
						<div>
							<div class="rd-label">Guardian</div>
							<div class="rd-context-strip-title">
								${frappe.utils.escape_html(g.guardian_name)}
							</div>
							<div class="rd-caption">
								${frappe.utils.escape_html(g.mobile)}
								${g.relationship ? '&nbsp;·&nbsp;' + frappe.utils.escape_html(g.relationship) : ''}
							</div>
						</div>
						<button id="rd-back-search" class="rd-btn-secondary" style="font-size:11px;">
							Change
						</button>
					</div>
				</div>

				<div class="rd-context-strip">
					<div class="rd-context-strip-head">
						<div class="rd-context-strip-title">
							Select Child
							${children.length === 0 ? '' :
								`<span class="rd-badge rd-badge-gray" style="margin-left:6px;">
									${children.length}
								</span>`}
						</div>
					</div>
					<div class="rd-context-details" style="display:block;margin-top:8px;padding-top:0;border-top:none;">
						${children_html}
					</div>
				</div>

				<button id="rd-add-child-btn" class="rd-btn-secondary"
					style="width:100%;margin-top:4px;text-align:center;">
					+ Add New Child
				</button>
			</div>
		`);

		this.$body.find('#rd-back-search').on('click', () => this._reset_to_search());

		this.$body.find('.rd-child-row').on('click', (e) => {
			const $row = $(e.currentTarget);
			const patient = $row.data('patient');
			const child = this.state.children.find(c => c.patient === patient);
			if (child) this._do_select_child(child);
		});

		this.$body.find('#rd-add-child-btn').on('click', () => {
			this.state.step = 'register';
			this.state._register_mode = 'add_child';
			this.render_admission();
		});
	}

	// ── Step: Guardian Not Found ──────────────────────────────────────────────
	_render_guardian_not_found() {
		this.$body.html(`
			<div>
				<div class="rd-card" style="border-color:#f87171;margin-bottom:12px;">
					<div style="font-size:13px;font-weight:600;color:#dc2626;margin-bottom:4px;">
						No guardian found
					</div>
					<div class="rd-caption">
						Mobile: <strong>${frappe.utils.escape_html(this.state.mobile)}</strong>
						is not registered.
					</div>
				</div>
				<button id="rd-register-btn" class="rd-btn-primary">
					Register New Guardian &amp; Child
				</button>
				<button id="rd-back-search" class="rd-btn-secondary"
					style="width:100%;margin-top:8px;">
					← Try different number
				</button>
			</div>
		`);

		this.$body.find('#rd-register-btn').on('click', () => {
			this.state.step = 'register';
			this.state._register_mode = 'new';
			this.render_admission();
		});
		this.$body.find('#rd-back-search').on('click', () => this._reset_to_search());
	}

	// ── Step: Register Guardian / Add Child ──────────────────────────────────
	_render_register_form() {
		const is_new = this.state._register_mode === 'new';
		const g = this.state.guardian;

		this.$body.html(`
			<div>
				<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
					<button id="rd-reg-back" class="rd-btn-secondary" style="font-size:11px;">←</button>
					<span style="font-size:13px;font-weight:700;">
						${is_new ? 'Register New Guardian & Child' : 'Add Child to ' + frappe.utils.escape_html(g.guardian_name)}
					</span>
				</div>

				${is_new ? `
				<div class="rd-label" style="margin-bottom:6px;">Guardian Details</div>
				<input id="rd-reg-guardian-name" class="rd-input" placeholder="Guardian full name *"
					style="margin-bottom:8px;" />
				<input id="rd-reg-mobile" class="rd-input" placeholder="Mobile number *"
					value="${frappe.utils.escape_html(this.state.mobile)}"
					style="margin-bottom:8px;" />
				<select id="rd-reg-relationship" class="rd-input" style="margin-bottom:14px;">
					<option value="">Relationship (optional)</option>
					<option value="Father">Father</option>
					<option value="Mother">Mother</option>
					<option value="Guardian">Guardian</option>
					<option value="Other">Other</option>
				</select>
				` : ''}

				<div class="rd-label" style="margin-bottom:6px;">Child Details</div>
				<input id="rd-reg-child-name" class="rd-input" placeholder="Child full name *"
					style="margin-bottom:8px;" />
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
					<input id="rd-reg-dob" class="rd-input" type="date" placeholder="Date of Birth" />
					<select id="rd-reg-sex" class="rd-input">
						<option value="Male">Male</option>
						<option value="Female">Female</option>
					</select>
				</div>

				<button id="rd-reg-submit" class="rd-btn-primary" style="margin-top:6px;">
					${is_new ? 'Register & Continue' : 'Add Child & Continue'}
				</button>
			</div>
		`);

		this.$body.find('#rd-reg-back').on('click', () => {
			this.state.step = is_new ? 'guardian_not_found' : 'guardian_found';
			this.render_admission();
		});

		this.$body.find('#rd-reg-submit').on('click', () => this._do_register(is_new));
	}

	_do_register(is_new) {
		const $scope = this.state.channel === 'walkin' ? this.token_board.$context : this.$body;
		const child_name = $scope.find('#rd-reg-child-name').val().trim();
		const dob        = $scope.find('#rd-reg-dob').val();
		const sex        = $scope.find('#rd-reg-sex').val();

		if (!child_name) {
			frappe.show_alert({ message: 'Child name is required.', indicator: 'orange' });
			return;
		}

		const $btn = $scope.find(this.state.channel === 'walkin' ? '#rd-board-reg-submit' : '#rd-reg-submit').prop('disabled', true)
			.html('<span class="rd-spinner"></span>');

		if (is_new) {
			const guardian_name  = $scope.find('#rd-reg-guardian-name').val().trim();
			const mobile         = $scope.find('#rd-reg-mobile').val().trim();
			const relationship   = $scope.find('#rd-reg-relationship').val();

			if (!guardian_name || !mobile) {
				$btn.prop('disabled', false).text('Register & Continue');
				frappe.show_alert({ message: 'Guardian name and mobile are required.', indicator: 'orange' });
				return;
			}

			frappe.call({
				method: 'clinic_flow.api.family.register_guardian_and_child',
				args: { guardian_name, mobile, relationship, patient_name: child_name, dob, sex },
				callback: (r) => {
					if (!r.message) return;
					const { guardian, patient, patient_name } = r.message;
					this.state.guardian = { name: guardian, guardian_name, mobile, relationship };
					const child = { patient, patient_name, dob, age_display: '' };
					this.state.children = [child];
					if (this.state.channel === 'walkin') {
						this.state.walkin_notice = null;
						this._do_select_child(child);
						frappe.show_alert({ message: 'Guardian registered!', indicator: 'green' });
						return;
					}
					this._do_select_child(child);
					frappe.show_alert({ message: 'Guardian registered!', indicator: 'green' });
				},
				error: () => { $btn.prop('disabled', false).text('Register & Continue'); },
			});
		} else {
			frappe.call({
				method: 'clinic_flow.api.family.add_child_to_guardian',
				args: { guardian: this.state.guardian.name, patient_name: child_name, dob, sex },
				callback: (r) => {
					if (!r.message) return;
					const { patient, patient_name: pname } = r.message;
					this.state.children.push({ patient, patient_name: pname, dob, age_display: '' });
					if (this.state.channel === 'walkin') this.state.walkin_phase = 'guardian_result';
					this.state.step = 'guardian_found';
					this.render_admission();
					frappe.show_alert({ message: 'Child added!', indicator: 'green' });
				},
				error: () => { $btn.prop('disabled', false).text('Add Child & Continue'); },
			});
		}
	}

	// ── Step: Child Selected — visit type ────────────────────────────────────
	_do_select_child(child) {
		const $scope = this.state.channel === 'walkin' ? this.token_board.$context : this.$body;
		$scope.html(`
			<div style="text-align:center;padding:24px 0;">
				<span class="rd-spinner"></span>
				<div class="rd-caption" style="margin-top:8px;">Checking visit type…</div>
			</div>
		`);

		frappe.call({
			method: 'clinic_flow.api.admission.get_visit_type',
			args: { patient: child.patient },
			callback: (r) => {
				if (!r.message) return;
				// Merge DOB from visit_type into child object so age can be computed
				const dob = r.message.dob || child.dob || null;
				this.state.child = { ...child, dob };
				this.state.visit_type = r.message;
				// Pre-compute age for the booking form
				this.state.age_at_visit = _age_from_dob(dob) || child.age_display || null;
				this.state.phone_context_collapsed = !!(this.state.channel === 'phone' && this.state.phone_post_session_lookup);
				if (this.state.channel === 'walkin') {
					if (this.state.walkin_preview_sessions.length) {
						this.state.sessions = [...this.state.walkin_preview_sessions];
						const picked = this.state.sessions[this.state.session_idx] || this.state.sessions[0];
						if (picked) this.token_board.load(picked.queue_session, this.state.override_token || null);
						this.state.walkin_phase = 'confirm';
						this.state.step = 'session_offered';
					} else {
						this.state.walkin_phase = 'confirm';
						this.state.step = 'child_selected';
					}
				} else {
					this.state.step = 'child_selected';
				}
				this.render_admission();
			},
		});
	}

	_render_child_selected() {
		const c  = this.state.child;
		const vt = this.state.visit_type;
		const g  = this.state.guardian;
		const is_walkin = this.state.channel === 'walkin';
		const provisional = this.state.provisional_load_class;
		const hasMismatch = is_walkin && provisional && provisional !== vt.load_class;

		const is_review = vt.load_class === 'review_load';
		const badge_class = is_review ? 'rd-badge-green' : 'rd-badge-blue';
		const visit_label = is_review ? 'Review Patient' : 'New Patient';

		this.$body.html(`
			<div>
				<div class="rd-context-strip is-collapsed" id="rd-phone-context-strip">
					<div class="rd-context-strip-head">
						<div>
							<div class="rd-label">Patient Context</div>
							<div class="rd-context-strip-title">
								${frappe.utils.escape_html(c.patient_name || c.patient)}
							</div>
							<div class="rd-context-strip-meta">
								<span class="rd-badge ${badge_class}">${visit_label}</span>
								<span class="rd-caption">${frappe.utils.escape_html(g.guardian_name)}</span>
								${is_review && vt.fee_validity_till ? `
								<span class="rd-caption">
									✓ Free follow-up valid till ${frappe.utils.escape_html(vt.fee_validity_till)}
								</span>` : ''}
							</div>
						</div>
						<div style="display:flex;align-items:center;gap:8px;">
							<button id="rd-toggle-context" class="rd-btn-secondary" style="font-size:11px;">
								Show Details
							</button>
							<button id="rd-back-guardian" class="rd-btn-secondary" style="font-size:11px;">
								Change
							</button>
						</div>
					</div>
					<div class="rd-context-details">
						<div class="rd-caption">
							${c.age_display ? frappe.utils.escape_html(c.age_display) : ''}
							${c.dob ? '&nbsp;·&nbsp;DOB ' + frappe.utils.escape_html(c.dob) : ''}
							&nbsp;·&nbsp;${frappe.utils.escape_html(g.mobile)}
						</div>
					</div>
				</div>

				${hasMismatch ? `
				<div class="rd-card" style="margin-bottom:12px;padding:10px 12px;border-color:#f59e0b;background:#fffbeb;">
					<div style="font-size:12px;font-weight:700;color:#b45309;margin-bottom:4px;">
						Intake guess changed after lookup
					</div>
					<div class="rd-caption" style="color:#92400e;">
						Reception guessed <strong>${frappe.utils.escape_html(this._load_label(provisional))}</strong>,
						but fee validity resolves this child as
						<strong>${frappe.utils.escape_html(this._load_label(vt.load_class))}</strong>.
						Final booking will use the actual result.
					</div>
				</div>` : ''}

				${!this.state.phone_post_session_lookup ? `
				<div class="rd-caption" style="margin-bottom:12px;">
					Mode: <strong>${frappe.utils.escape_html(is_walkin ? 'Walk-in Intake' : 'Phone Booking')}</strong>
					&nbsp;·&nbsp;Load class: <strong>${frappe.utils.escape_html(vt.load_class)}</strong>
				</div>` : ''}

				${is_walkin ? `
				<div class="rd-card" style="padding:10px 12px;margin-bottom:12px;">
					<div class="rd-label" style="margin-bottom:8px;">Walk-in Intake Guess</div>
					<div style="display:flex;gap:8px;flex-wrap:wrap;">
						<button class="rd-btn-secondary rd-provisional-load"
							data-load-class="review_load"
							style="border-color:${provisional === 'review_load' ? 'var(--primary)' : 'var(--border-color)'};color:${provisional === 'review_load' ? 'var(--primary)' : 'inherit'};">
							Likely Review
						</button>
						<button class="rd-btn-secondary rd-provisional-load"
							data-load-class="non_review_load"
							style="border-color:${provisional === 'non_review_load' ? 'var(--primary)' : 'var(--border-color)'};color:${provisional === 'non_review_load' ? 'var(--primary)' : 'inherit'};">
							Likely New
						</button>
						<button class="rd-btn-secondary rd-provisional-clear"
							style="border-color:${!provisional ? 'var(--primary)' : 'var(--border-color)'};color:${!provisional ? 'var(--primary)' : 'inherit'};">
							Use Actual
						</button>
					</div>
					<div class="rd-caption" style="margin-top:8px;">
						Session guidance can follow this intake guess, but confirmation still uses the actual fee-validity result.
					</div>
				</div>` : ''}

				<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
					${this.state.phone_post_session_lookup ? `
					<button id="rd-back-sessions-from-child" class="rd-btn-secondary" style="width:auto;">
						← Back to Sessions
					</button>` : ''}
					<button id="rd-find-slot-btn" class="rd-btn-primary" style="${this.state.phone_post_session_lookup ? 'width:auto;' : ''}">
						${is_walkin
							? 'Open Today’s Token Intake →'
							: (this.state.phone_post_session_lookup ? 'Continue to Booking →' : 'Find Next Suitable Slot →')}
					</button>
				</div>
			</div>
		`);

		this.$body.find('#rd-back-guardian').on('click', () => {
			this.state.step = 'guardian_found';
			this.render_admission();
		});
		this.$body.find('#rd-toggle-context').on('click', () => {
			const $strip = this.$body.find('#rd-phone-context-strip');
			const isCollapsed = $strip.hasClass('is-collapsed');
			$strip.toggleClass('is-collapsed', !isCollapsed);
			this.$body.find('#rd-toggle-context').text(isCollapsed ? 'Hide Details' : 'Show Details');
		});

		this.$body.find('#rd-find-slot-btn').on('click', () => this._do_find_slot());
		this.$body.find('#rd-back-sessions-from-child').on('click', () => {
			this.state.step = 'session_offered';
			this.render_admission();
		});
		this.$body.find('.rd-provisional-load').on('click', (e) => {
			this.state.provisional_load_class = $(e.currentTarget).data('load-class');
			this.render_admission();
		});
		this.$body.find('.rd-provisional-clear').on('click', () => {
			this.state.provisional_load_class = null;
			this.render_admission();
		});
	}

	_do_find_slot() {
		this.state.phone_context_collapsed = true;
		this.$body.find('#rd-find-slot-btn').prop('disabled', true)
			.html('<span class="rd-spinner"></span> Finding…');

		frappe.call({
			method: 'clinic_flow.api.admission.get_suggested_sessions',
			args: {
				load_class: this._effective_load_class(),
				channel:    this.state.channel,
				from_date:  frappe.datetime.get_today(),
				is_special: this.state.is_special ? 1 : 0,
			},
			callback: (r) => {
				if (!r.message || !r.message.length) {
					const ch_label = this.state.is_special
						? `Special (${this.state.channel})`
						: this.state.channel;
					this.$body.html(`
						<div class="rd-card" style="border-color:#f87171;">
							<div style="color:#dc2626;font-weight:600;margin-bottom:4px;">No sessions available</div>
							<div class="rd-caption">
								No open sessions found for
								<strong>${frappe.utils.escape_html(this._effective_load_class())}</strong>
								via <strong>${frappe.utils.escape_html(ch_label)}</strong>.
							</div>
						</div>
						<button id="rd-back-child" class="rd-btn-secondary" style="width:100%;margin-top:8px;">
							← Patient Context
						</button>
					`);
					this.$body.find('#rd-back-child').on('click', () => {
						this.state.phone_context_collapsed = false;
						this.state.step = 'child_selected';
						this.render_admission();
					});
					return;
				}

				this.state.sessions    = r.message;
				this.state.session_idx = this._best_session_idx(r.message);
				this.state.override_token = null;
				this.state.step = 'session_offered';
				const picked = r.message[this.state.session_idx] || r.message[0];
				const recommendedToken = picked?.recommended_token || null;
				this.token_board.load(picked.queue_session, recommendedToken, () => {
					const bestToken = recommendedToken || this.token_board.pick_best_available(this.state.is_special);
					this.state.override_token = bestToken || null;
					this.render_admission();
				});
			},
		});
	}

	_best_session_idx(sessions = []) {
		if (!sessions.length) return 0;
		const recommendedIdx = sessions.findIndex((session) => !!session.is_recommended);
		return recommendedIdx >= 0 ? recommendedIdx : 0;
	}

	_group_sessions_by_date() {
		const groups = new Map();
		(this.state.sessions || []).forEach((session, idx) => {
			const key = session.session_date;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push({
				...session,
				_idx: idx,
				_rank: Number.isFinite(Number(session.recommendation_rank)) ? Number(session.recommendation_rank) : idx,
			});
		});
		return Array.from(groups.entries()).map(([date, sessions]) => ({
			date,
			label: this._date_group_label(date),
			sessions,
		}));
	}

	_date_group_label(dateStr) {
		const today = frappe.datetime.get_today();
		const tomorrow = frappe.datetime.add_days(today, 1);
		const userDate = frappe.datetime.str_to_user(dateStr, false, true);
		let dayLabel = '';
		try {
			dayLabel = frappe.datetime.str_to_obj(dateStr)?.toLocaleDateString('en-US', { weekday: 'short' }) || '';
		} catch (e) {
			dayLabel = '';
		}
		if (dateStr === today) return `Today${dayLabel ? ` · ${dayLabel}` : ''}`;
		if (dateStr === tomorrow) return `Tomorrow${dayLabel ? ` · ${dayLabel}` : ''}`;
		return `${dayLabel ? `${dayLabel} · ` : ''}${userDate}`;
	}

	_render_session_card(session, idx, is_selected) {
		const hasPatientContext = !!this.state.child;
		const hasOverride = this.state.override_token && this.state.session_idx === idx;
		const bookingHint = hasOverride
			? `Token ${frappe.utils.escape_html(String(this.state.override_token))} selected`
			: 'Best token will be auto-assigned';
		const stressClass = (session.stress_label || '').includes('High')
			? 'stress-high'
			: (session.stress_label || '').includes('Medium')
				? 'stress-mid'
				: 'stress-low';
		return `
			<div class="rd-session-tile rd-session-pick-card ${is_selected ? 'is-active' : ''} ${session._rank === 0 ? 'is-recommended' : ''}"
				data-idx="${idx}"
				style="cursor:pointer;">
				<div class="rd-session-tile-top">
					<div class="rd-session-tile-doctor">
						${session._rank === 0 ? '<div class="rd-best-badge">Best Option</div>' : ''}
						<div style="font-size:13px;font-weight:700;">
							${frappe.utils.escape_html(session.practitioner_name || session.session_name)}
						</div>
						<div class="rd-caption">
							${frappe.utils.escape_html(session.start_time)} – ${frappe.utils.escape_html(session.end_time)}
							${session.dept_abbr ? '&nbsp;·&nbsp;' + frappe.utils.escape_html(session.dept_abbr) : ''}
						</div>
					</div>
					<div class="rd-session-tile-actions">
						<button class="rd-btn-secondary rd-select-session-btn"
							data-idx="${idx}"
							style="width:auto;padding:6px 10px;font-size:11px;">
							Choose Token
						</button>
					</div>
				</div>
				<div class="rd-session-tile-middle">
					<div class="rd-session-tile-slots">
						<div class="rd-label">Slots</div>
						<div style="font-size:22px;font-weight:900;line-height:1;color:var(--primary);">
							${frappe.utils.escape_html(String(session.available_slots || 0))}
						</div>
					</div>
					<div class="rd-session-tile-chips">
						<span class="rd-scan-chip ${stressClass}">
							${frappe.utils.escape_html((session.stress_label || 'Open').replace(' Stress', ''))}
						</span>
						<span class="rd-scan-chip fit-chip">
							${frappe.utils.escape_html((session.fit_label || 'Balanced').replace('Good for ', ''))}
						</span>
						<span class="rd-scan-chip hour-chip">
							${frappe.utils.escape_html(session.likely_hour_band || '—')}
						</span>
					</div>
				</div>
				${is_selected && !hasPatientContext ? `
				<div class="rd-session-tile-footer">
					<div class="rd-session-footer-status">
						<span class="rd-selection-badge">Selected</span>
					</div>
					<div class="rd-session-footer-center">
						${this.state.override_token ? `
						<div class="rd-session-token-pill">
							<span class="rd-session-token-label">Token</span>
							<span class="rd-session-token-value">${frappe.utils.escape_html(String(this.state.override_token))}</span>
						</div>` : `
						<div style="font-size:12px;font-weight:700;">${bookingHint}</div>`}
						<div class="rd-session-eta">
							${session.likely_hour_band ? frappe.utils.escape_html(session.likely_hour_band) : 'Ready to add patient details'}
						</div>
					</div>
					<button class="rd-btn-primary rd-phone-add-patient"
						data-idx="${idx}"
						style="width:auto;min-width:170px;">
						Add Patient Details
					</button>
				</div>` : ''}
			</div>`;
	}

	_select_session(nextIdx) {
		if (Number.isNaN(nextIdx) || nextIdx < 0 || nextIdx >= this.state.sessions.length) return;
		this.state.session_idx = nextIdx;
		this.state.override_token = null;
		const picked = this.state.sessions[nextIdx];
		this.token_board.load(picked.queue_session, picked.recommended_token || null);
	}

	_select_best_token(nextIdx, { openBoard = false } = {}) {
		if (Number.isNaN(nextIdx) || nextIdx < 0 || nextIdx >= this.state.sessions.length) return;
		this.state.session_idx = nextIdx;
		this.state.override_token = null;
		const picked = this.state.sessions[nextIdx];
		if (!picked) return;
		this.state.token_board_open = openBoard;
		this.token_board.load(picked.queue_session, picked.recommended_token || null, () => {
			const bestToken = picked.recommended_token || this.token_board.pick_best_available(this.state.is_special);
			this.state.override_token = bestToken || null;
			this.render_admission();
		});
	}

	// ── Step: Session Offered ─────────────────────────────────────────────────
	_render_session_offered() {
		const sessions    = this.state.sessions;
		const idx         = this.state.session_idx;
		const groups      = this._group_sessions_by_date();
		const isReview = this.state.visit_type && this.state.visit_type.load_class === 'review_load';

		this.$body.html(`
			<div>
				<div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;">
					<button id="rd-back-child2" class="rd-btn-secondary" style="font-size:11px;">
						← ${this.state.phone_flow_mode === 'availability' && !this.state.child ? 'Availability Inquiry' : 'Patient Context'}
					</button>
					<span class="rd-label">Availability Board</span>
				</div>

				<div class="rd-card" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;margin-bottom:12px;">
					<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
						<span class="rd-badge ${(this.state.child ? isReview : this.state.phone_inquiry_load_class === 'review_load') ? 'rd-badge-green' : 'rd-badge-blue'}">
							${this.state.child ? (isReview ? 'Review' : 'New') : (this.state.phone_inquiry_load_class === 'review_load' ? 'Review' : 'New')}
						</span>
						<span class="rd-badge rd-badge-gray">
							${frappe.utils.escape_html(this.state.channel === 'phone' ? 'Phone' : 'Walk-in')}
						</span>
						${this.state.is_special ? '<span class="rd-badge" style="background:#fff7ed;color:#c2410c;border:1px solid #fdba74;">Special</span>' : ''}
						${this.state.child ? `<span class="rd-caption" style="font-weight:600;">
							${frappe.utils.escape_html(this.state.child?.patient_name || this.state.child?.patient || '')}
						</span>` : ''}
					</div>
					<div class="rd-caption" style="font-weight:600;">
						${this.state.child
							? 'Choose a session or book the best token directly'
							: 'Offer a session first, then add patient details only if the caller agrees'}
					</div>
				</div>

				<div class="rd-availability-groups">
					${groups.map(group => `
						<div>
							<div class="rd-availability-date-head">
								<div class="rd-availability-date-title">
									${frappe.utils.escape_html(group.label.split(' · ')[0])}
								</div>
								${group.label.includes(' · ') ? `
								<div class="rd-availability-date-meta">
									${frappe.utils.escape_html(group.label.split(' · ').slice(1).join(' · '))}
								</div>` : ''}
							</div>
							${group.sessions.some(session => session._idx === idx) ? `
								${(() => {
									const selected = group.sessions.find(session => session._idx === idx);
									if (!selected) return '';
									const hasPatientContext = !!this.state.child;
									const bookingHint = this.state.override_token
										? `Token ${frappe.utils.escape_html(String(this.state.override_token))} selected`
										: 'Best token will be auto-assigned';
									return hasPatientContext ? `
									<div class="rd-availability-selection-dock">
									${(this.state.is_special && selected.recommended_token) ? `
									<div style="padding:6px 10px;margin-bottom:8px;border-radius:6px;
										background:#fef9c3;border:1px solid #d97706;
										font-size:12px;font-weight:600;color:#a16207;">
										Recommended token:
										<strong>${frappe.utils.escape_html(String(selected.recommended_token))}</strong>
										&nbsp;(highlighted on board — click to confirm)
									</div>` : ''}
									<div style="padding:7px 9px;border-radius:8px;background:var(--bg-color);margin-bottom:8px;">
										<div class="rd-label">Token</div>
										<div style="font-size:12px;font-weight:700;margin-top:2px;">${bookingHint}</div>
										<div class="rd-caption" style="margin-top:3px;">
											Use the token board only if you need to override.
										</div>
									</div>

									<div style="margin-bottom:8px;position:relative;">
										<div class="rd-label" style="margin-bottom:3px;">Complaint</div>
										<input id="rd-complaint-input" class="rd-input" type="text"
											autocomplete="off" placeholder="Type to search…"
											value="${frappe.utils.escape_html(this.state.complaint || '')}">
										<div id="rd-complaint-dd" style="display:none;position:absolute;
											top:100%;left:0;right:0;background:var(--card-bg);
											border:1px solid var(--border-color);border-top:none;
											border-radius:0 0 6px 6px;max-height:160px;overflow-y:auto;
											z-index:200;box-shadow:0 4px 12px rgba(0,0,0,.1);"></div>
									</div>

									<div style="display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr) auto;gap:8px;align-items:end;">
										<div>
											<div class="rd-label" style="margin-bottom:3px;">Weight</div>
											<input id="rd-weight-input" class="rd-input" type="number"
												step="0.1" min="0" placeholder="kg"
												value="${this.state.weight_at_booking || ''}">
										</div>
										<div>
											<div class="rd-label" style="margin-bottom:3px;">Age</div>
											<input id="rd-age-input" class="rd-input" type="text"
												placeholder="3y 2m"
												value="${frappe.utils.escape_html(this.state.age_at_visit || '')}">
										</div>
										<button class="rd-btn-primary rd-confirm-booking-inline"
											data-idx="${selected._idx}"
											style="width:auto;min-width:150px;">
											Confirm Booking
										</button>
									</div>
									</div>` : '';
								})()}
							` : ''}
							<div class="rd-availability-group-grid">
								${group.sessions.map(session => this._render_session_card(session, session._idx, session._idx === idx)).join('')}
							</div>
						</div>
					`).join('')}
				</div>
			</div>
		`);

		this.$body.find('#rd-back-child2').on('click', () => {
			this.state.phone_context_collapsed = false;
			if (this.state.phone_flow_mode === 'availability' && !this.state.child) {
				this.state.step = 'search';
				this.state.phone_post_session_lookup = false;
			} else {
				this.state.step = 'child_selected';
			}
			this.render_admission();
		});
		this.$body.find('.rd-session-pick-card').on('click', (e) => {
			if ($(e.target).closest('.rd-session-inline-form, .rd-session-row-actions, button, input, select, textarea, #rd-complaint-dd').length) {
				return;
			}
			e.preventDefault();
			const nextIdx = Number($(e.currentTarget).data('idx'));
			if (Number.isNaN(nextIdx)) return;
			this._select_best_token(nextIdx, { openBoard: false });
		});
		this.$body.find('.rd-select-session-btn').on('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const nextIdx = Number($(e.currentTarget).data('idx'));
			if (Number.isNaN(nextIdx)) return;
			if (nextIdx !== this.state.session_idx) this._select_session(nextIdx);
			this.state.session_idx = nextIdx;
			this.state.token_board_open = true;
			this.render_admission();
		});
		this.$body.find('.rd-phone-add-patient').on('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const nextIdx = Number($(e.currentTarget).data('idx'));
			if (!Number.isNaN(nextIdx)) this.state.session_idx = nextIdx;
			this.state.phone_post_session_lookup = true;
			this.state.phone_context_collapsed = true;
			this.state.step = 'search';
			this.render_admission();
		});
		this.$body.find('.rd-confirm-booking-inline').on('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const bookingIdx = Number($(e.currentTarget).data('idx'));
			const picked = this.state.sessions[bookingIdx];
			if (!picked) return;
			this.state.session_idx = bookingIdx;
			this._do_confirm_booking(picked);
		});
		this._bind_booking_inputs();
	}

	_bind_booking_inputs() {
		const $scope = this.state.channel === 'walkin' ? this.token_board.$context : this.$body;
		// Complaint autocomplete
		let _complaint_timer;
		$scope.find('#rd-complaint-input').on('input', (e) => {
			const q = e.target.value;
			this.state.complaint = q || null;
			clearTimeout(_complaint_timer);
			if (!q || q.length < 1) {
				$scope.find('#rd-complaint-dd').hide().empty();
				return;
			}
			_complaint_timer = setTimeout(() => {
				frappe.call({
					method: 'frappe.client.get_list',
					args: { doctype: 'Complaint', filters: [['name', 'like', `%${q}%`]],
						fields: ['name'], limit: 10 },
					callback: (r) => {
						const $dd = $scope.find('#rd-complaint-dd');
						if (!r.message || !r.message.length) { $dd.hide().empty(); return; }
						$dd.empty().show();
						r.message.forEach(c => {
							$(`<div style="padding:8px 12px;cursor:pointer;font-size:13px;
								border-bottom:1px solid var(--border-color);">
								${frappe.utils.escape_html(c.name)}
							</div>`).on('click', () => {
								this.state.complaint = c.name;
								$scope.find('#rd-complaint-input').val(c.name);
								$dd.hide().empty();
							}).appendTo($dd);
						});
					},
				});
			}, 280);
		}).on('blur', () => {
			// Delay hide so click on dropdown item fires first
			setTimeout(() => $scope.find('#rd-complaint-dd').hide(), 180);
		});

		// Weight + Age — persist to state immediately
		$scope.find('#rd-weight-input').on('input', (e) => {
			this.state.weight_at_booking = e.target.value || null;
		});
		$scope.find('#rd-age-input').on('input', (e) => {
			this.state.age_at_visit = e.target.value || null;
		});
	}

	// ── Confirm booking ──────────────────────────────────────────────────────
	_do_confirm_booking(session) {
		const $scope = this.state.channel === 'walkin' ? this.token_board.$context : this.$body;
		const $btn = this.state.channel === 'walkin'
			? $scope.find('#rd-board-confirm-booking').first()
			: (this.state.phone_post_session_lookup
				? this.$body.find('#rd-phone-context-confirm').first()
				: this.$body.find('.rd-confirm-booking-inline').filter((_, el) =>
					Number($(el).data('idx')) === this.state.session_idx
				).first());
		if ($btn.length) {
			$btn.prop('disabled', true).html('<span class="rd-spinner"></span> Confirming…');
		}

		frappe.call({
			method: 'clinic_flow.api.admission.confirm_booking',
			args: {
				queue_session: session.queue_session,
				patient:       this.state.child.patient,
				channel:       this.state.channel,
				load_class:    this.state.visit_type.load_class,
				guardian:      this.state.guardian.name,
				token_number:  this.state.override_token || null,
				is_special:    this.state.is_special ? 1 : 0,
				complaint:     this.state.complaint || null,
				weight:        this.state.weight_at_booking || null,
				age_at_visit:  this.state.age_at_visit || null,
			},
			callback: (r) => {
				if (!r.message) return;
				this.state.booking = r.message;
				if (this.state.channel === 'walkin') this.state.walkin_phase = 'done';
				this.state.step = 'confirmed';
				this.render_admission();
				this.load_top_bar();
				// Reload board to show confirmed token
				this.token_board.load(session.queue_session, r.message.token_number);
			},
			error: () => {
				if ($btn.length) $btn.prop('disabled', false).text('Confirm Booking');
			},
		});
	}

	// ── Step: Confirmed ───────────────────────────────────────────────────────
	_render_confirmed() {
		const b   = this.state.booking;
		const c   = this.state.child;
		const g   = this.state.guardian;
		const s   = this.state.sessions[this.state.session_idx];

		const report_time = _eta_fmt(b.report_by_time);
		const pred_time   = _eta_fmt(b.predicted_doctor_time);
		const age_str     = this.state.age_at_visit || '';
		const weight_str  = this.state.weight_at_booking ? `${this.state.weight_at_booking} kg` : '';
		const complaint   = this.state.complaint || '';

		this.$body.html(`
			<div>
				<!-- Confirmation slip -->
				<div class="rd-confirm-slip">
					<div style="font-size:28px;font-weight:900;color:#15803d;margin-bottom:4px;">
						${frappe.utils.escape_html(_display_token(b))}
					</div>
					<div style="font-size:12px;font-weight:600;color:#15803d;margin-bottom:12px;">
						Token Number
					</div>

					<div style="margin-bottom:4px;font-size:13px;">
						<strong>${frappe.utils.escape_html(c.patient_name || c.patient)}</strong>
						${age_str ? `<span class="rd-caption" style="margin-left:6px;">${frappe.utils.escape_html(age_str)}</span>` : ''}
					</div>
					<div class="rd-caption" style="margin-bottom:10px;">
						${frappe.utils.escape_html(g.guardian_name)} · ${frappe.utils.escape_html(g.mobile)}
					</div>

					${complaint ? `
					<div style="padding:5px 8px;margin-bottom:8px;border-radius:5px;
						background:#eff6ff;font-size:12px;color:#1e40af;">
						<span style="font-weight:700;">Complaint:</span>
						${frappe.utils.escape_html(complaint)}
					</div>` : ''}

					${weight_str ? `
					<div style="padding:5px 8px;margin-bottom:8px;border-radius:5px;
						background:#f0fdf4;font-size:12px;color:#166534;">
						<span style="font-weight:700;">Weight:</span>
						${frappe.utils.escape_html(weight_str)}
					</div>` : ''}

					<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
						<div style="text-align:center;">
							<div class="rd-label">Report By</div>
							<div style="font-size:14px;font-weight:700;">${frappe.utils.escape_html(report_time)}</div>
						</div>
						<div style="text-align:center;">
							<div class="rd-label">Est. Doctor</div>
							<div style="font-size:14px;font-weight:700;">${frappe.utils.escape_html(pred_time)}</div>
						</div>
					</div>

					<div class="rd-caption">
						${frappe.utils.escape_html(s.session_name)}
						&nbsp;·&nbsp;${frappe.utils.escape_html(b.load_class === 'review_load' ? 'Review' : 'New Patient')}
					</div>
				</div>

				<!-- Actions -->
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">
					<button id="rd-print-btn" class="rd-btn-secondary">
						🖨 Print Slip
					</button>
					<button id="rd-new-booking-btn" class="rd-btn-primary">
						New Booking
					</button>
				</div>
			</div>
		`);

		this.$body.find('#rd-print-btn').on('click', () => this._print_slip());
		this.$body.find('#rd-new-booking-btn').on('click', () => {
			// Clear Special toggle for next booking
			this.state.is_special = false;
			this.$root.find('#rd-special-toggle').prop('checked', false);
			this.$root.find('#rd-special-label').css('color', 'var(--text-muted)');
			this._reset_to_search();
		});
	}

	// ── Print slip ────────────────────────────────────────────────────────────
	_print_slip() {
		const b = this.state.booking;
		const qe_name = b.queue_entry || '';

		const _render = (qr_svg) => {
			const c = this.state.child;
			const g = this.state.guardian;
			const s = this.state.sessions[this.state.session_idx];

			const report_time = _eta_fmt(b.report_by_time);
			const pred_time   = _eta_fmt(b.predicted_doctor_time);
			const age_str     = this.state.age_at_visit || '';
			const weight_str  = this.state.weight_at_booking ? `${this.state.weight_at_booking} kg` : '';
			const complaint   = this.state.complaint || '';

			const win = window.open('', '_blank',
				'width=420,height=620,toolbar=0,menubar=0,scrollbars=0');
			win.document.write(`<!DOCTYPE html><html><head>
				<meta charset="utf-8"><title>Token Slip</title>
				<style>
					body { font-family: sans-serif; padding: 24px; }
					.t { font-size: 64px; font-weight: 900; text-align: center; }
					.label { font-size: 10px; font-weight: 700; text-transform: uppercase;
						letter-spacing: 1px; color: #666; }
					.val { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
					.cap { font-size: 12px; color: #666; margin-bottom: 4px; }
					hr { margin: 16px 0; }
					.qr-block { text-align: center; margin: 16px 0 8px; }
					.qr-block svg { width: 130px; height: 130px; }
					.qr-hint { font-size: 10px; color: #999; margin-top: 4px; }
				</style></head><body>
				<div class="t">${frappe.utils.escape_html(_display_token(b))}</div>
				<hr>
				<div class="label">Patient</div>
				<div class="val">${frappe.utils.escape_html(c.patient_name || c.patient)}${age_str ? ' · ' + frappe.utils.escape_html(age_str) : ''}</div>
				<div class="cap">${frappe.utils.escape_html(g.guardian_name)} · ${frappe.utils.escape_html(g.mobile)}</div>
				${complaint ? `<div class="cap" style="margin-top:4px;">Complaint: <strong>${frappe.utils.escape_html(complaint)}</strong></div>` : ''}
				${weight_str ? `<div class="cap">Weight: <strong>${frappe.utils.escape_html(weight_str)}</strong></div>` : ''}
				<hr>
				<div class="label">Session</div>
				<div class="cap">${frappe.utils.escape_html(s.session_name)}</div>
				<hr>
				<div class="label">Report By</div>
				<div class="val">${frappe.utils.escape_html(report_time)}</div>
				<div class="label">Estimated Doctor Time</div>
				<div class="cap">${frappe.utils.escape_html(pred_time)}</div>
				<hr>
				<div class="cap">${frappe.utils.escape_html(b.load_class === 'review_load' ? 'Review Patient' : 'New Patient')}</div>
				${qr_svg ? `<div class="qr-block">${qr_svg}<div class="qr-hint">Scan at arrival kiosk · ${frappe.utils.escape_html(qe_name)}</div></div>` : ''}
			</body></html>`);
			win.document.close();
			win.print();
		};

		if (qe_name) {
			frappe.call({
				method: 'clinic_flow.api.arrival.get_token_qr',
				args: { queue_entry: qe_name },
				callback: (r) => _render(r.message || ''),
				error: () => _render(''),
			});
		} else {
			_render('');
		}
	}

	// ── Reset helpers ─────────────────────────────────────────────────────────
	_reset_to_search() {
		this.state = {
			step:             'search',
			channel:          this.state.channel,
			is_special:       this.state.is_special,
			mobile:           '',
			guardian:         null,
			children:         [],
			child:            null,
			visit_type:       null,
			sessions:         [],
			walkin_preview_sessions: [],
			walkin_preview_loading: false,
			session_idx:      0,
			booking:          null,
			override_token:   null,
			complaint:        null,
			weight_at_booking: null,
			age_at_visit:     null,
			phone_context_collapsed: false,
			phone_flow_mode:  this.state.channel === 'phone' ? this.state.phone_flow_mode : 'availability',
			phone_inquiry_load_class: this.state.channel === 'phone' ? this.state.phone_inquiry_load_class : 'non_review_load',
			phone_post_session_lookup: false,
			provisional_load_class: this.state.channel === 'walkin' ? this.state.provisional_load_class : null,
			walkin_phase:     'token_pick',
			walkin_notice:    null,
			token_board_open: this.state.channel === 'walkin',
		};
		this.token_board.clear_highlight();
		this.render_admission();
	}
}


// ─────────────────────────────────────────────────────────────────────────────
// Token Board component (center panel)
// ─────────────────────────────────────────────────────────────────────────────
class TokenBoard {
	// Cell state → visual config
	static CELL_STYLES = {
		available:    { bg: '#f0fdf4', border: '#16a34a', color: '#15803d', sub: '' },
		vip_buffer:   { bg: '#fef9c3', border: '#d97706', color: '#a16207', sub: '★' },
		booked:       { bg: '#fee2e2', border: '#dc2626', color: '#991b1b', sub: '' },
		called:       { bg: '#dbeafe', border: '#1d4ed8', color: '#1e40af', sub: 'CALL' },
		no_response:  { bg: '#ffedd5', border: '#ea580c', color: '#9a3412', sub: 'N/R' },
		ready:        { bg: '#ede9fe', border: '#7c3aed', color: '#5b21b6', sub: 'RDY' },
		with_doctor:  { bg: '#1d4ed8', border: '#1d4ed8', color: '#fff',    sub: 'DOC' },
		completed:    { bg: '#f3f4f6', border: '#d1d5db', color: '#9ca3af', sub: '✓' },
		pushed_to_end:{ bg: '#f3f4f6', border: '#d1d5db', color: '#d1d5db', sub: '↓' },
	};

	static LEGEND = [
		{ state: 'available',    label: 'Available' },
		{ state: 'vip_buffer',   label: 'Special' },
		{ state: 'booked',       label: 'Booked' },
		{ state: 'called',       label: 'Called' },
		{ state: 'no_response',  label: 'No Response' },
		{ state: 'ready',        label: 'Ready' },
		{ state: 'with_doctor',  label: 'With Doctor' },
		{ state: 'completed',    label: 'Done' },
	];

	constructor(dashboard, $container) {
		this.dashboard         = dashboard;
		this.$container        = $container;
		this.$session_label    = $container.find('#rd-board-session-label');
		this.$session_select   = $container.find('#rd-board-session');
		this.$close_btn        = $container.find('#rd-board-close');
		this.$refresh_btn      = $container.find('#rd-board-refresh');
		this.$legend           = $container.find('#rd-board-legend');
		this.$context          = $container.find('#rd-board-context');
		this.$grid             = $container.find('#rd-board-grid');
		this.$drawer           = $container.find('#rd-board-drawer');

		this.current_session   = null;
		this.board_data        = null;
		this.recommended_token = null; // highlighted with a ring

		this._render_legend();
		this._load_session_list();
		this._bind_events();
		this._subscribe_realtime();
	}

	// ── Initialisation ────────────────────────────────────────────────────────
	_render_legend() {
		const items = TokenBoard.LEGEND.map(({ state, label }) => {
			const s = TokenBoard.CELL_STYLES[state];
			return `<span style="display:inline-flex;align-items:center;gap:4px;
				font-size:10px;color:var(--text-muted);">
				<span style="width:10px;height:10px;border-radius:2px;flex-shrink:0;
					background:${s.bg};border:1.5px solid ${s.border};"></span>
				${label}
			</span>`;
		});
		this.$legend.html(items.join(''));
	}

	_render_walkin_toolbar() {
		const db = this.dashboard;
		const provisional = db.state.provisional_load_class;
		const sessions = db.state.walkin_preview_sessions || [];
		const currentIdx = Math.max(0, db.state.session_idx || 0);
		const chips = sessions.map((session, idx) => `
			<button class="rd-walkin-session-chip ${idx === currentIdx ? 'is-active' : ''}"
				data-idx="${idx}"
				style="border:${idx === currentIdx ? '1.5px solid var(--primary)' : '1.5px solid var(--border-color)'};
					background:${idx === currentIdx ? 'rgba(15,92,77,.08)' : 'var(--card-bg)'};
					color:${idx === currentIdx ? 'var(--primary)' : 'inherit'};
					border-radius:999px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;">
				${frappe.utils.escape_html(session.practitioner_name || session.session_name)}
				${session.start_time && session.end_time ? ` · ${frappe.utils.escape_html(session.start_time)}-${frappe.utils.escape_html(session.end_time)}` : ''}
			</button>
		`).join('');

		this.$legend.html(`
			<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
				<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
					<span class="rd-label" style="margin:0;">Intake</span>
					<button class="rd-walkin-load-chip"
						data-load-class="review_load"
						style="border:${provisional === 'review_load' ? '1.5px solid var(--primary)' : '1.5px solid var(--border-color)'};
							background:${provisional === 'review_load' ? 'rgba(15,92,77,.08)' : 'var(--card-bg)'};
							color:${provisional === 'review_load' ? 'var(--primary)' : 'inherit'};
							border-radius:999px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;">
						Review
					</button>
					<button class="rd-walkin-load-chip"
						data-load-class="non_review_load"
						style="border:${provisional === 'non_review_load' ? '1.5px solid var(--primary)' : '1.5px solid var(--border-color)'};
							background:${provisional === 'non_review_load' ? 'rgba(15,92,77,.08)' : 'var(--card-bg)'};
							color:${provisional === 'non_review_load' ? 'var(--primary)' : 'inherit'};
							border-radius:999px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;">
						New
					</button>
				</div>
				<label id="rd-walkin-special-label"
					style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;
						font-weight:600;color:${db.state.is_special ? '#d97706' : 'var(--text-muted)'};">
					<input type="checkbox" id="rd-walkin-special-toggle" style="cursor:pointer;"
						${db.state.is_special ? 'checked' : ''}>
					Special
				</label>
			</div>
			${chips ? `
			<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;">
				<span class="rd-label" style="margin:0;">Today</span>
				${chips}
			</div>` : ''}
		`);

		this.$legend.find('.rd-walkin-load-chip').on('click', (e) => {
			const next = $(e.currentTarget).data('load-class');
			db.state.provisional_load_class = next;
			db.state.override_token = null;
			db.state.walkin_notice = `Showing ${db._load_label(next)} guidance. Pick a token below.`;
			db.state.walkin_preview_sessions = [];
			db._load_walkin_preview(true);
			db.render_admission();
		});

		this.$legend.find('#rd-walkin-special-toggle').on('change', (e) => {
			db.state.is_special = e.target.checked;
			db.state.override_token = null;
			db.state.walkin_notice = 'Special mode changed. Pick a token below.';
			db.state.walkin_preview_sessions = [];
			db._load_walkin_preview(true);
			db.render_admission();
		});

		this.$legend.find('.rd-walkin-session-chip').on('click', (e) => {
			const nextIdx = parseInt($(e.currentTarget).data('idx'), 10);
			if (Number.isNaN(nextIdx)) return;
			db.state.session_idx = nextIdx;
			db.state.override_token = null;
			db.state.walkin_notice = null;
			const picked = sessions[nextIdx];
			if (picked) this.load(picked.queue_session, null);
			db.render_admission();
		});
	}

	_load_session_list() {
		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'Queue Session',
				filters: [
					['session_date', '>=', frappe.datetime.get_today()],
					['status', 'in', ['Scheduled', 'Active', 'Paused']],
				],
				fields: ['name', 'session_name', 'session_date', 'start_time', 'dept_abbr'],
				order_by: 'session_date asc, start_time asc',
				limit: 20,
			},
			callback: (r) => {
				if (!r.message) return;
				const opts = r.message.map(s =>
					`<option value="${frappe.utils.escape_html(s.name)}">
						${frappe.utils.escape_html(s.session_name || s.name)}
						(${frappe.utils.escape_html(s.session_date)})
					</option>`
				).join('');
				this.$session_select.html(
					'<option value="">Select session…</option>' + opts
				);
				// Auto-select first active session if board is empty
				if (!this.current_session && r.message.length) {
					const active = r.message.find(s => s.status === 'Active') || r.message[0];
					// Don't auto-load yet — wait for left panel or explicit selection
				}
			},
		});
	}

	_bind_events() {
		this.$session_select.on('change', () => {
			const qs = this.$session_select.val();
			if (qs) this.load(qs);
			else { this._clear_board(); this.current_session = null; }
		});

		this.$close_btn.on('click', () => {
			this.dashboard.state.token_board_open = false;
			this.dashboard.render_admission();
		});

		this.$refresh_btn.on('click', () => {
			if (this.current_session) this.load(this.current_session);
		});
	}

	_subscribe_realtime() {
		frappe.realtime.on('queue_update', (data) => {
			if (data && data.queue_session === this.current_session) {
				this.load(this.current_session, this.recommended_token);
			}
		});
	}

	// ── Public API ────────────────────────────────────────────────────────────

	/** Load (or reload) the board for a given session. Optionally highlight a token. */
	load(queue_session, highlight_token = null, after_load = null) {
		if (!queue_session) return;
		this.current_session = queue_session;
		if (highlight_token !== null) this.recommended_token = highlight_token;

		// Sync the select element
		if (this.$session_select.val() !== queue_session) {
			this.$session_select.val(queue_session);
			if (!this.$session_select.val()) {
				// Option not in list yet — add it and re-select
				this.$session_select.append(
					`<option value="${frappe.utils.escape_html(queue_session)}">
						${frappe.utils.escape_html(queue_session)}
					</option>`
				);
				this.$session_select.val(queue_session);
			}
		}

		frappe.call({
			method: 'clinic_flow.api.admission.get_token_board',
			args: {
				queue_session,
				load_class: this.dashboard._effective_load_class(),
			},
			callback: (r) => {
				if (!r.message) return;
				this.board_data = r.message;
				this._update_session_label(r.message.session);
				this._render_board();
				if (typeof after_load === 'function') after_load(r.message);
			},
		});
	}

	pick_best_available(isSpecial = false) {
		if (!this.board_data) return null;
		const used = new Set((this.board_data.entries || [])
			.filter(e => e.token_number)
			.map(e => Number(e.token_number)));
		const special = [...(this.board_data.special_buffer_reserved || [])].map(Number);
		if (isSpecial) {
			for (const token of special) {
				if (!used.has(token)) return token;
			}
			return null;
		}
		const specialSet = new Set(special);
		const maxToken = Number(this.board_data.max_token || 0);
		for (let token = 1; token <= maxToken; token++) {
			if (!used.has(token) && !specialSet.has(token)) return token;
		}
		return null;
	}

	/** Set/clear the recommended token ring without reloading from server. */
	set_recommended(token_number) {
		this.recommended_token = token_number;
		if (this.board_data) this._render_board();
	}

	/** Remove all highlights (called on booking reset). */
	clear_highlight() {
		this.recommended_token = null;
		if (this.board_data) this._render_board();
	}

	// ── Board rendering ───────────────────────────────────────────────────────
	_clear_board() {
		this.$session_label.text('Select a session…');
		this.$context.hide().empty();
		this.$grid.html(
			'<div style="text-align:center;padding:40px 0;color:var(--text-muted);">' +
			'Select a session to view the token board.</div>'
		);
	}

	_update_session_label(sessionMeta = null) {
		if (!sessionMeta) {
			this.$session_label.text('Select a session…');
			return;
		}
		const dateLabel = sessionMeta.session_date
			? frappe.datetime.str_to_user(sessionMeta.session_date, false, true)
			: '';
		const timeLabel = sessionMeta.start_time && sessionMeta.end_time
			? `${sessionMeta.start_time} – ${sessionMeta.end_time}`
			: '';
		this.$session_label.text(
			[sessionMeta.session_name || this.current_session, dateLabel, timeLabel]
				.filter(Boolean)
				.join(' · ')
		);
	}

	_render_board() {
		const data           = this.board_data;
		const entries_map    = {};                          // token_number → entry
		(data.entries || []).forEach(e => {
			if (e.token_number) entries_map[e.token_number] = e;
		});
		const vip_set        = new Set(data.special_buffer_reserved || []);
		const max_token      = data.max_token || 0;

		if (max_token === 0) {
			this.$grid.html(
				'<div style="text-align:center;padding:40px 0;color:var(--text-muted);">' +
				'No tokens in this session yet.</div>'
			);
			return;
		}

		const cells = [];
		const groupedCells = new Map();
		const tokenEstimates = data.token_estimates || {};
		for (let n = 1; n <= max_token; n++) {
			const entry = entries_map[n] || null;
			const state = this._cell_state(n, entry, vip_set);
			const style = TokenBoard.CELL_STYLES[state] || TokenBoard.CELL_STYLES.available;
			const is_rec = (n === this.recommended_token);
			const is_clickable = (state === 'available' || entry !== null);
			const classes = [
				'rd-token-cell',
				this.dashboard.state.channel === 'walkin' ? 'has-eta' : '',
				is_clickable ? 'clickable' : '',
				is_rec ? 'recommended' : '',
			].filter(Boolean).join(' ');

			const opacity = (state === 'pushed_to_end') ? 'opacity:.4;' : '';

			const cellHtml = `
				<div class="${classes}"
					data-token="${n}"
					data-state="${state}"
					data-entry="${entry ? frappe.utils.escape_html(entry.name) : ''}"
					style="background:${style.bg};border-color:${style.border};
						color:${style.color};${opacity}">
					<span>${n}</span>
					${style.sub ? `<span class="rd-cell-sub">${style.sub}</span>` : ''}
				</div>
			`;
			cells.push(cellHtml);
			if (this.dashboard.state.channel === 'walkin') {
				const band = _report_band(tokenEstimates[n]?.report_by_time);
				if (!groupedCells.has(band)) groupedCells.set(band, []);
				groupedCells.get(band).push(cellHtml);
			}
		}

		const boardBody = this.dashboard.state.channel === 'walkin'
			? `<div class="rd-walkin-board-groups">
				${Array.from(groupedCells.entries()).map(([band, bandCells]) => `
					<div class="rd-walkin-board-group">
						<div class="rd-walkin-board-band">
							<div class="rd-walkin-board-band-title">${frappe.utils.escape_html(band)}</div>
							<div class="rd-caption">${bandCells.length} tokens</div>
						</div>
						<div class="rd-walkin-board-grid">
							${bandCells.join('')}
						</div>
					</div>
				`).join('')}
			</div>`
			: `<div class="rd-walkin-board-grid">${cells.join('')}</div>`;

		this.$grid.html(`
			<div class="rd-walkin-board-shell">
				<div class="rd-walkin-board-head">
					<div class="rd-walkin-board-copy">
						<div class="rd-label" style="margin:0;">Step 1</div>
						<div class="rd-walkin-board-title">Choose token for walk-in intake</div>
						<div class="rd-caption">Pick the token first. Guardian lookup and child confirmation continue on the right.</div>
					</div>
					<div class="rd-caption" style="font-weight:700;white-space:nowrap;">
						${max_token} tokens
					</div>
				</div>
				${boardBody}
			</div>
		`);

		this.$grid.off('click', '.rd-token-cell').on('click', '.rd-token-cell', (e) => {
			const $cell = $(e.currentTarget);
			const token_number = parseInt($cell.data('token'), 10);
			const state = $cell.data('state');
			const entry_name = $cell.data('entry');
			this._on_cell_click(token_number, state, entry_name);
		});

		this.render_walkin_context();
	}

	_render_context_dock() {
		const db = this.dashboard;
		const isWalkinSearch = db.state.channel === 'walkin' && db.state.walkin_phase === 'token_pick';
		if (!isWalkinSearch) {
			this.$context.hide().empty();
			return;
		}

		const session = db.state.walkin_preview_sessions[db.state.session_idx] || null;
		const hasToken = !!db.state.override_token;
		const tokenValue = hasToken
			? frappe.utils.escape_html(String(db.state.override_token))
			: '—';
		const reportBy = hasToken && this.board_data && this.board_data.token_estimates
			? _report_by_label(this.board_data.token_estimates[db.state.override_token]?.report_by_time)
			: '—';
		const tokenEta = hasToken && this.board_data && this.board_data.token_estimates
			? _eta_slot(
				this.board_data.token_estimates[db.state.override_token]?.predicted_doctor_time,
				this.board_data.token_estimates[db.state.override_token]?.estimated_window_end
			)
			: '—';
		this.$context.show().html(`
			<div class="rd-walkin-dock">
				<div class="rd-walkin-selected-token">
					<div class="rd-walkin-token-hero">
						<div style="flex:1;min-width:0;">
							<div class="rd-label" style="margin-bottom:4px;">Walk-in Intake</div>
							<div class="rd-walkin-stage-title">
								${hasToken ? 'Token selected. Continue with guardian mobile.' : 'Pick a token to start intake.'}
							</div>
							<div class="rd-walkin-stage-meta">
								${session ? `${frappe.utils.escape_html(session.practitioner_name || session.session_name)} · ${frappe.utils.escape_html(session.start_time)}-${frappe.utils.escape_html(session.end_time)}` : 'No active session'}
								${hasToken && reportBy !== '—' ? ` · ${frappe.utils.escape_html(reportBy)}` : ''}
							</div>
						</div>
						<div class="rd-walkin-token-badge">
							<span class="token-label">Token</span>
							<span class="token-value">${tokenValue}</span>
						</div>
					</div>
				</div>
				<div class="rd-walkin-stage-card">
					<div class="rd-walkin-stage-title">${hasToken ? 'Continue Intake' : 'Waiting for Token'}</div>
					<div class="rd-walkin-stage-meta">
						${hasToken
							? `Search by guardian mobile to continue. ${reportBy !== '—' ? `${frappe.utils.escape_html(reportBy)}.` : ''}`
							: 'Select the token on the left first. The intake steps will appear here immediately after selection.'}
					</div>
					${hasToken ? `
					<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
						${reportBy !== '—' ? `<span class="rd-badge rd-badge-amber">${frappe.utils.escape_html(reportBy)}</span>` : ''}
						${tokenEta !== '—' ? `<span class="rd-badge rd-badge-blue">Likely ${frappe.utils.escape_html(tokenEta)}</span>` : ''}
					</div>` : ''}
					${hasToken ? `
					<div style="margin-bottom:8px;">
						<div class="rd-label" style="margin-bottom:4px;">Parent / Guardian Mobile</div>
						<input id="rd-board-mobile-input" class="rd-input"
							type="tel" placeholder="Enter mobile to continue"
							value="${frappe.utils.escape_html(db.state.mobile || '')}"
							autocomplete="off">
					</div>
					<button id="rd-board-search-btn" class="rd-btn-primary"
						style="width:100%;">
						Search Guardian
					</button>` : `
					<div class="rd-caption">
						Review/New and Special controls above change the guidance, but the actual intake begins only after a token is chosen.
					</div>`}
				</div>
			</div>
			${db.state.walkin_notice ? `
			<div class="rd-walkin-note">
				${frappe.utils.escape_html(db.state.walkin_notice)}
			</div>` : ''}
		`);

		if (!hasToken) return;
		const $input = this.$context.find('#rd-board-mobile-input');
		const do_search = () => {
			const mobile = $input.val().trim();
			if (!mobile) {
				frappe.show_alert({ message: 'Enter a mobile number.', indicator: 'orange' });
				return;
			}
			db.state.mobile = mobile;
			db._do_search_guardian(mobile);
		};

		this.$context.find('#rd-board-search-btn').on('click', do_search);
		$input.on('keydown', (e) => { if (e.key === 'Enter') do_search(); });
	}

	render_walkin_context() {
		const db = this.dashboard;
		if (db.state.channel !== 'walkin') {
			this._render_legend();
			this.$context.hide().empty();
			return;
		}
		this._render_walkin_toolbar();
		if (!db.state.walkin_preview_sessions.length || !this.current_session) {
			db._load_walkin_preview();
		}
		switch (db.state.walkin_phase) {
		case 'token_pick':
			return this._render_context_dock();
		case 'guardian_result':
			return this._render_walkin_guardian_found();
		case 'guardian_missing':
			return this._render_walkin_guardian_not_found();
		case 'register_child':
			return this._render_walkin_register();
		case 'confirm':
			return this._render_walkin_confirm();
		case 'done':
			return this._render_walkin_confirmed();
		default:
			return this._render_context_dock();
		}
	}

	_render_walkin_guardian_found() {
		const db = this.dashboard;
		const g = db.state.guardian;
		const children = db.state.children || [];
		this.$context.show().html(`
			<div class="rd-walkin-stage-card">
				<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
					<div>
						<div class="rd-label">Guardian Found</div>
						<div class="rd-walkin-stage-title">${frappe.utils.escape_html(g.guardian_name)}</div>
						<div class="rd-caption">${frappe.utils.escape_html(g.mobile)}</div>
					</div>
					<button id="rd-board-change-mobile" class="rd-btn-secondary" style="font-size:11px;">Change</button>
				</div>
				<div class="rd-label" style="margin-bottom:8px;">Select Child</div>
				<div class="rd-walkin-rows">
					${children.map(c => `
						<button class="rd-child-row" data-patient="${frappe.utils.escape_html(c.patient)}"
							style="width:100%;text-align:left;background:var(--card-bg);margin-bottom:0;padding:8px 10px;">
							<div style="flex:1;">
								<div style="font-size:13px;font-weight:600;">
									${frappe.utils.escape_html(c.patient_name || c.patient)}
								</div>
								<div class="rd-caption">
									${c.dob ? frappe.utils.escape_html(c.dob) : 'DOB unknown'}
									${c.age_display ? '&nbsp;·&nbsp;' + frappe.utils.escape_html(c.age_display) : ''}
								</div>
							</div>
							<span style="font-size:11px;color:var(--text-muted);">Select →</span>
						</button>
					`).join('')}
				</div>
				<button id="rd-board-add-child" class="rd-btn-secondary" style="width:100%;margin-top:8px;">
					+ Add New Child
				</button>
			</div>
		`);
		this.$context.find('#rd-board-change-mobile').on('click', () => db._reset_to_search());
		this.$context.find('.rd-child-row').on('click', (e) => {
			const patient = $(e.currentTarget).data('patient');
			const child = db.state.children.find(c => c.patient === patient);
			if (child) db._do_select_child(child);
		});
		this.$context.find('#rd-board-add-child').on('click', () => {
			db.state.walkin_phase = 'register_child';
			db.state.walkin_notice = null;
			db.state._register_mode = 'add_child';
			db.render_admission();
		});
	}

	_render_walkin_guardian_not_found() {
		const db = this.dashboard;
		this.$context.show().html(`
			<div class="rd-walkin-stage-card">
				<div class="rd-card" style="border-color:#f87171;margin-bottom:10px;">
					<div style="font-size:13px;font-weight:600;color:#dc2626;margin-bottom:4px;">
						No guardian found
					</div>
					<div class="rd-caption">
						Mobile: <strong>${frappe.utils.escape_html(db.state.mobile)}</strong>
						is not registered.
					</div>
				</div>
				<button id="rd-board-register-btn" class="rd-btn-primary">
					Register New Guardian & Child
				</button>
				<button id="rd-board-back-search" class="rd-btn-secondary"
					style="width:100%;margin-top:8px;">
					← Try different number
				</button>
			</div>
		`);
		this.$context.find('#rd-board-register-btn').on('click', () => {
			db.state.walkin_phase = 'register_child';
			db.state.walkin_notice = null;
			db.state._register_mode = 'new';
			db.render_admission();
		});
		this.$context.find('#rd-board-back-search').on('click', () => db._reset_to_search());
	}

	_render_walkin_register() {
		const db = this.dashboard;
		const is_new = db.state._register_mode === 'new';
		const g = db.state.guardian;
		this.$context.show().html(`
			<div class="rd-walkin-stage-card">
				<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
					<button id="rd-board-reg-back" class="rd-btn-secondary" style="font-size:11px;">←</button>
					<span class="rd-walkin-stage-title" style="margin:0;">
						${is_new ? 'Register New Guardian & Child' : 'Add Child to ' + frappe.utils.escape_html(g.guardian_name)}
					</span>
				</div>
				${is_new ? `
				<div class="rd-label" style="margin-bottom:6px;">Guardian Details</div>
				<input id="rd-reg-guardian-name" class="rd-input" placeholder="Guardian full name *"
					style="margin-bottom:8px;" />
				<input id="rd-reg-mobile" class="rd-input" placeholder="Mobile number *"
					value="${frappe.utils.escape_html(db.state.mobile)}"
					style="margin-bottom:8px;" />
				<select id="rd-reg-relationship" class="rd-input" style="margin-bottom:14px;">
					<option value="">Relationship (optional)</option>
					<option value="Father">Father</option>
					<option value="Mother">Mother</option>
					<option value="Guardian">Guardian</option>
					<option value="Other">Other</option>
				</select>
				` : ''}
				<div class="rd-label" style="margin-bottom:6px;">Child Details</div>
				<input id="rd-reg-child-name" class="rd-input" placeholder="Child full name *"
					style="margin-bottom:8px;" />
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
					<input id="rd-reg-dob" class="rd-input" type="date" placeholder="Date of Birth" />
					<select id="rd-reg-sex" class="rd-input">
						<option value="Male">Male</option>
						<option value="Female">Female</option>
					</select>
				</div>
				<button id="rd-board-reg-submit" class="rd-btn-primary" style="margin-top:6px;">
					${is_new ? 'Register & Continue' : 'Add Child & Continue'}
				</button>
			</div>
		`);
		this.$context.find('#rd-board-reg-back').on('click', () => {
			db.state.walkin_phase = is_new ? 'guardian_missing' : 'guardian_result';
			db.state.walkin_notice = null;
			db.render_admission();
		});
		this.$context.find('#rd-board-reg-submit').on('click', () => db._do_register(is_new));
	}

	_render_walkin_confirm() {
		const db = this.dashboard;
		const c = db.state.child;
		const vt = db.state.visit_type;
		const s = db.state.sessions[db.state.session_idx] || db.state.walkin_preview_sessions[db.state.session_idx];
		if (!c || !vt || !s) return this._render_context_dock();
		const is_review = vt.load_class === 'review_load';
		this.$context.show().html(`
			<div class="rd-walkin-stage-card rd-walkin-confirm">
				<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
					<div>
						<div class="rd-label">Selected Child</div>
						<div class="rd-walkin-stage-title" style="margin:0;">${frappe.utils.escape_html(c.patient_name || c.patient)}</div>
						<div class="rd-caption">
							Token <strong>${frappe.utils.escape_html(String(db.state.override_token || '—'))}</strong>
							· ${frappe.utils.escape_html(s.practitioner_name || s.session_name)}
						</div>
					</div>
					<span class="rd-badge ${is_review ? 'rd-badge-green' : 'rd-badge-blue'}">
						${is_review ? 'Review' : 'New'}
					</span>
				</div>
				<div class="rd-caption" style="margin-bottom:8px;">
					${frappe.utils.escape_html(s.practitioner_name || s.session_name)}
				</div>
				<div style="margin-bottom:8px;position:relative;">
					<div class="rd-caption" style="margin-bottom:6px;">
						${db.state.age_at_visit ? frappe.utils.escape_html(db.state.age_at_visit) : ''}
						${c.dob ? '&nbsp;·&nbsp;DOB ' + frappe.utils.escape_html(c.dob) : ''}
					</div>
					<div class="rd-label" style="margin-bottom:3px;">Complaint</div>
					<input id="rd-complaint-input" class="rd-input" type="text"
						autocomplete="off" placeholder="Type to search…"
						value="${frappe.utils.escape_html(db.state.complaint || '')}">
					<div id="rd-complaint-dd" style="display:none;position:absolute;
						top:100%;left:0;right:0;background:var(--card-bg);
						border:1px solid var(--border-color);border-top:none;
						border-radius:0 0 6px 6px;max-height:160px;overflow-y:auto;
						z-index:200;box-shadow:0 4px 12px rgba(0,0,0,.1);"></div>
				</div>
				<div style="display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);gap:8px;margin-bottom:8px;">
					<div>
						<div class="rd-label" style="margin-bottom:3px;">Weight</div>
						<input id="rd-weight-input" class="rd-input" type="number"
							step="0.1" min="0" placeholder="kg"
							value="${db.state.weight_at_booking || ''}">
					</div>
					<div>
						<div class="rd-label" style="margin-bottom:3px;">Age</div>
						<input id="rd-age-input" class="rd-input" type="text"
							placeholder="3y 2m"
							value="${frappe.utils.escape_html(db.state.age_at_visit || '')}">
					</div>
				</div>
				<button id="rd-board-confirm-booking" class="rd-btn-primary" style="width:100%;">
					Confirm Booking
				</button>
			</div>
		`);
		db._bind_booking_inputs();
		this.$context.find('#rd-board-confirm-booking').on('click', () => db._do_confirm_booking(s));
	}

	_render_walkin_confirmed() {
		const db = this.dashboard;
		const b = db.state.booking;
		const c = db.state.child;
		const s = db.state.sessions[db.state.session_idx];
		if (!b || !c || !s) return this._render_context_dock();
		this.$context.show().html(`
			<div class="rd-walkin-stage-card">
				<div class="rd-confirm-slip">
					<div style="font-size:28px;font-weight:900;color:#15803d;margin-bottom:4px;">
						${frappe.utils.escape_html(String(b.token_number))}
					</div>
					<div style="font-size:12px;font-weight:600;color:#15803d;margin-bottom:12px;">
						Token Number
					</div>
					<div style="margin-bottom:4px;font-size:13px;">
						<strong>${frappe.utils.escape_html(c.patient_name || c.patient)}</strong>
					</div>
					<div class="rd-caption">
						${frappe.utils.escape_html(s.session_name)}
					</div>
				</div>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">
					<button id="rd-board-print-btn" class="rd-btn-secondary">🖨 Print Slip</button>
					<button id="rd-board-new-booking-btn" class="rd-btn-primary">New Booking</button>
				</div>
			</div>
		`);
		this.$context.find('#rd-board-print-btn').on('click', () => db._print_slip());
		this.$context.find('#rd-board-new-booking-btn').on('click', () => {
			db.state.is_special = false;
			db.$root.find('#rd-special-toggle').prop('checked', false);
			db.$root.find('#rd-special-label').css('color', 'var(--text-muted)');
			db._reset_to_search();
		});
	}

	_cell_state(token_number, entry, vip_set) {
		if (entry) {
			const status_map = {
				'Booked':           'booked',
				'Waiting':          'booked',
				'Called':           'called',
				'No Response':      'no_response',
				'Ready Near Doctor':'ready',
				'With Doctor':      'with_doctor',
				'Completed':        'completed',
				'Done':             'completed',
				'Pushed to End':    'pushed_to_end',
				'Skipped':          'completed',
				'No Show':          'completed',
			};
			return status_map[entry.status] || 'booked';
		}
		if (vip_set.has(token_number)) return 'vip_buffer';
		return 'available';
	}

	// ── Cell click ────────────────────────────────────────────────────────────
	_on_cell_click(token_number, state, entry_name) {
		const db = this.dashboard;
		const admission_step = db.state.step;
		const walkinTokenPick = db.state.channel === 'walkin'
			&& ['token_pick', 'guardian_result', 'guardian_missing', 'register_child', 'confirm']
				.includes(db.state.walkin_phase);
		const allowSelection = admission_step === 'session_offered' || walkinTokenPick;

		// Available cell during session_offered → override token selection
		if (state === 'available' && allowSelection) {
			db.state.override_token = token_number;
			if (db.state.channel === 'walkin') db.state.walkin_notice = null;
			this.set_recommended(token_number);
			// Mark cell with override-selected style
			this.$grid.find(`.rd-token-cell[data-token="${token_number}"]`)
				.addClass('override-selected').removeClass('recommended');
			db.render_admission();
			return;
		}

		// Special buffer cell during Special session_offered → select it
		if (state === 'vip_buffer' && allowSelection
			&& db.state.is_special) {
			db.state.override_token = token_number;
			if (db.state.channel === 'walkin') db.state.walkin_notice = null;
			this.set_recommended(token_number);
			db.render_admission();
			return;
		}

		// Occupied / buffer cell → show detail drawer
		if (entry_name) {
			const entry = (this.board_data.entries || []).find(e => e.name === entry_name);
			if (entry) this._show_detail(entry);
		} else if (state === 'vip_buffer') {
			this._show_special_detail(token_number);
		}
	}

	// ── Detail drawer ─────────────────────────────────────────────────────────
	_show_detail(entry) {
		const report_time = _eta_fmt(entry.report_by_time);
		const pred_time   = _eta_fmt(entry.predicted_doctor_time);

		const status_colors = {
			'Booked':           '#fee2e2',
			'Called':           '#dbeafe',
			'No Response':      '#ffedd5',
			'Ready Near Doctor':'#ede9fe',
			'With Doctor':      '#dbeafe',
			'Completed':        '#f3f4f6',
			'Done':             '#f3f4f6',
			'Pushed to End':    '#f3f4f6',
		};
		const status_bg = status_colors[entry.status] || '#f3f4f6';

		this.$drawer.html(`
			<div>
				<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
					<div style="font-size:22px;font-weight:900;color:var(--primary);">
						${frappe.utils.escape_html(String(entry.token_number))}
					</div>
					<div style="flex:1;">
						<div style="font-size:14px;font-weight:700;">
							${frappe.utils.escape_html(entry.patient_name || entry.patient)}
						</div>
						<span style="padding:2px 8px;border-radius:999px;font-size:10px;
							font-weight:700;background:${status_bg};">
							${frappe.utils.escape_html(entry.status)}
						</span>
					</div>
					<button id="rd-drawer-close" class="rd-btn-secondary"
						style="padding:4px 10px;font-size:11px;">✕ Close</button>
				</div>

				<div class="rd-drawer-section">
					<div class="rd-label">Load Class</div>
					<div class="rd-val">
						${entry.load_class === 'review_load'
							? '<span class="rd-badge rd-badge-green">Review Patient</span>'
							: '<span class="rd-badge rd-badge-blue">New Patient</span>'}
					</div>
				</div>

				<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
					<div class="rd-drawer-section" style="margin-bottom:0;">
						<div class="rd-label">Report By</div>
						<div class="rd-val">${frappe.utils.escape_html(report_time)}</div>
					</div>
					<div class="rd-drawer-section" style="margin-bottom:0;">
						<div class="rd-label">Est. Doctor</div>
						<div class="rd-val">${frappe.utils.escape_html(pred_time)}</div>
					</div>
				</div>

				${entry.called_to_reception_at ? `
				<div class="rd-drawer-section">
					<div class="rd-label">Called to Reception</div>
					<div class="rd-caption">
						${frappe.utils.escape_html(
							frappe.datetime.str_to_user(entry.called_to_reception_at, true)
						)}
					</div>
				</div>` : ''}

				${entry.no_response_at ? `
				<div class="rd-drawer-section">
					<div class="rd-label">No Response Since</div>
					<div class="rd-caption">
						${frappe.utils.escape_html(
							frappe.datetime.str_to_user(entry.no_response_at, true)
						)}
						${entry.hold_patients_count
							? '&nbsp;·&nbsp;Hold count: '
								+ frappe.utils.escape_html(String(entry.hold_patients_count))
							: ''}
					</div>
				</div>` : ''}

				<div class="rd-caption" style="margin-top:8px;color:var(--text-muted);">
					Queue Entry: ${frappe.utils.escape_html(entry.name)}
				</div>
			</div>
		`).show();

		this.$drawer.find('#rd-drawer-close').on('click', () => this._hide_detail());
	}

	_show_special_detail(token_number) {
		this.$drawer.html(`
			<div>
				<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
					<div style="font-size:22px;font-weight:900;color:#d97706;">${token_number}</div>
					<div style="flex:1;">
						<div style="font-size:14px;font-weight:700;">Special Buffer Slot</div>
						<span class="rd-badge rd-badge-amber">Reserved</span>
					</div>
					<button id="rd-drawer-close" class="rd-btn-secondary"
						style="padding:4px 10px;font-size:11px;">✕ Close</button>
				</div>
				<div class="rd-caption">
					This token position is a Special buffer slot.<br>
					Enable the Special toggle in the admission panel to assign it to a patient.
				</div>
			</div>
		`).show();
		this.$drawer.find('#rd-drawer-close').on('click', () => this._hide_detail());
	}

	_hide_detail() {
		this.$drawer.hide().empty();
	}
}


// ─────────────────────────────────────────────────────────────────────────────
// Live Session Panel (right panel)
// ─────────────────────────────────────────────────────────────────────────────
class LiveSessionPanel {
	constructor(dashboard, $container) {
		this.dashboard        = dashboard;
		this.$container       = $container;
		this.$chips_bar       = $container.find('#rd-live-session-chips');
		this.$counts          = $container.find('#rd-live-counts');
		this.$panel           = $container.find('#rd-live-panel');
		this.$refresh_btn     = $container.find('#rd-live-refresh');
		this.current_session       = null;
		this._expanding            = null; // queue_entry being expanded for reception form
		this._fee_data             = {};   // cache: entry name → {covered, charge, validity_till}
		this._session_practitioner = null;
		this._sessions_cache       = [];   // last result from get_session_urgency_summary

		this._load_session_chips();
		this._bind_events();
		this._subscribe_realtime();
	}

	// ── Setup ─────────────────────────────────────────────────────────────────
	_load_session_chips() {
		frappe.call({
			method: 'clinic_flow.api.queue.get_session_urgency_summary',
			callback: (r) => {
				const sessions = r.message || [];
				this._sessions_cache = sessions;
				this._render_chips(sessions);
				// Auto-select: active session, or first if only one
				if (!this.current_session) {
					const auto = sessions.find(s => s.status === 'Active') || (sessions.length === 1 ? sessions[0] : null);
					if (auto) this.load(auto.name);
				}
			},
		});
	}

	_render_chips(sessions) {
		if (!sessions.length) {
			this.$chips_bar.html('<span class="rd-caption">No sessions today</span>');
			return;
		}
		const chips = sessions.map(s => {
			const isActive = s.name === this.current_session;
			const dotClass = s.status === 'Active' ? 'active' : s.status === 'Paused' ? 'paused' : 'scheduled';
			const statusClass = s.status === 'Active' ? 'is-active-status' : s.status === 'Paused' ? 'is-paused-status' : '';
			const label = frappe.utils.escape_html(s.practitioner_name || s.session_name || s.name);
			// Emergency first (highest urgency), then arrived (physically present), then total active
			const emergBadge = s.emergency_count > 0
				? `<span class="rd-live-chip-badge emerg" title="${s.emergency_count} emergency">${s.emergency_count}</span>` : '';
			const arrivedBadge = s.arrived_count > 0
				? `<span class="rd-live-chip-badge arrived" title="${s.arrived_count} arrived">${s.arrived_count}</span>` : '';
			const activeBadge = s.active_count > 0
				? `<span class="rd-live-chip-badge active-ct" title="${s.active_count} active">${s.active_count}</span>` : '';
			const tokenDisplay = isActive && s.current_token
				? `<span class="rd-live-chip-token">→ ${frappe.utils.escape_html(s.current_token)}</span>` : '';
			return `<button class="rd-live-session-chip ${isActive ? 'is-active' : statusClass}"
				data-session="${frappe.utils.escape_html(s.name)}"
				title="${frappe.utils.escape_html(s.session_name || s.name)}">
				<span class="rd-live-chip-dot ${dotClass}"></span>
				${label}
				${emergBadge}${arrivedBadge}${activeBadge}${tokenDisplay}
			</button>`;
		}).join('');
		this.$chips_bar.html(chips);
		this.$chips_bar.find('.rd-live-session-chip').on('click', (e) => {
			const qs = $(e.currentTarget).data('session');
			if (qs) this.load(qs);
		});
	}

	_bind_events() {
		this.$refresh_btn.on('click', () => {
			this._load_session_chips();
			if (this.current_session) this.load(this.current_session);
		});
	}

	_subscribe_realtime() {
		frappe.realtime.on('queue_update', (data) => {
			if (data && data.queue_session === this.current_session) {
				this.load(this.current_session);
			}
			// Refresh chip counts on any queue update
			this._load_session_chips();
		});
		frappe.realtime.on('session_status', (data) => {
			if (!data) return;
			this._load_session_chips();
			if (data.status === 'Active' && !this.current_session && data.queue_session) {
				this.load(data.queue_session);
			}
		});
	}

	// ── Load and render ───────────────────────────────────────────────────────
	load(queue_session) {
		this.current_session = queue_session;
		// Re-render chips to reflect newly-active selection
		this._render_chips(this._sessions_cache);
		frappe.call({
			method: 'clinic_flow.api.queue.get_live_session_state',
			args: { queue_session },
			callback: (r) => {
				if (!r.message) return;
				this._render(r.message);
			},
		});
	}

	refresh() {
		if (this.current_session) this.load(this.current_session);
	}

	_render(data) {
		// Preserve _expanding so an open reception form is not collapsed
		// by background reloads or resume actions.
		// _expanding is only cleared explicitly by cancel or confirm.
		this._session_practitioner = (data.session && data.session.practitioner) || null;
		this._render_counts(data.counts);
		this._render_pipeline(data);
	}

	_render_counts(counts) {
		this.$counts.html(`
			<div class="rd-ops-stat-grid">
				<div class="rd-ops-stat-tile">
					<div class="rd-ops-stat-label">Done Today</div>
					<div class="rd-ops-stat-value">${counts.completed_today}</div>
					<div class="rd-ops-stat-note">Completed consultations</div>
				</div>
				<div class="rd-ops-stat-tile">
					<div class="rd-ops-stat-label">Here Now</div>
					<div class="rd-ops-stat-value" style="${counts.arrived_count > 0 ? 'color:#0369a1;' : ''}">${counts.arrived_count || 0}</div>
					<div class="rd-ops-stat-note">Self-checked in</div>
				</div>
				<div class="rd-ops-stat-tile">
					<div class="rd-ops-stat-label">Remaining</div>
					<div class="rd-ops-stat-value">${counts.remaining}</div>
					<div class="rd-ops-stat-note">Still active in queue</div>
				</div>
				<div class="rd-ops-stat-tile emergency">
					<div class="rd-ops-stat-label">Emergency Pending</div>
					<div class="rd-ops-stat-value">${counts.emergency_pending || 0}</div>
					<div class="rd-ops-stat-note">Requires reconciliation</div>
				</div>
			</div>
		`);
	}

	_render_pipeline(data) {
		const sections = [];

		if (data.emergency_pending && data.emergency_pending.length) {
			sections.push(this._section_emergency_pending(data.emergency_pending));
		}

		// WITH DOCTOR
		if (data.with_doctor.length) {
			sections.push(this._section_with_doctor(data.with_doctor[0]));
		}

		// READY NEAR DOCTOR
		if (data.ready.length) {
			sections.push(this._section_ready(data.ready));
		}

		// AT RECEPTION (Called)
		if (data.called.length) {
			sections.push(this._section_called(data.called));
		}

		// HERE NOW (Arrived — physically present, awaiting reception call)
		if (data.arrived && data.arrived.length) {
			sections.push(this._section_arrived(data.arrived));
		}

		// EXPECTED (previously "Due Soon" — not yet arrived)
		if (data.due_soon.length) {
			sections.push(this._section_due_soon(data.due_soon));
		}

		// NO RESPONSE
		if (data.no_response.length) {
			sections.push(this._section_no_response(data.no_response));
		}

		// PUSHED TO END
		if (data.pushed_to_end && data.pushed_to_end.length) {
			sections.push(this._section_pushed_to_end(data.pushed_to_end));
		}

		if (!sections.length) {
			this.$panel.html(`
				<div style="text-align:center;padding:32px 0;color:var(--text-muted);">
					<div style="font-size:13px;font-weight:600;margin-bottom:4px;">
						Queue is empty
					</div>
					<div class="rd-caption">No active patients in this session.</div>
				</div>
			`);
			return;
		}

		this.$panel.html(sections.join(''));
		this._bind_action_buttons();
	}

	// ── Section builders ──────────────────────────────────────────────────────
	_section_with_doctor(e) {
		const since = e.seen_at ? frappe.datetime.str_to_user(e.seen_at, true) : '';
		return `
		<div class="rd-pipeline-section">
			<div class="rd-pipeline-header is-passive">
				▶ With Doctor
			</div>
			<div class="rd-patient-card with-doctor">
				<div style="display:flex;align-items:center;gap:8px;">
					<span class="rd-rail-token" style="color:var(--rd-muted);min-width:74px;">
						${frappe.utils.escape_html(_display_token(e))}
					</span>
					<div style="flex:1;">
						<div class="rd-rail-card-title">
							${frappe.utils.escape_html(e.patient_name || e.patient)}
						</div>
						<div class="rd-rail-card-meta">
							${e.load_class === 'review_load'
								? '<span class="rd-badge rd-badge-green" style="font-size:9px;">Review</span>'
								: '<span class="rd-badge rd-badge-blue" style="font-size:9px;">New</span>'}
							${since ? '&nbsp;· Since ' + frappe.utils.escape_html(since) : ''}
						</div>
					</div>
					<div class="rd-rail-card-side" style="color:var(--rd-muted);display:flex;align-items:center;">
						<span class="rd-in-session-dot"></span>In session
					</div>
				</div>
			</div>
		</div>`;
	}

	_section_emergency_pending(entries) {
		const cards = entries.map(e => {
			const token = e.token ? frappe.utils.escape_html(_display_token(e)) : 'Alert only';
			const summary = e.complaint_summary
				? `<div class="rd-caption" style="margin-top:3px;">${frappe.utils.escape_html(e.complaint_summary)}</div>`
				: '';
			const statusTone = e.status === 'Alerted' ? '#b45309' : '#b91c1c';
			const actions = e.status === 'Alerted'
				? `
					<button class="rd-action-btn rd-action-btn-red rd-rail-utility-btn rd-confirm-emergency-arrival-btn"
						data-intake="${frappe.utils.escape_html(e.name)}"
						data-session="${frappe.utils.escape_html(e.queue_session || '')}"
						data-patient="${frappe.utils.escape_html(e.patient || '')}"
						data-label="${frappe.utils.escape_html(e.display_label || '')}"
						data-mobile="${frappe.utils.escape_html(e.mobile || '')}"
						data-complaint="${frappe.utils.escape_html(e.complaint_summary || '')}">
						Confirm Arrival
					</button>`
				: `
					<button class="rd-action-btn rd-action-btn-green rd-rail-utility-btn rd-mark-emergency-reconciled-btn"
						data-intake="${frappe.utils.escape_html(e.name)}">
						Mark Reconciled
					</button>`;
			return `
				<div class="rd-patient-card emergency">
					<div style="display:flex;align-items:flex-start;gap:10px;">
						<div style="min-width:62px;text-align:center;">
							<div class="rd-emergency-status" style="background:${e.status === 'Alerted' ? '#fef3c7' : '#fee2e2'};color:${statusTone};">
								${frappe.utils.escape_html(e.status)}
							</div>
							<div class="rd-emergency-token" style="color:${statusTone};">
								${token}
							</div>
						</div>
						<div style="flex:1;">
							<div style="font-size:12px;font-weight:800;color:var(--rd-text);">
								${frappe.utils.escape_html(e.patient_name || e.display_label || 'Emergency Intake')}
							</div>
							<div class="rd-caption" style="margin-top:2px;">
								${frappe.utils.escape_html(e.channel === 'phone' ? 'Phone emergency' : 'Walk-in emergency')}
								${e.queue_status ? ` · ${frappe.utils.escape_html(e.queue_status)}` : ''}
							</div>
							${summary}
						</div>
						<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;justify-content:center;">
							${actions}
						</div>
					</div>
				</div>`;
		}).join('');

		return `
		<div class="rd-pipeline-section">
			<div class="rd-pipeline-header is-urgent">
				Emergency Pending (${entries.length})
			</div>
			${cards}
		</div>`;
	}

	_section_ready(entries) {
		const cards = entries.map(e => {
			const is_review = e.load_class === 'review_load';
			return `
			<div class="rd-patient-card ready" style="display:flex;align-items:center;gap:8px;">
					<span class="rd-rail-token" style="color:#7c3aed;min-width:74px;">
						${frappe.utils.escape_html(_display_token(e))}
					</span>
				<div style="flex:1;">
					<div class="rd-rail-card-title">
						${frappe.utils.escape_html(e.patient_name || e.patient)}
						${is_review
							? '<span class="rd-badge rd-badge-green" style="font-size:9px;margin-left:4px;">Review</span>'
							: '<span class="rd-badge rd-badge-blue" style="font-size:9px;margin-left:4px;">New</span>'}
					</div>
						${e.reception_done_at
							? `<div class="rd-rail-card-meta">Ready since ${frappe.utils.escape_html(frappe.datetime.str_to_user(e.reception_done_at, true))}</div>`
							: ''}
						${e.weight_recorded ? `<div class="rd-rail-card-meta">${e.weight_recorded} kg</div>` : ''}
					</div>
					<div class="rd-rail-card-side" style="color:#7c3aed;">
						Waiting for doctor call
					</div>
				</div>`;
			}).join('');

		return `
		<div class="rd-pipeline-section">
			<div class="rd-pipeline-header is-ready">
				Ready Near Doctor (${entries.length})
			</div>
			${cards}
		</div>`;
	}

	_section_called(entries) {
		const cards = entries.map(e => {
			const call_time = e.called_to_reception_at
				? frappe.datetime.str_to_user(e.called_to_reception_at, true) : '';
			const elapsed  = _call_elapsed(e.called_to_reception_at);
			const is_expanding = (this._expanding === e.name);

			const elapsed_html = elapsed ? (() => {
				const color = elapsed.urgent ? '#ea580c' : 'var(--rd-muted)';
				const bar   = elapsed.urgent
					? `<div style="height:3px;border-radius:2px;background:var(--rd-border);margin-top:4px;">
						<div style="height:100%;border-radius:2px;width:${elapsed.pct}%;
							background:${elapsed.pct >= 100 ? '#dc2626' : '#ea580c'};"></div>
					   </div>`
					: '';
				return `<div style="font-size:10px;color:${color};margin-top:2px;font-weight:${elapsed.urgent ? 700 : 400};">
					${frappe.utils.escape_html(elapsed.label)} at reception
				</div>${bar}`;
			})() : '';

			return `
			<div class="rd-patient-card called"
				data-entry="${frappe.utils.escape_html(e.name)}"
				data-patient="${frappe.utils.escape_html(e.patient || '')}">
				<div style="display:flex;align-items:center;gap:8px;margin-bottom:${is_expanding ? '8px' : '0'};">
					<span class="rd-rail-token" style="color:#1d4ed8;min-width:74px;">
						${frappe.utils.escape_html(_display_token(e))}
					</span>
					<div style="flex:1;">
						<div class="rd-rail-card-title">
							${frappe.utils.escape_html(e.patient_name || e.patient)}
						</div>
						${call_time ? `<div class="rd-rail-card-meta">Called ${frappe.utils.escape_html(call_time)}</div>` : ''}
						${elapsed_html}
					</div>
					<div style="display:flex;gap:4px;">
						<button class="rd-action-btn rd-action-btn-green rd-rail-btn-positive rd-complete-reception-btn"
							data-entry="${frappe.utils.escape_html(e.name)}">
							✓ Reception
						</button>
						<button class="rd-action-btn rd-action-btn-orange rd-rail-btn-warning rd-no-response-btn"
							data-entry="${frappe.utils.escape_html(e.name)}"
							title="No Response">
							N/R
						</button>
					</div>
				</div>

				${is_expanding ? (() => {
					const fd = this._fee_data[e.name];
					let fee_html = '';
					if (!fd) {
						fee_html = `<div class="rd-recep-fee-band pending">Checking fee validity…</div>`;
					} else if (fd.covered) {
						fee_html = `<div class="rd-recep-fee-band covered">
							✓ Fee Validity — Covered
							${fd.validity_till ? `<span style="font-weight:400;color:var(--text-muted);">
								(valid till ${frappe.datetime.str_to_user(fd.validity_till)})</span>` : ''}
						</div>`;
					} else {
						const amt = fd.charge ? `₹${fd.charge}` : '—';
						fee_html = `<div class="rd-recep-fee-band due">Payment Due: ${amt}</div>`;
					}
					return `
				<div class="rd-recep-form">
					<div class="rd-recep-head">
						<div class="rd-recep-head-title">Complete Reception</div>
						<div class="rd-caption">Collect payment · weigh · send up</div>
					</div>
					${fee_html}
					<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
						<select class="rd-recep-input rd-pay-mode">
							<option value="">Payment mode</option>
							<option value="Cash">Cash</option>
							<option value="Card">Card</option>
							<option value="UPI">UPI</option>
							<option value="Insurance">Insurance</option>
							<option value="Free">Free / Waived</option>
						</select>
						<input class="rd-recep-input rd-pay-amount" type="number"
							placeholder="Amount ₹" min="0" step="0.01"
							${fd && !fd.covered && fd.charge ? `value="${fd.charge}"` : ''} />
					</div>
					<input class="rd-recep-input rd-weight" type="number"
						placeholder="Weight (kg)" min="0" step="0.1"
						style="margin-bottom:6px;" />
					<div class="rd-recep-actions">
							<button class="rd-action-btn rd-action-btn-green rd-rail-btn-primary rd-confirm-reception-btn"
								style="flex:1;"
								data-entry="${frappe.utils.escape_html(e.name)}">
								Send to Doctor
							</button>
						<button class="rd-action-btn rd-rail-btn-neutral rd-cancel-recep-btn"
							data-entry="${frappe.utils.escape_html(e.name)}">
							Cancel
						</button>
					</div>
				</div>`;
				})() : ''}
			</div>`;
		}).join('');

		return `
		<div class="rd-pipeline-section">
			<div class="rd-pipeline-header is-active">
				At Reception — Called (${entries.length})
			</div>
			${cards}
		</div>`;
	}

	_section_arrived(entries) {
		const cards = entries.map(e => {
			const token_html = frappe.utils.escape_html(_display_token(e));
			const name_html  = frappe.utils.escape_html(e.patient_name || e.patient || '');
			const load_html  = e.load_class === 'review_load' ? 'Review'
				: e.load_class === 'non_review_load' ? 'New' : '';
			return `
			<div class="rd-patient-card rd-arrived-card" style="display:flex;align-items:center;gap:10px;padding:9px 12px;">
				<span class="rd-token-badge" style="min-width:52px;text-align:center;">${token_html}</span>
				<span style="flex:1;font-size:13px;font-weight:600;color:var(--rd-text);">${name_html}</span>
				<span style="font-size:11px;color:var(--rd-muted);">${load_html}</span>
				<button class="rd-action-btn rd-call-to-reception-inline"
					data-entry="${frappe.utils.escape_html(e.name)}"
					title="Call to reception">Call</button>
			</div>`;
		}).join('');

		return `
		<div class="rd-pipeline-section">
			<div class="rd-pipeline-header is-arrived">Here Now — ${entries.length} arrived</div>
			${cards}
		</div>`;
	}

	_section_due_soon(entries) {
		const rows = entries.map(e => {
			const loadLabel = e.load_class === 'review_load' ? 'Review' : 'New';
			const loadColor = e.load_class === 'review_load' ? '#0369a1' : '#15803d';
			const loadBg    = e.load_class === 'review_load' ? '#dbeafe' : '#dcfce7';
			const reportLine = e.report_by_time
				? `<span class="rd-caption" style="margin-left:4px;">· Report by ${frappe.utils.escape_html(
					frappe.datetime.str_to_user(e.report_by_time, true))}</span>` : '';
			const bookedAgo = e.creation ? `<span class="rd-caption">${_elapsed_short(e.creation)} ago</span>` : '';
			return `
			<div class="rd-due-soon-row rd-call-to-reception-inline"
				data-entry="${frappe.utils.escape_html(e.name)}"
				title="Call ${frappe.utils.escape_html(e.patient_name || e.patient)} to reception">
				<span class="rd-due-token-num">${frappe.utils.escape_html(_display_token(e))}</span>
				<span style="flex:1;min-width:0;">
					<span style="font-size:12px;font-weight:600;">
						${frappe.utils.escape_html(e.patient_name || e.patient)}
					</span>
					<span class="rd-due-load-badge"
						style="background:${loadBg};color:${loadColor};">${loadLabel}</span>
					${reportLine}
				</span>
				${bookedAgo}
			</div>`;
		}).join('');

		return `
		<div class="rd-pipeline-section">
			<div class="rd-pipeline-header is-due">Expected</div>
			<div style="display:flex;flex-direction:column;gap:4px;">${rows}</div>
		</div>`;
	}

	_section_no_response(entries) {
		const config_threshold = 3; // matches server default
		const cards = entries.map(e => {
			const hold = e.hold_patients_count || 0;
			const pct = Math.min(100, Math.round(hold / config_threshold * 100));
			const nr_time = e.no_response_at
				? frappe.datetime.str_to_user(e.no_response_at, true) : '';

			return `
			<div class="rd-patient-card no-resp">
				<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
					<span style="font-size:14px;font-weight:800;color:#ea580c;min-width:28px;">
						${frappe.utils.escape_html(_display_token(e))}
					</span>
					<div style="flex:1;">
						<div style="font-size:12px;font-weight:600;">
							${frappe.utils.escape_html(e.patient_name || e.patient)}
						</div>
						${nr_time ? `<div class="rd-caption">Since ${frappe.utils.escape_html(nr_time)}</div>` : ''}
					</div>
					<div style="display:flex;gap:4px;">
						<button class="rd-action-btn rd-action-btn-green rd-resume-btn"
							data-entry="${frappe.utils.escape_html(e.name)}">
							Resume
						</button>
						<button class="rd-action-btn rd-action-btn-red rd-push-end-btn"
							data-entry="${frappe.utils.escape_html(e.name)}">
							Push to End
						</button>
					</div>
				</div>
				<!-- Hold progress bar -->
				<div style="font-size:10px;color:var(--text-muted);margin-bottom:3px;">
					Hold: ${hold}/${config_threshold} patients
				</div>
				<div style="height:4px;border-radius:2px;background:var(--border-color);">
					<div style="height:100%;border-radius:2px;width:${pct}%;
						background:${pct >= 100 ? '#dc2626' : '#ea580c'};"></div>
				</div>
			</div>`;
		}).join('');

		return `
		<div class="rd-pipeline-section">
			<div class="rd-pipeline-header" style="color:#ea580c;">
				No Response (${entries.length})
			</div>
			${cards}
		</div>`;
	}

	_section_pushed_to_end(entries) {
		const cards = entries.map(e => `
			<div class="rd-patient-card" style="display:flex;align-items:center;gap:8px;">
				<span class="rd-rail-token" style="color:var(--rd-muted);min-width:74px;">
					${frappe.utils.escape_html(_display_token(e))}
				</span>
				<span style="font-size:12px;color:var(--text-muted);flex:1;">
					${frappe.utils.escape_html(e.patient_name || e.patient)}
				</span>
				<button class="rd-action-btn rd-action-btn-blue rd-call-pushed-btn"
					data-entry="${frappe.utils.escape_html(e.name)}"
					title="Call this patient to reception again">
					Call Now
				</button>
			</div>
		`).join('');

		return `
		<div class="rd-pipeline-section">
			<div class="rd-pipeline-header" style="color:var(--text-muted);">
				Pushed to End (${entries.length})
			</div>
			${cards}
		</div>`;
	}

	// ── Fee validity fetch ────────────────────────────────────────────────────
	_fetch_fee_validity(queue_entry, patient) {
		if (!patient || !this._session_practitioner) return;
		frappe.call({
			method: 'clinic_flow.api.appointments.get_consultation_charge',
			args: { practitioner: this._session_practitioner, patient },
			callback: (r) => {
				if (!r.message) return;
				this._fee_data[queue_entry] = {
					covered:       r.message.covered_by_validity,
					charge:        r.message.charge,
					validity_till: r.message.validity_till,
				};
				// Only re-render the live panel if this entry is still expanding
				if (this._expanding === queue_entry && this.current_session) {
					this.load(this.current_session);
				}
			},
		});
	}

	// ── Action button wiring ──────────────────────────────────────────────────
	_bind_action_buttons() {
		// Due Soon token → call to reception
		this.$panel.find('.rd-call-to-reception-inline').on('click', (e) => {
			const entry = $(e.currentTarget).data('entry');
			this._action_call_to_reception(entry);
		});

		// Called card → expand reception form + fetch fee validity
		this.$panel.find('.rd-complete-reception-btn').on('click', (e) => {
			const $btn   = $(e.currentTarget);
			const entry  = $btn.data('entry');
			const $card  = $btn.closest('.rd-patient-card');
			const patient = $card.data('patient') || null;
			if (this._expanding === entry) {
				this._expanding = null;
				if (this.current_session) this.load(this.current_session);
			} else {
				this._expanding = entry;
				if (this.current_session) this.load(this.current_session);
				// Fetch fee validity in background; re-render when data arrives
				if (patient && this._session_practitioner) {
					this._fetch_fee_validity(entry, patient);
				}
			}
		});

		// Cancel reception form
		this.$panel.find('.rd-cancel-recep-btn').on('click', (e) => {
			const entry = $(e.currentTarget).data('entry');
			if (entry) delete this._fee_data[entry];
			this._expanding = null;
			if (this.current_session) this.load(this.current_session);
		});

		// Confirm reception form
		this.$panel.find('.rd-confirm-reception-btn').on('click', (e) => {
			const $btn    = $(e.currentTarget);
			const entry   = $btn.data('entry');
			const $card   = $btn.closest('.rd-patient-card');
			const mode    = $card.find('.rd-pay-mode').val();
			const amount  = $card.find('.rd-pay-amount').val();
			const weight  = $card.find('.rd-weight').val();
			this._action_complete_reception(entry, mode, amount, weight, $btn);
		});

		// No Response
		this.$panel.find('.rd-no-response-btn').on('click', (e) => {
			const entry = $(e.currentTarget).data('entry');
			this._action_no_response(entry);
		});

		// Push to end
		this.$panel.find('.rd-push-end-btn').on('click', (e) => {
			const entry = $(e.currentTarget).data('entry');
			this._action_push_to_end(entry);
		});

		// Resume held token
		this.$panel.find('.rd-resume-btn').on('click', (e) => {
			const entry = $(e.currentTarget).data('entry');
			this._action_resume(entry);
		});

		// Call pushed-to-end patient again
		this.$panel.find('.rd-call-pushed-btn').on('click', (e) => {
			const entry = $(e.currentTarget).data('entry');
			this._action_call_to_reception(entry);
		});

		this.$panel.find('.rd-confirm-emergency-arrival-btn').on('click', (e) => {
			const $btn = $(e.currentTarget);
			this.dashboard._run_emergency_action({
				method: 'clinic_flow.api.emergency.confirm_emergency_arrival',
				args: {
					intake_name: $btn.data('intake'),
				},
				successMessage: 'Emergency arrival confirmed',
				indicator: 'red',
				refreshSession: $btn.data('session'),
			});
		});

		this.$panel.find('.rd-mark-emergency-reconciled-btn').on('click', (e) => {
			const intake = $(e.currentTarget).data('intake');
			this._action_mark_emergency_reconciled(intake);
		});
	}

	// ── Individual actions ────────────────────────────────────────────────────
	_action_call_to_reception(queue_entry) {
		frappe.call({
			method: 'clinic_flow.api.queue.call_to_reception',
			args: { queue_entry },
			callback: (r) => {
				if (r.message) {
					frappe.show_alert({
						message: `Token ${r.message.token || ''} called to reception`,
						indicator: 'blue',
					});
					this.load(this.current_session);
				}
			},
		});
	}

	_action_complete_reception(queue_entry, payment_mode, paid_amount, weight_kg, $btn) {
		$btn.prop('disabled', true).html('<span class="rd-spinner"></span>');
		frappe.call({
			method: 'clinic_flow.api.queue.complete_reception',
			args: {
				queue_entry,
				weight_kg:    weight_kg ? parseFloat(weight_kg) : null,
				payment_mode: payment_mode || '',
				paid_amount:  paid_amount ? parseFloat(paid_amount) : null,
			},
			callback: (r) => {
				if (r.message) {
					frappe.show_alert({ message: 'Patient ready near doctor', indicator: 'green' });
					delete this._fee_data[queue_entry];
					this._expanding = null;
					this.load(this.current_session);
					// Refresh token board too
					this.dashboard.token_board.load(this.current_session);
				}
			},
			error: () => { $btn.prop('disabled', false).text('Send to Doctor'); },
		});
	}

	_action_no_response(queue_entry) {
		frappe.call({
			method: 'clinic_flow.api.queue.mark_no_response',
			args: { queue_entry },
			callback: (r) => {
				if (r.message) {
					frappe.show_alert({ message: 'Marked No Response', indicator: 'orange' });
					this.load(this.current_session);
					this.dashboard.token_board.load(this.current_session);
				}
			},
		});
	}

	_action_push_to_end(queue_entry) {
		frappe.confirm(
			'Push this patient to the end of the queue?',
			() => {
				frappe.call({
					method: 'clinic_flow.api.queue.push_to_end',
					args: { queue_entry },
					callback: (r) => {
						if (r.message) {
							frappe.show_alert({ message: 'Pushed to end', indicator: 'orange' });
							this.load(this.current_session);
							this.dashboard.token_board.load(this.current_session);
						}
					},
				});
			}
		);
	}

	_action_resume(queue_entry) {
		frappe.call({
			method: 'clinic_flow.api.queue.resume_held_token',
			args: { queue_entry },
			callback: (r) => {
				if (r.message) {
					const token_label = r.message.token || '';
					if (this._expanding) {
						// A reception form is already open — don't collapse it.
						// Just inform the receptionist; they'll handle this patient next.
						frappe.show_alert({
							message: `Token ${token_label} resumed. Finish current reception first, then call them.`,
							indicator: 'blue',
						}, 7);
						// Only refresh the token board so their status updates visually
						this.dashboard.token_board.load(this.current_session);
					} else {
						frappe.show_alert({
							message: `Token ${token_label} resumed — process at reception`,
							indicator: 'blue',
						});
						this.load(this.current_session);
						this.dashboard.token_board.load(this.current_session);
					}
				}
			},
			});
		}

	_action_mark_emergency_reconciled(intake_name) {
		frappe.prompt(
			[
				{
					fieldname: 'notes',
					fieldtype: 'Small Text',
					label: 'Notes',
				},
			],
			(values) => {
				frappe.call({
					method: 'clinic_flow.api.emergency.mark_emergency_reconciled',
					args: {
						intake_name,
						notes: values.notes || '',
					},
					callback: (r) => {
						if (r.message) {
							frappe.show_alert({ message: 'Emergency reconciliation completed', indicator: 'green' });
							this.load(this.current_session);
						}
					},
				});
			},
			'Mark Emergency Reconciled',
			'Complete'
		);
	}
}
