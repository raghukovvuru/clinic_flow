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
#rd-root * { box-sizing: border-box; }
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
	grid-template-columns:240px minmax(0, 1fr);
}
#rd-root.walkin-mode #rd-center {
	display:flex !important;
	border-right:none;
}
#rd-root.walkin-mode #rd-right {
	display:none !important;
}
#rd-root.walkin-mode #rd-left {
	border-right:1px solid var(--border-color);
}
#rd-root.walkin-mode #rd-steps {
	display:none !important;
}
#rd-root.phone-mode #rd-right { min-width:340px; }
.rd-availability-groups {
	display:flex;
	flex-direction:column;
	gap:12px;
	margin-bottom:12px;
}
.rd-availability-group-grid {
	display:flex;
	flex-direction:column;
	gap:6px;
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
.rd-walkin-confirm {
	border:1px solid var(--border-color);
	border-radius:10px;
	background:var(--card-bg);
	padding:12px;
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
		grid-template-columns:220px minmax(0, 1fr);
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
		grid-template-columns:200px minmax(0, 1fr);
	}
	.rd-availability-group-grid {
		grid-template-columns:1fr;
	}
}
.rd-session-row {
	border: 1px solid var(--border-color);
	border-radius: 10px;
	background: var(--card-bg);
	padding: 10px 12px;
}
.rd-session-row.is-active {
	border-color: var(--primary);
	box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.12);
}
.rd-session-row.is-recommended {
	border-color: #16a34a;
	background: linear-gradient(180deg, rgba(240, 253, 244, 0.85) 0%, var(--card-bg) 100%);
}
.rd-session-row-main {
	display:grid;
	grid-template-columns:minmax(210px, 1.7fr) minmax(78px, .7fr) minmax(220px, 1.2fr) auto;
	gap:10px;
	align-items:center;
}
.rd-session-row-actions {
	display:flex;
	gap:6px;
	justify-content:flex-end;
}
.rd-session-inline-form {
	margin-top:10px;
	padding-top:10px;
	border-top:1px solid var(--border-color);
}
@media (max-width: 1280px) {
	.rd-session-row-main {
		grid-template-columns:minmax(180px, 1.4fr) minmax(72px, .7fr) minmax(160px, 1fr) auto;
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
.rd-scan-chip.fit-chip { background:#dbeafe; color:#1d4ed8; }
.rd-scan-chip.hour-chip { background:#f3f4f6; color:#374151; }
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
	font-size: 10px; font-weight: 700; color: var(--text-muted);
	text-transform: uppercase; letter-spacing: 1px;
}
.rd-caption { font-size: 11px; color: var(--text-muted); }

/* channel tab pills */
.rd-mode-btn {
	padding: 6px 18px; border: none; background: transparent;
	font-size: 12px; font-weight: 600; cursor: pointer;
	color: var(--text-muted); border-bottom: 2px solid transparent;
	transition: all .15s;
}
.rd-mode-btn.active { color: var(--primary); border-bottom-color: var(--primary); }

/* step indicator */
.rd-step {
	flex: 1; text-align: center; padding: 6px 4px;
	font-size: 10px; font-weight: 700; color: var(--text-muted);
	border-bottom: 2px solid var(--border-color); transition: all .2s;
}
.rd-step.active { color: var(--primary); border-bottom-color: var(--primary); }
.rd-step.done   { color: #16a34a;       border-bottom-color: #16a34a; }

/* inputs */
.rd-input {
	width: 100%; padding: 9px 12px; border: 1.5px solid var(--border-color);
	border-radius: 7px; font-size: 13px; outline: none;
	background: var(--input-bg); transition: border-color .15s;
}
.rd-input:focus { border-color: var(--primary); }

/* buttons */
.rd-btn-primary {
	padding: 9px 20px; border-radius: 7px; border: none;
	background: var(--primary); color: #fff; font-size: 13px;
	font-weight: 600; cursor: pointer; transition: opacity .15s; width: 100%;
}
.rd-btn-primary:hover { opacity: .88; }
.rd-btn-primary:disabled { opacity: .45; cursor: not-allowed; }
.rd-btn-secondary {
	padding: 8px 16px; border-radius: 7px;
	border: 1px solid var(--border-color); background: var(--card-bg);
	font-size: 12px; font-weight: 500; cursor: pointer; transition: all .15s;
}
.rd-btn-secondary:hover { border-color: var(--primary); color: var(--primary); }

/* cards */
.rd-card {
	border: 1px solid var(--border-color); border-radius: 8px;
	padding: 12px 14px; margin-bottom: 8px; background: var(--card-bg);
}
.rd-card-selectable {
	border: 1px solid var(--border-color); border-radius: 8px;
	padding: 12px 14px; margin-bottom: 8px; background: var(--card-bg);
	cursor: pointer; transition: border-color .15s, box-shadow .15s;
}
.rd-card-selectable:hover {
	border-color: var(--primary); box-shadow: 0 2px 8px rgba(0,0,0,.08);
}
.rd-card-selectable.selected {
	border-color: var(--primary); background: var(--primary-light);
}

/* child row */
.rd-child-row {
	display: flex; align-items: center; gap: 10px; padding: 10px 12px;
	border-radius: 7px; cursor: pointer; transition: background .1s;
	border: 1.5px solid var(--border-color); margin-bottom: 6px;
}
.rd-child-row:hover { background: var(--bg-color); border-color: var(--primary); }
.rd-child-row.selected { border-color: var(--primary); background: var(--primary-light); }

/* badges */
.rd-badge {
	padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700;
	display: inline-block;
}
.rd-badge-green  { background: #dcfce7; color: #15803d; }
.rd-badge-amber  { background: #fef9c3; color: #a16207; }
.rd-badge-blue   { background: #dbeafe; color: #1d4ed8; }
.rd-badge-gray   { background: var(--bg-color); color: var(--text-muted); }

/* session offer card */
.rd-session-card {
	border: 1.5px solid var(--primary); border-radius: 10px; padding: 16px;
	background: var(--card-bg); margin-bottom: 12px;
}

/* confirmation slip */
.rd-confirm-slip {
	border: 2px solid #16a34a; border-radius: 10px; padding: 18px;
	background: #f0fdf4; text-align: center;
}

/* spinner */
.rd-spinner {
	display: inline-block; width: 18px; height: 18px;
	border: 2px solid var(--border-color); border-top-color: var(--primary);
	border-radius: 50%; animation: rd-spin .6s linear infinite;
}
@keyframes rd-spin { to { transform: rotate(360deg); } }

/* token board cells */
.rd-token-cell {
	width: 44px; height: 44px; border-radius: 7px; border: 1.5px solid;
	display: flex; flex-direction: column; align-items: center; justify-content: center;
	font-size: 11px; font-weight: 700; cursor: default;
	transition: transform .1s, box-shadow .1s; position: relative; flex-shrink: 0;
}
.rd-token-cell.clickable { cursor: pointer; }
.rd-token-cell.clickable:hover { transform: scale(1.08); }
.rd-token-cell.recommended {
	box-shadow: 0 0 0 3px var(--primary) !important;
}
.rd-token-cell.override-selected {
	box-shadow: 0 0 0 3px #16a34a !important;
}
.rd-token-cell .rd-cell-sub {
	font-size: 8px; font-weight: 400; line-height: 1; margin-top: 1px;
}

/* detail drawer */
.rd-drawer-section { margin-bottom: 14px; }
.rd-drawer-section .rd-label { margin-bottom: 4px; }
.rd-drawer-section .rd-val { font-size: 14px; font-weight: 600; }

/* live session panel */
.rd-pipeline-section { margin-bottom: 14px; }
.rd-pipeline-header {
	font-size: 10px; font-weight: 700; text-transform: uppercase;
	letter-spacing: 1px; color: var(--text-muted);
	padding: 4px 0 6px; border-bottom: 1px solid var(--border-color);
	margin-bottom: 6px;
}
.rd-patient-card {
	border: 1px solid var(--border-color); border-radius: 8px;
	padding: 8px 10px; margin-bottom: 6px; background: var(--card-bg);
}
.rd-patient-card.with-doctor {
	border-color: #1d4ed8; background: #eff6ff;
}
.rd-patient-card.ready   { border-color: #7c3aed; background: #faf5ff; }
.rd-patient-card.called  { border-color: #1d4ed8; background: #eff6ff; }
.rd-patient-card.no-resp { border-color: #ea580c; background: #fff7ed; }
.rd-action-btn {
	padding: 4px 10px; border-radius: 5px; font-size: 11px; font-weight: 600;
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
.rd-recep-form {
	margin-top: 8px; padding: 8px; border-radius: 6px;
	background: var(--bg-color); border: 1px solid var(--border-color);
}
.rd-recep-input {
	padding: 6px 8px; border: 1.5px solid var(--border-color); border-radius: 5px;
	font-size: 12px; outline: none; background: var(--input-bg); width: 100%;
}
.rd-recep-input:focus { border-color: var(--primary); }
</style>

<div id="rd-root" style="display:flex;flex-direction:column;height:calc(100vh - 60px);overflow:hidden;">

	<!-- ── TOP BAR ─────────────────────────────────────────────────────────── -->
	<div id="rd-topbar"
		style="flex-shrink:0;padding:8px 20px;background:var(--card-bg);
			border-bottom:1px solid var(--border-color);
			display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
		<span id="rd-topbar-date" style="font-size:12px;font-weight:600;color:var(--text-muted);"></span>
		<div id="rd-topbar-sessions" style="display:flex;gap:10px;flex-wrap:wrap;flex:1;"></div>
		<div id="rd-topbar-doctor" style="font-size:12px;color:var(--text-muted);"></div>
	</div>

	<!-- ── THREE-COLUMN BODY ────────────────────────────────────────────────── -->
	<div class="rd-shell-grid">

		<!-- LEFT: Admission Panel ─────────────────────────────────────────── -->
		<div id="rd-left"
			style="display:flex;flex-direction:column;overflow:hidden;
				border-right:1px solid var(--border-color);">

			<!-- Left header -->
			<div style="padding:10px 16px;border-bottom:1px solid var(--border-color);flex-shrink:0;">
				<div class="rd-label" style="margin-bottom:8px;">Admit Patient</div>
				<!-- Booking mode + Special toggle -->
				<div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid var(--border-color);">
					<div id="rd-channels" style="display:flex;flex:1;">
						<button class="rd-mode-btn active" data-channel="phone">Phone Booking</button>
						<button class="rd-mode-btn" data-channel="walkin">Walk-in Intake</button>
					</div>
					<label id="rd-special-label"
						style="display:flex;align-items:center;gap:5px;cursor:pointer;
							font-size:12px;font-weight:600;color:var(--text-muted);
							padding:0 4px 2px;white-space:nowrap;"
						title="Reserve a Special buffer slot for this patient">
						<input type="checkbox" id="rd-special-toggle" style="cursor:pointer;">
						Special
					</label>
				</div>
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
			<div id="rd-board-context"
				style="display:none;padding:10px 12px;border-bottom:1px solid var(--border-color);
					flex-shrink:0;background:var(--card-bg);"></div>
			<!-- Grid / drawer area -->
			<div id="rd-board-main" style="flex:1;overflow:hidden;position:relative;">
				<div id="rd-board-grid"
					style="height:100%;overflow-y:auto;padding:12px;"></div>
				<!-- Detail drawer overlays the grid -->
				<div id="rd-board-drawer"
					style="position:absolute;top:0;left:0;right:0;bottom:0;
						background:var(--card-bg);overflow-y:auto;padding:16px;
						display:none;"></div>
			</div>
		</div>

		<!-- RIGHT: Live Session Panel ──────────────────────────────────────── -->
		<div id="rd-right" style="display:flex;flex-direction:column;overflow:hidden;">
			<!-- Header: session selector + refresh -->
			<div style="padding:8px 10px;border-bottom:1px solid var(--border-color);
				flex-shrink:0;display:flex;align-items:center;gap:6px;">
				<span class="rd-label" style="flex-shrink:0;">Live Session</span>
				<select id="rd-live-session-sel"
					style="flex:1;padding:5px 8px;
						border:1.5px solid var(--border-color);border-radius:6px;
						font-size:12px;background:var(--input-bg);outline:none;">
					<option value="">Select session…</option>
				</select>
				<button id="rd-live-refresh" title="Refresh"
					style="border:none;background:transparent;cursor:pointer;
						color:var(--text-muted);font-size:18px;line-height:1;
						padding:0 4px;flex-shrink:0;">⟳</button>
			</div>
			<!-- Counts bar -->
			<div id="rd-live-counts"
				style="padding:5px 10px;border-bottom:1px solid var(--border-color);
					flex-shrink:0;display:flex;gap:12px;"></div>
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
		this.$topbar   = this.$root.find('#rd-topbar-sessions');
		this.$topdate  = this.$root.find('#rd-topbar-date');
		this.$topdoc   = this.$root.find('#rd-topbar-doctor');
		this.$body     = this.$root.find('#rd-admission-body');
		this.$steps    = this.$root.find('#rd-steps');
		this.$channels = this.$root.find('#rd-channels');

		// Admission state
		this.state = {
			step:            'search',  // search | guardian_found | guardian_not_found |
			                            // register | child_selected | session_offered | confirmed
			channel:         'phone',   // walkin | phone
			is_special:      false,     // Special priority flag — uses buffer slots
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
			provisional_load_class: null, // walk-in intake guess before actual review/new is confirmed
			token_board_open: false,    // phone mode opens board only for manual token selection
		};

		// Token board (center panel)
		this.token_board = new TokenBoard(this, this.$root.find('#rd-center'));

		// Live session panel (right panel)
		this.live_panel = new LiveSessionPanel(this, this.$root.find('#rd-right'));

		this._bind_channel_tabs();
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
				if (!sessions || !sessions.length) {
					this.$topbar.html(
						'<span class="rd-caption">No active sessions today</span>'
					);
					return;
				}
				this.$topbar.html(sessions.map(s => `
					<span style="font-size:11px;font-weight:600;padding:3px 10px;
						border-radius:999px;
						background:${s.session_status === 'Active' ? '#dcfce7' : '#fef9c3'};
						color:${s.session_status === 'Active' ? '#15803d' : '#a16207'};">
						${frappe.utils.escape_html(s.dept_abbr || s.practitioner_name)}
						&nbsp;·&nbsp;${s.session_status === 'Active' ? '▶' : '⏸'}
						&nbsp;Token ${frappe.utils.escape_html(s.current_token || '—')}
					</span>
				`).join(''));

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
			this._reset_to_search();
		});
	}

	_apply_mode_layout() {
		const isWalkin = this.state.channel === 'walkin';
		const boardOpen = isWalkin || !!this.state.token_board_open;
		this.$root.toggleClass('phone-mode', !isWalkin);
		this.$root.toggleClass('walkin-mode', isWalkin);
		this.$root.toggleClass('board-open', boardOpen);
		this.$root.find('#rd-board-close').toggle(!isWalkin && boardOpen);
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
		return this.state.visit_type?.load_class || 'non_review_load';
	}

	// ── Main render dispatcher ───────────────────────────────────────────────
	render_admission() {
		this._apply_mode_layout();
		if (this.state.channel === 'walkin') {
			this._render_walkin_sidebar();
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
		case 'search':           return this._render_search();
		case 'guardian_found':   return this._render_guardian_found();
		case 'guardian_not_found': return this._render_guardian_not_found();
		case 'register':         return this._render_register_form();
		case 'child_selected':   return this._render_child_selected();
		case 'session_offered':  return this._render_session_offered();
		case 'confirmed':        return this._render_confirmed();
		default:                 return this._render_search();
		}
	}

	_render_walkin_sidebar() {
		this.$body.html(`
			<div>
				<div class="rd-card" style="padding:10px 12px;">
					<div style="font-size:13px;font-weight:700;margin-bottom:4px;">
						Walk-in Intake
					</div>
					<div class="rd-caption">
						Dedicated fast mode. Session, token, lookup, and confirmation happen in the center workspace.
					</div>
				</div>
			</div>
		`);
	}

	_load_walkin_preview(force = false) {
		if (this.state.channel !== 'walkin') return;
		if (this.state.walkin_preview_loading) return;
		if (!force && this.state.walkin_preview_sessions.length) {
			if (!this.token_board.current_session) {
				const picked = this.state.walkin_preview_sessions[this.state.session_idx] || this.state.walkin_preview_sessions[0];
				if (picked) this.token_board.load(picked.queue_session, this.state.override_token || null);
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
					if (picked) this.token_board.load(picked.queue_session, this.state.override_token || null);
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
		const isWalkin = this.state.channel === 'walkin';
		if (isWalkin) return this._render_walkin_search();
		const guessed = this.state.provisional_load_class;
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

	_render_walkin_search() {
		this._load_walkin_preview();
		const guessed = this.state.provisional_load_class;
		const preview = this.state.walkin_preview_sessions || [];
		const picked = preview[this.state.session_idx] || preview[0] || null;
		const tokenText = this.state.override_token
			? `Token ${frappe.utils.escape_html(String(this.state.override_token))} selected`
			: 'No token selected yet';

		this.$body.html(`
			<div>
				<div class="rd-card" style="padding:10px 12px;margin-bottom:12px;">
					<div style="font-size:13px;font-weight:700;margin-bottom:3px;">
						Walk-in Intake
					</div>
					<div class="rd-caption">
						Today-only fast intake. Pick a token first, then look up the patient.
					</div>
				</div>

				<div class="rd-card" style="padding:10px 12px;margin-bottom:12px;">
					<div class="rd-label" style="margin-bottom:8px;">Intake Guess</div>
					<div style="display:flex;gap:8px;flex-wrap:wrap;">
						<button class="rd-btn-secondary rd-provisional-load"
							data-load-class="review_load"
							style="border-color:${guessed === 'review_load' ? 'var(--primary)' : 'var(--border-color)'};color:${guessed === 'review_load' ? 'var(--primary)' : 'inherit'};">
							Likely Review
						</button>
						<button class="rd-btn-secondary rd-provisional-load"
							data-load-class="non_review_load"
							style="border-color:${guessed === 'non_review_load' ? 'var(--primary)' : 'var(--border-color)'};color:${guessed === 'non_review_load' ? 'var(--primary)' : 'inherit'};">
							Likely New
						</button>
					</div>
					<div class="rd-caption" style="margin-top:8px;">
						This is a provisional desk guess. Mobile lookup and fee validity still decide the final visit type.
					</div>
				</div>

				<div class="rd-label" style="margin-bottom:8px;">Today's Session${preview.length > 1 ? 's' : ''}</div>
				<div class="rd-walkin-session-chips">
					${this.state.walkin_preview_loading ? `
						<div class="rd-card" style="padding:12px;">
							<span class="rd-spinner"></span>
							<span class="rd-caption" style="margin-left:8px;">Loading today's sessions…</span>
						</div>
					` : preview.length ? preview.map((row, rowIdx) => `
						<button class="rd-walkin-session-chip ${picked && row.queue_session === picked.queue_session ? 'active' : ''}"
							data-idx="${rowIdx}">
							<span>${frappe.utils.escape_html(row.practitioner_name || row.session_name)}</span>
							<span class="rd-caption">
								${frappe.utils.escape_html(row.start_time)}-${frappe.utils.escape_html(row.end_time)}
							</span>
							<span class="rd-scan-chip ${(row.stress_label || '').includes('High') ? 'stress-high' : ((row.stress_label || '').includes('Medium') ? 'stress-mid' : 'stress-low')}">
								${frappe.utils.escape_html(String(row.available_slots || 0))}
							</span>
						</button>
					`).join('') : `
						<div class="rd-card" style="padding:12px;">
							<div class="rd-caption">No walk-in sessions available for the current intake guess.</div>
						</div>
					`}
				</div>

				<div class="rd-walkin-confirm" style="margin-bottom:12px;">
					<div class="rd-label" style="margin-bottom:6px;">Token Flow</div>
					<div style="font-size:13px;font-weight:700;">${tokenText}</div>
					<div class="rd-caption" style="margin-top:4px;">
						Search is now attached to the token board. Select a token, then continue from the center panel.
					</div>
					${picked ? `
					<div class="rd-caption" style="margin-top:8px;">
						Active:
						<strong>${frappe.utils.escape_html(picked.practitioner_name || picked.session_name)}</strong>
						· ${frappe.utils.escape_html(picked.start_time)} – ${frappe.utils.escape_html(picked.end_time)}
					</div>` : ''}
				</div>
			</div>
		`);
		this.$body.find('.rd-provisional-load').on('click', (e) => {
			this.state.provisional_load_class = $(e.currentTarget).data('load-class');
			this.state.override_token = null;
			this.state.walkin_preview_sessions = [];
			this.render_admission();
		});
		this.$body.find('.rd-walkin-session-chip').on('click', (e) => {
			const nextIdx = Number($(e.currentTarget).data('idx'));
			if (Number.isNaN(nextIdx)) return;
			this.state.session_idx = nextIdx;
			this.state.override_token = null;
			const selected = this.state.walkin_preview_sessions[nextIdx];
			if (selected) this.token_board.load(selected.queue_session);
			this.render_admission();
		});
	}

	_do_search_guardian(mobile) {
		this.$body.find('#rd-search-btn').prop('disabled', true).html(
			'<span class="rd-spinner"></span>'
		);

		frappe.call({
			method: 'clinic_flow.api.family.search_guardian',
			args: { mobile },
			callback: (r) => {
				if (!r.message) return;
				const result = r.message;
				if (result.found) {
					this.state.guardian = result.guardian;
					this.state.children = result.children || [];
					this.state.step = 'guardian_found';
				} else {
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
				<!-- Guardian card -->
				<div class="rd-card" style="margin-bottom:12px;">
					<div style="display:flex;align-items:center;justify-content:space-between;">
						<div>
							<div style="font-size:14px;font-weight:700;">
								${frappe.utils.escape_html(g.guardian_name)}
							</div>
							<div class="rd-caption">${frappe.utils.escape_html(g.mobile)}
								${g.relationship ? '&nbsp;·&nbsp;' + frappe.utils.escape_html(g.relationship) : ''}
							</div>
						</div>
						<button id="rd-back-search" class="rd-btn-secondary" style="font-size:11px;">
							← Change
						</button>
					</div>
				</div>

				<!-- Children -->
				<div class="rd-label" style="margin-bottom:8px;">
					Select Child
					${children.length === 0 ? '' :
						`<span class="rd-badge rd-badge-gray" style="margin-left:6px;">
							${children.length}
						</span>`}
				</div>

				${children_html}

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
		const child_name = this.$body.find('#rd-reg-child-name').val().trim();
		const dob        = this.$body.find('#rd-reg-dob').val();
		const sex        = this.$body.find('#rd-reg-sex').val();

		if (!child_name) {
			frappe.show_alert({ message: 'Child name is required.', indicator: 'orange' });
			return;
		}

		const $btn = this.$body.find('#rd-reg-submit').prop('disabled', true)
			.html('<span class="rd-spinner"></span>');

		if (is_new) {
			const guardian_name  = this.$body.find('#rd-reg-guardian-name').val().trim();
			const mobile         = this.$body.find('#rd-reg-mobile').val().trim();
			const relationship   = this.$body.find('#rd-reg-relationship').val();

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
					this.state.children = [{ patient, patient_name, dob, age_display: '' }];
					this.state.step = 'guardian_found';
					this.render_admission();
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
		this.$body.html(`
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
				if (this.state.channel === 'walkin') {
					if (this.state.walkin_preview_sessions.length) {
						this.state.sessions = [...this.state.walkin_preview_sessions];
						const picked = this.state.sessions[this.state.session_idx] || this.state.sessions[0];
						if (picked) this.token_board.load(picked.queue_session, this.state.override_token || null);
						this.state.step = 'session_offered';
					} else {
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
				<!-- Back link -->
				<button id="rd-back-guardian" class="rd-btn-secondary"
					style="font-size:11px;margin-bottom:12px;">
					← ${frappe.utils.escape_html(g.guardian_name)}
				</button>

				<!-- Summary card -->
				<div class="rd-card" style="margin-bottom:14px;">
					<div style="font-size:14px;font-weight:700;margin-bottom:2px;">
						${frappe.utils.escape_html(c.patient_name || c.patient)}
					</div>
					<div class="rd-caption" style="margin-bottom:8px;">
						${c.age_display ? frappe.utils.escape_html(c.age_display) : ''}
						${c.dob ? '&nbsp;·&nbsp;DOB ' + frappe.utils.escape_html(c.dob) : ''}
					</div>
					<span class="rd-badge ${badge_class}">${visit_label}</span>
					${is_review && vt.fee_validity_till ? `
					<span class="rd-caption" style="margin-left:6px;">
						✓ Free follow-up valid till ${frappe.utils.escape_html(vt.fee_validity_till)}
					</span>` : ''}
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

				<div class="rd-caption" style="margin-bottom:12px;">
					Mode: <strong>${frappe.utils.escape_html(is_walkin ? 'Walk-in Intake' : 'Phone Booking')}</strong>
					&nbsp;·&nbsp;Load class: <strong>${frappe.utils.escape_html(vt.load_class)}</strong>
				</div>

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

				<button id="rd-find-slot-btn" class="rd-btn-primary">
					${is_walkin ? 'Open Today’s Token Intake →' : 'Find Next Suitable Slot →'}
				</button>
			</div>
		`);

		this.$body.find('#rd-back-guardian').on('click', () => {
			this.state.step = 'guardian_found';
			this.render_admission();
		});

		this.$body.find('#rd-find-slot-btn').on('click', () => this._do_find_slot());
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
							← Back
						</button>
					`);
					this.$body.find('#rd-back-child').on('click', () => {
						this.state.step = 'child_selected';
						this.render_admission();
					});
					return;
				}

				this.state.sessions    = r.message;
				this.state.session_idx = 0;
				this.state.override_token = null;
				this.state.step = 'session_offered';
				// Pre-highlight suggested special token on the board
				const first = r.message[0];
				const special_hint = (this.state.is_special && first.suggested_special_token)
					? first.suggested_special_token : null;
				this.token_board.load(first.queue_session, special_hint);
				this.render_admission();
			},
		});
	}

	_group_sessions_by_date() {
		const groups = new Map();
		const ranked = [...(this.state.sessions || [])].sort((a, b) => {
			const aScore = Number(a.load_ratio || 0) + (a.available_slots > 0 ? 0 : 10);
			const bScore = Number(b.load_ratio || 0) + (b.available_slots > 0 ? 0 : 10);
			if (aScore !== bScore) return aScore - bScore;
			return Number(b.available_slots || 0) - Number(a.available_slots || 0);
		});
		ranked.forEach((session) => {
			const idx = this.state.sessions.findIndex((row) => row.queue_session === session.queue_session);
			const key = session.session_date;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push({ ...session, _idx: idx, _rank: ranked.findIndex((r) => r.queue_session === session.queue_session) });
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
		if (dateStr === today) return 'Today';
		if (dateStr === tomorrow) return 'Tomorrow';
		return frappe.datetime.str_to_user(dateStr, false, true);
	}

	_render_walkin_session_offered() {
		const sessions = this.state.sessions || [];
		const idx = this.state.session_idx;
		const session = sessions[idx];
		const isReview = this.state.visit_type && this.state.visit_type.load_class === 'review_load';
		const provisional = this.state.provisional_load_class;
		const hasMismatch = provisional && this.state.visit_type && provisional !== this.state.visit_type.load_class;
		const bookingHint = this.state.override_token
			? `Token ${frappe.utils.escape_html(String(this.state.override_token))} selected`
			: 'Best token will be auto-assigned';

		this.$body.html(`
			<div>
				<div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;">
					<button id="rd-back-child2" class="rd-btn-secondary" style="font-size:11px;">← Child</button>
					<span class="rd-label">Walk-in Intake</span>
				</div>

				<div class="rd-card" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;margin-bottom:12px;">
					<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
						<span class="rd-badge ${isReview ? 'rd-badge-green' : 'rd-badge-blue'}">
							${isReview ? 'Review' : 'New'}
						</span>
						${this.state.is_special ? '<span class="rd-badge" style="background:#fff7ed;color:#c2410c;border:1px solid #fdba74;">Special</span>' : ''}
						<span class="rd-caption" style="font-weight:600;">
							${frappe.utils.escape_html(this.state.child?.patient_name || this.state.child?.patient || '')}
						</span>
					</div>
					<div class="rd-caption" style="font-weight:600;">
						Today-only intake. Pick the session, use the token board, then confirm.
					</div>
				</div>

				${hasMismatch ? `
				<div class="rd-card" style="margin-bottom:12px;padding:10px 12px;border-color:#f59e0b;background:#fffbeb;">
					<div style="font-size:12px;font-weight:700;color:#b45309;margin-bottom:4px;">
						Actual type differs from the intake guess
					</div>
					<div class="rd-caption" style="color:#92400e;">
						The intake guess was <strong>${frappe.utils.escape_html(this._load_label(provisional))}</strong>,
						but the patient is actually <strong>${frappe.utils.escape_html(this._load_label(this.state.visit_type.load_class))}</strong>.
						Session guidance followed the intake guess; confirmation will still use the actual result.
					</div>
				</div>` : ''}

				<div class="rd-label" style="margin-bottom:8px;">Today's Sessions</div>
				<div class="rd-walkin-session-strip">
					${sessions.map((row, rowIdx) => `
						<button class="rd-walkin-session-btn ${rowIdx === idx ? 'active' : ''}" data-idx="${rowIdx}">
							<div>
								<div style="font-size:13px;font-weight:700;">
									${frappe.utils.escape_html(row.practitioner_name || row.session_name)}
								</div>
								<div class="rd-caption">
									${frappe.utils.escape_html(row.start_time)} – ${frappe.utils.escape_html(row.end_time)}
									${row.dept_abbr ? '&nbsp;·&nbsp;' + frappe.utils.escape_html(row.dept_abbr) : ''}
								</div>
							</div>
							<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
								<span class="rd-scan-chip ${(row.stress_label || '').includes('High') ? 'stress-high' : ((row.stress_label || '').includes('Medium') ? 'stress-mid' : 'stress-low')}">
									${frappe.utils.escape_html(row.stress_label || 'Open')}
								</span>
								<span class="rd-scan-chip hour-chip">${frappe.utils.escape_html(row.likely_hour_band || '—')}</span>
								<div style="font-size:18px;font-weight:900;color:var(--primary);min-width:26px;text-align:right;">
									${frappe.utils.escape_html(String(row.available_slots || 0))}
								</div>
							</div>
						</button>
					`).join('')}
				</div>

				<div class="rd-walkin-confirm">
					<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
						<div>
							<div style="font-size:13px;font-weight:700;">
								${frappe.utils.escape_html(session?.practitioner_name || session?.session_name || 'Session')}
							</div>
							<div class="rd-caption">
								${session ? `${frappe.utils.escape_html(session.start_time)} – ${frappe.utils.escape_html(session.end_time)}` : ''}
								${session?.dept_abbr ? '&nbsp;·&nbsp;' + frappe.utils.escape_html(session.dept_abbr) : ''}
							</div>
						</div>
						<div style="display:flex;gap:6px;flex-wrap:wrap;">
							<span class="rd-scan-chip fit-chip">${frappe.utils.escape_html(session?.fit_label || 'Balanced')}</span>
							<span class="rd-scan-chip hour-chip">${frappe.utils.escape_html(session?.likely_hour_band || '—')}</span>
						</div>
					</div>

					<div style="padding:7px 9px;border-radius:8px;background:var(--bg-color);margin-bottom:8px;">
						<div class="rd-label">Token</div>
						<div style="font-size:12px;font-weight:700;margin-top:2px;">${bookingHint}</div>
						<div class="rd-caption" style="margin-top:3px;">
							Use the central token board to override when needed.
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
							data-idx="${idx}"
							style="width:auto;min-width:150px;">
							Confirm Booking
						</button>
					</div>
				</div>
			</div>
		`);

		this.$body.find('#rd-back-child2').on('click', () => {
			this.state.step = 'child_selected';
			this.render_admission();
		});
		this.$body.find('.rd-walkin-session-btn').on('click', (e) => {
			const nextIdx = Number($(e.currentTarget).data('idx'));
			if (Number.isNaN(nextIdx) || nextIdx === this.state.session_idx) return;
			this._select_session(nextIdx);
			this.render_admission();
		});
		this.$body.find('.rd-confirm-booking-inline').on('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const bookingIdx = Number($(e.currentTarget).data('idx'));
			const picked = this.state.sessions[bookingIdx];
			if (!picked) return;
			this._do_confirm_booking(picked);
		});
		this._bind_booking_inputs();
	}

	_render_session_card(session, idx, is_selected) {
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
			<div class="rd-session-row rd-session-pick-card ${is_selected ? 'is-active' : ''} ${session._rank === 0 ? 'is-recommended' : ''}"
				data-idx="${idx}"
				style="cursor:pointer;">
				<div class="rd-session-row-main">
					<div>
						${session._rank === 0 ? '<div class="rd-best-badge">Best Option</div>' : ''}
						<div style="font-size:13px;font-weight:700;">
							${frappe.utils.escape_html(session.practitioner_name || session.session_name)}
						</div>
						<div class="rd-caption">
							${frappe.utils.escape_html(session.start_time)} – ${frappe.utils.escape_html(session.end_time)}
							${session.dept_abbr ? '&nbsp;·&nbsp;' + frappe.utils.escape_html(session.dept_abbr) : ''}
						</div>
					</div>
					<div>
						<div class="rd-label">Slots</div>
						<div style="font-size:20px;font-weight:900;line-height:1;color:var(--primary);">
							${frappe.utils.escape_html(String(session.available_slots || 0))}
						</div>
					</div>
					<div style="display:flex;gap:6px;flex-wrap:wrap;">
						<span class="rd-scan-chip ${stressClass}">
							${frappe.utils.escape_html(session.stress_label || 'Open')}
						</span>
						<span class="rd-scan-chip fit-chip">
							${frappe.utils.escape_html(session.fit_label || 'Balanced')}
						</span>
						<span class="rd-scan-chip hour-chip">
							${frappe.utils.escape_html(session.likely_hour_band || '—')}
						</span>
					</div>
					<div class="rd-session-row-actions">
						<button class="rd-btn-primary rd-book-best-btn"
							data-idx="${idx}"
							style="width:auto;padding:6px 10px;font-size:11px;">
							Best Token
						</button>
						<button class="rd-btn-secondary rd-select-session-btn"
							data-idx="${idx}"
							style="width:auto;padding:6px 10px;font-size:11px;">
							${hasOverride ? 'Token Selected' : 'Choose'}
						</button>
					</div>
				</div>
				${is_selected ? `
					<div class="rd-session-inline-form">
						${(this.state.is_special && session.suggested_special_token) ? `
						<div style="padding:6px 10px;margin-bottom:8px;border-radius:6px;
							background:#fef9c3;border:1px solid #d97706;
							font-size:12px;font-weight:600;color:#a16207;">
							Suggested Special token:
							<strong>${frappe.utils.escape_html(String(session.suggested_special_token))}</strong>
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
								data-idx="${idx}"
								style="width:auto;min-width:150px;">
								Confirm Booking
							</button>
						</div>
					</div>
				` : ''}
			</div>`;
	}

	_select_session(nextIdx) {
		if (Number.isNaN(nextIdx) || nextIdx < 0 || nextIdx >= this.state.sessions.length) return;
		this.state.session_idx = nextIdx;
		this.state.override_token = null;
		const picked = this.state.sessions[nextIdx];
		const special_hint = (this.state.is_special && picked.suggested_special_token)
			? picked.suggested_special_token : null;
		this.token_board.load(picked.queue_session, special_hint);
	}

	// ── Step: Session Offered ─────────────────────────────────────────────────
	_render_session_offered() {
		const sessions    = this.state.sessions;
		const idx         = this.state.session_idx;
		const groups      = this._group_sessions_by_date();
		const isReview = this.state.visit_type && this.state.visit_type.load_class === 'review_load';
		const isWalkin = this.state.channel === 'walkin';
		if (isWalkin) return this._render_walkin_session_offered();

		this.$body.html(`
			<div>
				<div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;">
					<button id="rd-back-child2" class="rd-btn-secondary" style="font-size:11px;">← Child</button>
					<span class="rd-label">${isWalkin ? 'Walk-in Intake' : 'Availability Board'}</span>
				</div>

				<div class="rd-card" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;margin-bottom:12px;">
					<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
						<span class="rd-badge ${isReview ? 'rd-badge-green' : 'rd-badge-blue'}">
							${isReview ? 'Review' : 'New'}
						</span>
						<span class="rd-badge rd-badge-gray">
							${frappe.utils.escape_html(this.state.channel === 'phone' ? 'Phone' : 'Walk-in')}
						</span>
						${this.state.is_special ? '<span class="rd-badge" style="background:#fff7ed;color:#c2410c;border:1px solid #fdba74;">Special</span>' : ''}
						<span class="rd-caption" style="font-weight:600;">
							${frappe.utils.escape_html(this.state.child?.patient_name || this.state.child?.patient || '')}
						</span>
					</div>
					<div class="rd-caption" style="font-weight:600;">
						${isWalkin
							? 'Today-only intake. Pick the session/token quickly, then confirm.'
							: 'Choose a session or book the best token directly'}
					</div>
				</div>

				<div class="rd-availability-groups">
					${groups.map(group => `
						<div>
							<div style="font-size:12px;font-weight:800;letter-spacing:.02em;margin-bottom:4px;color:#0f172a;">
								${frappe.utils.escape_html(group.label)}
							</div>
							<div class="rd-availability-group-grid">
								${group.sessions.map(session => this._render_session_card(session, session._idx, session._idx === idx)).join('')}
							</div>
						</div>
					`).join('')}
				</div>
			</div>
		`);

		this.$body.find('#rd-back-child2').on('click', () => {
			this.state.step = 'child_selected';
			this.render_admission();
		});
		this.$body.find('.rd-session-pick-card, .rd-select-session-btn').on('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const isChoose = $(e.currentTarget).hasClass('rd-select-session-btn');
			const nextIdx = Number($(e.currentTarget).data('idx'));
			if (Number.isNaN(nextIdx)) return;
			if (nextIdx !== this.state.session_idx) this._select_session(nextIdx);
			if (!isChoose && nextIdx === this.state.session_idx) return;
			this.state.token_board_open = true;
			this.render_admission();
		});
		this.$body.find('.rd-book-best-btn').on('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const nextIdx = Number($(e.currentTarget).data('idx'));
			if (Number.isNaN(nextIdx)) return;
			this._select_session(nextIdx);
			this.state.token_board_open = this.state.channel === 'walkin';
			this.render_admission();
		});
		this.$body.find('.rd-confirm-booking-inline').on('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const bookingIdx = Number($(e.currentTarget).data('idx'));
			const picked = this.state.sessions[bookingIdx];
			if (!picked) return;
			this._do_confirm_booking(picked);
		});
		this._bind_booking_inputs();
	}

	_bind_booking_inputs() {
		// Complaint autocomplete
		let _complaint_timer;
		this.$body.find('#rd-complaint-input').on('input', (e) => {
			const q = e.target.value;
			this.state.complaint = q || null;
			clearTimeout(_complaint_timer);
			if (!q || q.length < 1) {
				this.$body.find('#rd-complaint-dd').hide().empty();
				return;
			}
			_complaint_timer = setTimeout(() => {
				frappe.call({
					method: 'frappe.client.get_list',
					args: { doctype: 'Complaint', filters: [['name', 'like', `%${q}%`]],
						fields: ['name'], limit: 10 },
					callback: (r) => {
						const $dd = this.$body.find('#rd-complaint-dd');
						if (!r.message || !r.message.length) { $dd.hide().empty(); return; }
						$dd.empty().show();
						r.message.forEach(c => {
							$(`<div style="padding:8px 12px;cursor:pointer;font-size:13px;
								border-bottom:1px solid var(--border-color);">
								${frappe.utils.escape_html(c.name)}
							</div>`).on('click', () => {
								this.state.complaint = c.name;
								this.$body.find('#rd-complaint-input').val(c.name);
								$dd.hide().empty();
							}).appendTo($dd);
						});
					},
				});
			}, 280);
		}).on('blur', () => {
			// Delay hide so click on dropdown item fires first
			setTimeout(() => this.$body.find('#rd-complaint-dd').hide(), 180);
		});

		// Weight + Age — persist to state immediately
		this.$body.find('#rd-weight-input').on('input', (e) => {
			this.state.weight_at_booking = e.target.value || null;
		});
		this.$body.find('#rd-age-input').on('input', (e) => {
			this.state.age_at_visit = e.target.value || null;
		});
	}

	// ── Confirm booking ──────────────────────────────────────────────────────
	_do_confirm_booking(session) {
		const $btn = this.$body.find('.rd-confirm-booking-inline').filter((_, el) =>
			Number($(el).data('idx')) === this.state.session_idx
		).first();
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
						${frappe.utils.escape_html(String(b.token_number))}
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
		const c = this.state.child;
		const g = this.state.guardian;
		const s = this.state.sessions[this.state.session_idx];

		const report_time = _eta_fmt(b.report_by_time);
		const pred_time   = _eta_fmt(b.predicted_doctor_time);
		const age_str     = this.state.age_at_visit || '';
		const weight_str  = this.state.weight_at_booking ? `${this.state.weight_at_booking} kg` : '';
		const complaint   = this.state.complaint || '';

		const win = window.open('', '_blank',
			'width=420,height=580,toolbar=0,menubar=0,scrollbars=0');
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
			</style></head><body>
			<div class="t">${frappe.utils.escape_html(String(b.token_number))}</div>
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
		</body></html>`);
		win.document.close();
		win.print();
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
			provisional_load_class: this.state.channel === 'walkin' ? this.state.provisional_load_class : null,
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
	load(queue_session, highlight_token = null) {
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
			args: { queue_session },
			callback: (r) => {
				if (!r.message) return;
				this.board_data = r.message;
				this._update_session_label(r.message.session);
				this._render_board();
			},
		});
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
		for (let n = 1; n <= max_token; n++) {
			const entry = entries_map[n] || null;
			const state = this._cell_state(n, entry, vip_set);
			const style = TokenBoard.CELL_STYLES[state] || TokenBoard.CELL_STYLES.available;
			const is_rec = (n === this.recommended_token);
			const is_clickable = (state === 'available' || entry !== null);

			const classes = [
				'rd-token-cell',
				is_clickable ? 'clickable' : '',
				is_rec ? 'recommended' : '',
			].filter(Boolean).join(' ');

			const opacity = (state === 'pushed_to_end') ? 'opacity:.4;' : '';

			cells.push(`
				<div class="${classes}"
					data-token="${n}"
					data-state="${state}"
					data-entry="${entry ? frappe.utils.escape_html(entry.name) : ''}"
					style="background:${style.bg};border-color:${style.border};
						color:${style.color};${opacity}">
					<span>${n}</span>
					${style.sub ? `<span class="rd-cell-sub">${style.sub}</span>` : ''}
				</div>
			`);
		}

		this.$grid.html(`
			<div style="display:flex;flex-wrap:wrap;gap:5px;align-content:flex-start;">
				${cells.join('')}
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
		const isWalkinSearch = db.state.channel === 'walkin' && db.state.step === 'search';
		if (!isWalkinSearch) {
			this.$context.hide().empty();
			return;
		}

		const session = db.state.walkin_preview_sessions[db.state.session_idx] || null;
		const tokenText = db.state.override_token
			? `Token ${frappe.utils.escape_html(String(db.state.override_token))} selected`
			: 'Select a token to continue';

		this.$context.show().html(`
			<div style="display:flex;align-items:end;gap:10px;flex-wrap:wrap;">
				<div style="min-width:170px;">
					<div class="rd-label" style="margin-bottom:4px;">Selected Token</div>
					<div style="font-size:14px;font-weight:800;">${tokenText}</div>
					<div class="rd-caption" style="margin-top:4px;">
						${session ? `${frappe.utils.escape_html(session.practitioner_name || session.session_name)} · ${frappe.utils.escape_html(session.start_time)}-${frappe.utils.escape_html(session.end_time)}` : 'Choose the active token first'}
					</div>
				</div>
				<div style="flex:1;min-width:220px;">
					<div class="rd-label" style="margin-bottom:4px;">Parent / Guardian Mobile</div>
					<input id="rd-board-mobile-input" class="rd-input"
						type="tel" placeholder="e.g. 9876543210"
						value="${frappe.utils.escape_html(db.state.mobile || '')}"
						autocomplete="off">
				</div>
				<button id="rd-board-search-btn" class="rd-btn-primary"
					style="width:auto;padding:9px 18px;"
					${db.state.override_token ? '' : 'disabled'}>
					Search
				</button>
			</div>
			<div class="rd-caption" style="margin-top:6px;">
				Walk-in flow: select token, then search. You can still change the token before continuing.
			</div>
		`);

		const $input = this.$context.find('#rd-board-mobile-input');
		const do_search = () => {
			const mobile = $input.val().trim();
			if (!db.state.override_token) {
				frappe.show_alert({ message: 'Select a token first.', indicator: 'orange' });
				return;
			}
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
			this.$context.hide().empty();
			return;
		}
		switch (db.state.step) {
		case 'search':
			return this._render_context_dock();
		case 'guardian_found':
			return this._render_walkin_guardian_found();
		case 'guardian_not_found':
			return this._render_walkin_guardian_not_found();
		case 'register':
			return this._render_walkin_register();
		case 'child_selected':
		case 'session_offered':
			return this._render_walkin_confirm();
		case 'confirmed':
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
			<div>
				<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
					<div>
						<div class="rd-label">Guardian Found</div>
						<div style="font-size:14px;font-weight:700;">${frappe.utils.escape_html(g.guardian_name)}</div>
						<div class="rd-caption">${frappe.utils.escape_html(g.mobile)}</div>
					</div>
					<button id="rd-board-change-mobile" class="rd-btn-secondary" style="font-size:11px;">Change</button>
				</div>
				<div class="rd-label" style="margin-bottom:8px;">Select Child</div>
				<div style="display:flex;flex-direction:column;gap:6px;">
					${children.map(c => `
						<button class="rd-child-row" data-patient="${frappe.utils.escape_html(c.patient)}" style="width:100%;text-align:left;background:var(--card-bg);">
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
			db.state.step = 'register';
			db.state._register_mode = 'add_child';
			db.render_admission();
		});
	}

	_render_walkin_guardian_not_found() {
		const db = this.dashboard;
		this.$context.show().html(`
			<div>
				<div class="rd-card" style="border-color:#f87171;margin-bottom:12px;">
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
			db.state.step = 'register';
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
			<div>
				<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
					<button id="rd-board-reg-back" class="rd-btn-secondary" style="font-size:11px;">←</button>
					<span style="font-size:13px;font-weight:700;">
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
			db.state.step = is_new ? 'guardian_not_found' : 'guardian_found';
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
			<div>
				<div class="rd-card" style="margin-bottom:12px;">
					<div style="font-size:14px;font-weight:700;margin-bottom:2px;">
						${frappe.utils.escape_html(c.patient_name || c.patient)}
					</div>
					<div class="rd-caption" style="margin-bottom:8px;">
						${db.state.age_at_visit ? frappe.utils.escape_html(db.state.age_at_visit) : ''}
						${c.dob ? '&nbsp;·&nbsp;DOB ' + frappe.utils.escape_html(c.dob) : ''}
					</div>
					<span class="rd-badge ${is_review ? 'rd-badge-green' : 'rd-badge-blue'}">
						${is_review ? 'Review Patient' : 'New Patient'}
					</span>
					<div class="rd-caption" style="margin-top:8px;">
						Token <strong>${frappe.utils.escape_html(String(db.state.override_token || '—'))}</strong>
						· ${frappe.utils.escape_html(s.practitioner_name || s.session_name)}
					</div>
				</div>
				<div style="margin-bottom:8px;position:relative;">
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
				<div style="display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr) auto;gap:8px;align-items:end;">
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
					<button id="rd-board-confirm-booking" class="rd-btn-primary"
						style="width:auto;min-width:150px;">
						Confirm Booking
					</button>
				</div>
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
			<div>
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
			&& ['search', 'guardian_found', 'guardian_not_found', 'register', 'child_selected', 'session_offered']
				.includes(admission_step);
		const allowSelection = admission_step === 'session_offered' || walkinTokenPick;

		// Available cell during session_offered → override token selection
		if (state === 'available' && allowSelection) {
			db.state.override_token = token_number;
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
		this.$session_sel     = $container.find('#rd-live-session-sel');
		this.$counts          = $container.find('#rd-live-counts');
		this.$panel           = $container.find('#rd-live-panel');
		this.$refresh_btn     = $container.find('#rd-live-refresh');
		this.current_session       = null;
		this._expanding            = null; // queue_entry being expanded for reception form
		this._fee_data             = {};   // cache: entry name → {covered, charge, validity_till}
		this._session_practitioner = null;

		this._load_session_list();
		this._bind_events();
		this._subscribe_realtime();
		this._auto_detect_active();
	}

	// ── Setup ─────────────────────────────────────────────────────────────────
	_load_session_list() {
		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'Queue Session',
				filters: [
					['session_date', '=', frappe.datetime.get_today()],
					['status', 'in', ['Scheduled', 'Active', 'Paused']],
				],
				fields: ['name', 'session_name', 'dept_abbr'],
				order_by: 'start_time asc',
				limit: 10,
			},
			callback: (r) => {
				if (!r.message) return;
				const opts = r.message.map(s =>
					`<option value="${frappe.utils.escape_html(s.name)}">
						${frappe.utils.escape_html(s.session_name || s.name)}
						${s.dept_abbr ? '(' + frappe.utils.escape_html(s.dept_abbr) + ')' : ''}
					</option>`
				).join('');
				this.$session_sel.html('<option value="">Select session…</option>' + opts);
				if (!this.current_session && r.message.length === 1) {
					this.$session_sel.val(r.message[0].name);
					this.load(r.message[0].name);
				}
			},
		});
	}

	_auto_detect_active() {
		frappe.call({
			method: 'clinic_flow.api.queue.get_queue_state_for_display',
			args: { dept: 'all' },
			callback: (r) => {
				if (!r.message || !r.message.sessions || !r.message.sessions.length) return;
				const active = r.message.sessions.find(s => s.session_status === 'Active');
				if (active && !this.current_session) {
					this.$session_sel.val(active.session);
					this.load(active.session);
				}
			},
		});
	}

	_bind_events() {
		this.$session_sel.on('change', () => {
			const qs = this.$session_sel.val();
			if (qs) this.load(qs);
			else { this.$panel.html(''); this.$counts.html(''); this.current_session = null; }
		});
		this.$refresh_btn.on('click', () => {
			if (this.current_session) this.load(this.current_session);
		});
	}

	_subscribe_realtime() {
		frappe.realtime.on('queue_update', (data) => {
			if (data && data.queue_session === this.current_session) {
				this.load(this.current_session);
			}
		});
		frappe.realtime.on('session_status', (data) => {
			if (!data) return;
			this._load_session_list();
			if (data.status === 'Active' && !this.current_session && data.queue_session) {
				this.$session_sel.val(data.queue_session);
				this.load(data.queue_session);
			}
		});
	}

	// ── Load and render ───────────────────────────────────────────────────────
	load(queue_session) {
		this.current_session = queue_session;
		frappe.call({
			method: 'clinic_flow.api.queue.get_live_session_state',
			args: { queue_session },
			callback: (r) => {
				if (!r.message) return;
				this._render(r.message);
			},
		});
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
			<span class="rd-caption">
				<strong>${counts.completed_today}</strong> done
			</span>
			<span class="rd-caption">
				<strong>${counts.remaining}</strong> remaining
			</span>
			<span class="rd-caption">
				<strong>${counts.total_booked}</strong> total
			</span>
		`);
	}

	_render_pipeline(data) {
		const sections = [];

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

		// DUE SOON
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
			<div class="rd-pipeline-header" style="color:#1d4ed8;">
				▶ With Doctor
			</div>
			<div class="rd-patient-card with-doctor">
				<div style="display:flex;align-items:center;gap:8px;">
					<span style="font-size:18px;font-weight:900;color:#1d4ed8;">
						${frappe.utils.escape_html(String(e.token_number))}
					</span>
					<div style="flex:1;">
						<div style="font-size:13px;font-weight:700;">
							${frappe.utils.escape_html(e.patient_name || e.patient)}
						</div>
						<div class="rd-caption">
							${e.load_class === 'review_load'
								? '<span class="rd-badge rd-badge-green" style="font-size:9px;">Review</span>'
								: '<span class="rd-badge rd-badge-blue" style="font-size:9px;">New</span>'}
							${since ? '&nbsp;· Since ' + frappe.utils.escape_html(since) : ''}
						</div>
					</div>
					<div class="rd-caption" style="font-weight:600;color:#1d4ed8;">
						Doctor workspace controls completion
					</div>
				</div>
			</div>
		</div>`;
	}

	_section_ready(entries) {
		const cards = entries.map(e => {
			const is_review = e.load_class === 'review_load';
			return `
			<div class="rd-patient-card ready" style="display:flex;align-items:center;gap:8px;">
				<span style="font-size:14px;font-weight:800;color:#7c3aed;min-width:28px;">
					${frappe.utils.escape_html(String(e.token_number))}
				</span>
				<div style="flex:1;">
					<div style="font-size:12px;font-weight:600;">
						${frappe.utils.escape_html(e.patient_name || e.patient)}
						${is_review
							? '<span class="rd-badge rd-badge-green" style="font-size:9px;margin-left:4px;">Review</span>'
							: '<span class="rd-badge rd-badge-blue" style="font-size:9px;margin-left:4px;">New</span>'}
					</div>
						${e.reception_done_at
							? `<div class="rd-caption">Ready since ${frappe.utils.escape_html(frappe.datetime.str_to_user(e.reception_done_at, true))}</div>`
							: ''}
						${e.weight_recorded ? `<div class="rd-caption">${e.weight_recorded} kg</div>` : ''}
					</div>
					<div class="rd-caption" style="font-weight:600;color:#7c3aed;">
						Waiting for doctor call
					</div>
				</div>`;
			}).join('');

		return `
		<div class="rd-pipeline-section">
			<div class="rd-pipeline-header" style="color:#7c3aed;">
				Ready Near Doctor (${entries.length})
			</div>
			${cards}
		</div>`;
	}

	_section_called(entries) {
		const cards = entries.map(e => {
			const call_time = e.called_to_reception_at
				? frappe.datetime.str_to_user(e.called_to_reception_at, true) : '';
			const is_expanding = (this._expanding === e.name);

			return `
			<div class="rd-patient-card called"
				data-entry="${frappe.utils.escape_html(e.name)}"
				data-patient="${frappe.utils.escape_html(e.patient || '')}">
				<div style="display:flex;align-items:center;gap:8px;margin-bottom:${is_expanding ? '8px' : '0'};">
					<span style="font-size:14px;font-weight:800;color:#1d4ed8;min-width:28px;">
						${frappe.utils.escape_html(String(e.token_number))}
					</span>
					<div style="flex:1;">
						<div style="font-size:12px;font-weight:600;">
							${frappe.utils.escape_html(e.patient_name || e.patient)}
						</div>
						${call_time ? `<div class="rd-caption">Called ${frappe.utils.escape_html(call_time)}</div>` : ''}
					</div>
					<div style="display:flex;gap:4px;">
						<button class="rd-action-btn rd-action-btn-green rd-complete-reception-btn"
							data-entry="${frappe.utils.escape_html(e.name)}">
							✓ Reception
						</button>
						<button class="rd-action-btn rd-action-btn-orange rd-no-response-btn"
							data-entry="${frappe.utils.escape_html(e.name)}">
							N/R
						</button>
					</div>
				</div>

				${is_expanding ? (() => {
					const fd = this._fee_data[e.name];
					let fee_html = '';
					if (!fd) {
						fee_html = `<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;">
							Checking fee validity…</div>`;
					} else if (fd.covered) {
						fee_html = `<div style="font-size:11px;font-weight:600;color:#16a34a;
							background:#f0fdf4;border:1px solid #bbf7d0;border-radius:5px;
							padding:4px 8px;margin-bottom:6px;">
							✓ Fee Validity — Covered
							${fd.validity_till ? `<span style="font-weight:400;color:var(--text-muted);">
								(valid till ${frappe.datetime.str_to_user(fd.validity_till)})</span>` : ''}
						</div>`;
					} else {
						const amt = fd.charge ? `₹${fd.charge}` : '—';
						fee_html = `<div style="font-size:11px;font-weight:600;color:#b45309;
							background:#fffbeb;border:1px solid #fde68a;border-radius:5px;
							padding:4px 8px;margin-bottom:6px;">
							Payment Due: ${amt}
						</div>`;
					}
					return `
				<div class="rd-recep-form">
					<div style="font-size:11px;font-weight:700;margin-bottom:6px;color:var(--text-muted);">
						COMPLETE RECEPTION
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
					<div style="display:flex;gap:6px;">
							<button class="rd-action-btn rd-action-btn-green rd-confirm-reception-btn"
								style="flex:1;"
								data-entry="${frappe.utils.escape_html(e.name)}">
								Complete Reception
							</button>
						<button class="rd-action-btn rd-action-btn-red rd-cancel-recep-btn"
							data-entry="${frappe.utils.escape_html(e.name)}">
							✕
						</button>
					</div>
				</div>`;
				})() : ''}
			</div>`;
		}).join('');

		return `
		<div class="rd-pipeline-section">
			<div class="rd-pipeline-header" style="color:#1d4ed8;">
				At Reception — Called (${entries.length})
			</div>
			${cards}
		</div>`;
	}

	_section_due_soon(entries) {
		const tokens = entries.map(e =>
			`<span style="display:inline-block;padding:3px 8px;border-radius:5px;
				background:var(--bg-color);border:1px solid var(--border-color);
				font-size:12px;font-weight:700;cursor:pointer;"
				class="rd-call-to-reception-inline"
				data-entry="${frappe.utils.escape_html(e.name)}"
				title="${frappe.utils.escape_html(e.patient_name || e.patient)}">
				${frappe.utils.escape_html(String(e.token_number))}
			</span>`
		).join('');

		return `
		<div class="rd-pipeline-section">
			<div class="rd-pipeline-header">Due Soon</div>
			<div style="display:flex;gap:5px;flex-wrap:wrap;">${tokens}</div>
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
						${frappe.utils.escape_html(String(e.token_number))}
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
			<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;
				border-radius:5px;background:var(--bg-color);margin-bottom:4px;">
				<span style="font-size:12px;font-weight:700;color:var(--text-muted);min-width:24px;">
					${frappe.utils.escape_html(String(e.token_number))}
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
			error: () => { $btn.prop('disabled', false).text('Confirm & Send to Doctor'); },
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
}
