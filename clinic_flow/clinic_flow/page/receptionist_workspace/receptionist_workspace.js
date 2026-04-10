frappe.pages['receptionist-workspace'].on_page_load = function(wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Receptionist Workspace',
		single_column: true,
	});
	$(wrapper).find('.page-content').html(get_workspace_html());
	new ReceptionistWorkspace(wrapper);
};

// ── HTML ──────────────────────────────────────────────────────────────────────
function get_workspace_html() {
	return `
<style>
#rw-root * { box-sizing: border-box; }
.rw-label {
	font-size:10px; font-weight:700; color:var(--text-muted);
	text-transform:uppercase; letter-spacing:1px;
}
.rw-type-btn {
	padding:6px 16px; border:none; background:transparent;
	font-size:12px; font-weight:500; cursor:pointer; color:var(--text-muted);
	border-bottom:2px solid transparent; transition:all .15s;
}
.rw-type-btn.active { color:var(--primary); border-bottom-color:var(--primary); }
.rw-avail-card {
	background:var(--card-bg); border:1px solid var(--border-color);
	border-radius:8px; padding:14px 16px; margin-bottom:10px;
	display:flex; align-items:center; gap:12px;
	transition:box-shadow .15s, border-color .15s;
}
.rw-avail-card:hover { box-shadow:0 2px 8px rgba(0,0,0,.08); border-color:#c7d7fd; }
.rw-book-btn {
	padding:7px 18px; border-radius:6px; border:none;
	font-size:12px; font-weight:600; cursor:pointer;
	transition:opacity .15s; white-space:nowrap;
}
.rw-book-btn:hover { opacity:.85; }
.rw-appt-row {
	display:flex; align-items:center; gap:10px; padding:11px 16px;
	border-bottom:1px solid var(--border-color); transition:background .1s;
}
.rw-appt-row:hover { background:var(--bg-color); }
.rw-checkin-btn {
	padding:5px 14px; border-radius:5px; border:1.5px solid #16a34a;
	color:#16a34a; background:transparent; font-size:11px; font-weight:600;
	cursor:pointer; transition:all .15s;
}
.rw-checkin-btn:hover { background:#16a34a; color:#fff; }
.rw-search-row {
	padding:10px 14px; cursor:pointer; display:flex;
	align-items:center; justify-content:space-between;
	border-bottom:1px solid var(--border-color); transition:background .1s;
}
.rw-search-row:last-child { border-bottom:none; }
.rw-search-row:hover { background:var(--bg-color); }
.rw-mgmt-card {
	border:1px solid var(--border-color); border-radius:7px;
	padding:11px 14px; margin-bottom:8px;
	display:flex; align-items:center; gap:10px; background:var(--card-bg);
}
.rw-step-indicator {
	display:flex; align-items:center; gap:0; margin-bottom:16px;
}
.rw-step {
	flex:1; text-align:center; padding:7px 4px; font-size:11px; font-weight:600;
	color:var(--text-muted); border-bottom:2px solid var(--border-color);
	transition:all .2s;
}
.rw-step.active { color:var(--primary); border-bottom-color:var(--primary); }
.rw-step.done { color:#16a34a; border-bottom-color:#16a34a; }
.rw-panel-input {
	width:100%; padding:9px 12px; border:1.5px solid var(--border-color);
	border-radius:6px; font-size:13px; outline:none; background:var(--input-bg);
	transition:border-color .15s;
}
.rw-panel-input:focus { border-color:var(--primary); }
.rw-inline-results {
	border:1px solid var(--border-color); border-radius:6px; margin-top:4px;
	background:var(--card-bg); box-shadow:0 4px 12px rgba(0,0,0,.1);
	max-height:200px; overflow-y:auto; display:none;
}
.rw-btn-primary {
	padding:9px 20px; border-radius:6px; border:none;
	background:var(--primary); color:#fff; font-size:13px; font-weight:600;
	cursor:pointer; transition:opacity .15s; width:100%; margin-top:4px;
}
.rw-btn-primary:hover { opacity:.88; }
.rw-btn-secondary {
	padding:8px 16px; border-radius:6px;
	border:1px solid var(--border-color); background:var(--card-bg);
	font-size:12px; font-weight:500; cursor:pointer; transition:all .15s;
}
.rw-btn-secondary:hover { border-color:var(--primary); color:var(--primary); }
</style>

<div id="rw-root" style="display:flex;flex-direction:column;height:calc(100vh - 100px);overflow:hidden;">

	<!-- ── SEARCH ROW (prominent) ── -->
	<div style="padding:14px 24px 10px;background:var(--card-bg);
		border-bottom:1px solid var(--border-color);flex-shrink:0;">
		<div style="position:relative;max-width:680px;margin:0 auto;">
			<div style="position:absolute;left:14px;top:50%;transform:translateY(-50%);
				color:var(--text-muted);pointer-events:none;z-index:1;">
				<svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor">
					<path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.868-3.834zm-5.242 1.406a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/>
				</svg>
			</div>
			<input id="rw-search" type="text"
				placeholder="Search patient by name or mobile to view, reschedule or cancel appointments…"
				autocomplete="off"
				style="width:100%;padding:11px 16px 11px 42px;
					border:2px solid var(--border-color);border-radius:10px;
					font-size:14px;outline:none;background:var(--input-bg);
					transition:border-color .15s;box-shadow:0 1px 4px rgba(0,0,0,.06);">
			<div id="rw-search-dropdown"
				style="display:none;position:absolute;top:calc(100% + 6px);left:0;right:0;
					background:var(--card-bg);border:1px solid var(--border-color);
					border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.13);
					z-index:1000;max-height:340px;overflow-y:auto;"></div>
		</div>
	</div>

	<!-- ── STATUS BAR ── -->
	<div style="display:flex;align-items:center;gap:10px;padding:7px 24px;
		background:var(--card-bg);border-bottom:1px solid var(--border-color);flex-shrink:0;">
		<div id="rw-session-pills" style="display:flex;gap:6px;flex-wrap:wrap;flex:1;"></div>
		<button id="rw-emergency-btn"
			style="display:flex;align-items:center;gap:6px;padding:7px 16px;
				background:#dc2626;color:#fff;border:none;border-radius:7px;
				font-weight:700;font-size:12px;cursor:pointer;
				box-shadow:0 2px 6px rgba(220,38,38,.4);">
			<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
				<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0v-4A.5.5 0 0 1 8 4zm0 6.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z"/>
			</svg>
			Emergency
		</button>
	</div>

	<!-- ── MAIN ── -->
	<div style="display:grid;grid-template-columns:1fr 1fr;flex:1;overflow:hidden;min-height:0;">

		<!-- LEFT: Book Appointment -->
		<div style="display:flex;flex-direction:column;overflow:hidden;
			border-right:1px solid var(--border-color);">
			<div style="padding:12px 18px;border-bottom:1px solid var(--border-color);flex-shrink:0;">
				<div class="rw-label" style="margin-bottom:10px;">Book Appointment</div>
				<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
					<select id="rw-filter-practitioner"
						style="flex:1;min-width:160px;padding:7px 10px;
							border:1.5px solid var(--border-color);border-radius:6px;
							background:var(--input-bg);font-size:13px;">
						<option value="">Select Practitioner</option>
					</select>
					<div style="display:flex;border-bottom:2px solid var(--border-color);">
						<button class="rw-type-btn active" data-type="PRE_BOOKED">Standard</button>
						<button class="rw-type-btn" data-type="FOLLOW_UP">Follow-up</button>
						<button class="rw-type-btn" data-type="WALK_IN">Walk-in</button>
					</div>
				</div>
			</div>
			<div id="rw-quota-viz" style="padding:12px 18px;border-bottom:1px solid var(--border-color);flex-shrink:0;display:none;">
				<div class="rw-label" style="margin-bottom:10px;">Today's Quota</div>
				<div id="rw-quota-bars"></div>
			</div>
			<div id="rw-availability" style="flex:1;overflow-y:auto;padding:14px 18px;">
				<div style="color:var(--text-muted);font-size:12px;text-align:center;margin-top:48px;">
					Select a practitioner to see available sessions.
				</div>
			</div>
		</div>

		<!-- RIGHT: Smart context panel -->
		<div id="rw-panel" style="display:flex;flex-direction:column;overflow:hidden;">

			<!-- Panel header -->
			<div id="rw-panel-header"
				style="padding:12px 18px;border-bottom:1px solid var(--border-color);
					flex-shrink:0;display:flex;align-items:center;gap:10px;min-height:49px;">
				<button id="rw-panel-back"
					style="display:none;padding:4px 10px;border-radius:5px;
						border:1px solid var(--border-color);background:var(--card-bg);
						cursor:pointer;font-size:12px;color:var(--text-muted);">← Back</button>
				<div id="rw-panel-title" style="font-size:11px;font-weight:700;color:var(--text-muted);
					text-transform:uppercase;letter-spacing:1px;"></div>
				<div style="flex:1;"></div>
				<div id="rw-panel-actions"></div>
			</div>

			<!-- Panel body -->
			<div id="rw-panel-body" style="flex:1;overflow-y:auto;"></div>
		</div>
	</div>
</div>`;
}

// ── Controller ────────────────────────────────────────────────────────────────
class ReceptionistWorkspace {
	constructor(wrapper) {
		this.wrapper      = wrapper;
		this._queue_type  = 'PRE_BOOKED';
		this._practitioner = '';
		this._all_appointments = [];
		this._search_timer = null;

		// Booking state
		this._booking_slot    = null;  // selected availability slot
		this._booking_patient = null;  // selected patient
		this._booking_appt    = null;  // created appointment name
		this._booking_charge  = null;  // charge details from API
		this._booking_step    = 0;     // 0=patient, 1=payment, 2=done

		// Patient management state
		this._mgmt_patient = null;

		// Reschedule state
		this._rescheduling = null;     // { appointment_name, patient }

		this._init();
	}

	_init() {
		this._load_practitioners();
		this._load_session_pills();
		this._show_board();
		this._bind_events();
		setInterval(() => {
			if (this._panel_mode === 'board') this._load_todays_appointments();
		}, 30000);
	}

	// ── Practitioners ─────────────────────────────────────────────────────────

	_load_practitioners() {
		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'Healthcare Practitioner',
				fields: ['name', 'practitioner_name'],
				filters: [['status', '=', 'Active']],
				limit: 100,
			},
			callback: (r) => {
				const pracs = r.message || [];
				const sel = document.getElementById('rw-filter-practitioner');
				pracs.forEach(p => {
					const opt = document.createElement('option');
					opt.value = p.name;
					opt.textContent = p.practitioner_name || p.name;
					sel.appendChild(opt);
				});
			},
		});
	}

	// ── Session pills ─────────────────────────────────────────────────────────

	_load_session_pills() {
		frappe.call({
			method: 'clinic_flow.api.queue.get_queue_state_for_display',
			args: { dept: 'all' },
			callback: (r) => {
				const container = document.getElementById('rw-session-pills');
				container.innerHTML = '';
				const sessions = (r.message && r.message.sessions) || [];
				if (!sessions.length) {
					container.innerHTML = `<span style="font-size:11px;color:var(--text-muted);">No active sessions</span>`;
					return;
				}
				sessions.forEach(s => {
					const color = s.session_status === 'Active' ? '#16a34a' : '#d97706';
					const pill = document.createElement('div');
					pill.style.cssText = `display:flex;align-items:center;gap:5px;padding:3px 10px;
						border-radius:20px;border:1px solid ${color}33;background:${color}11;font-size:11px;`;
					pill.innerHTML = `
						<span style="width:6px;height:6px;border-radius:50%;background:${color};"></span>
						<span style="font-weight:600;color:${color};">${s.practitioner_name || s.practitioner}</span>
						<span style="color:var(--text-muted);">· ${s.session_status}</span>`;
					container.appendChild(pill);
				});
			},
		});
	}

	// ── Event bindings ────────────────────────────────────────────────────────

	_bind_events() {
		// Type tabs
		document.querySelectorAll('.rw-type-btn').forEach(btn => {
			btn.addEventListener('click', (e) => {
				document.querySelectorAll('.rw-type-btn').forEach(b => b.classList.remove('active'));
				e.target.classList.add('active');
				this._queue_type = e.target.dataset.type;
				if (this._practitioner) this._load_availability();
			});
		});

		// Practitioner picker
		document.getElementById('rw-filter-practitioner').addEventListener('change', (e) => {
			this._practitioner = e.target.value;
			if (this._practitioner) {
				this._load_availability();
				this._load_quota_visualizer();
			} else {
				document.getElementById('rw-availability').innerHTML =
					`<div style="color:var(--text-muted);font-size:12px;text-align:center;margin-top:48px;">
						Select a practitioner to see available sessions.</div>`;
				document.getElementById('rw-quota-viz').style.display = 'none';
			}
		});

		// Search
		const input = document.getElementById('rw-search');
		input.addEventListener('focus', () => input.style.borderColor = 'var(--primary)');
		input.addEventListener('blur', () => {
			input.style.borderColor = 'var(--border-color)';
			setTimeout(() => {
				document.getElementById('rw-search-dropdown').style.display = 'none';
			}, 200);
		});
		input.addEventListener('input', (e) => {
			clearTimeout(this._search_timer);
			const q = e.target.value.trim();
			if (q.length < 2) {
				document.getElementById('rw-search-dropdown').style.display = 'none';
				return;
			}
			this._search_timer = setTimeout(() => this._run_search(q), 280);
		});

		// Emergency
		document.getElementById('rw-emergency-btn').addEventListener('click', () => this._show_emergency());

		// Panel back button
		document.getElementById('rw-panel-back').addEventListener('click', () => this._show_board());
	}

	// ── Panel mode helpers ────────────────────────────────────────────────────

	_set_panel(title, show_back = false, actions_html = '') {
		this._panel_mode = title.toLowerCase().replace(/\s+/g, '_');
		document.getElementById('rw-panel-title').textContent = title;
		document.getElementById('rw-panel-back').style.display = show_back ? '' : 'none';
		document.getElementById('rw-panel-actions').innerHTML = actions_html;
	}

	_panel_body() {
		return document.getElementById('rw-panel-body');
	}

	// ── BOARD MODE ────────────────────────────────────────────────────────────

	_show_board() {
		this._booking_slot    = null;
		this._booking_patient = null;
		this._booking_appt    = null;
		this._booking_charge  = null;
		this._rescheduling    = null;
		this._mgmt_patient    = null;

		// Reset availability cards button labels
		document.querySelectorAll('.rw-avail-card .rw-book-btn').forEach(btn => {
			btn.textContent = 'Book Now';
			btn.style.background = btn.dataset.color || 'var(--primary)';
		});

		this._set_panel('Today\'s Appointments', false,
			`<select id="rw-board-practitioner"
				style="padding:5px 8px;border:1px solid var(--border-color);
					border-radius:5px;background:var(--input-bg);font-size:12px;">
				<option value="">All</option>
			</select>
			<select id="rw-board-status" style="padding:5px 8px;border:1px solid var(--border-color);
				border-radius:5px;background:var(--input-bg);font-size:12px;margin-left:6px;">
				<option value="">All Status</option>
				<option value="pending">Not Checked In</option>
				<option value="checked">Checked In</option>
			</select>
			<button id="rw-board-refresh"
				style="padding:5px 9px;border:1px solid var(--border-color);border-radius:5px;
					background:var(--card-bg);cursor:pointer;margin-left:6px;">↻</button>`
		);

		// Populate practitioner options in board filter
		this._load_todays_appointments();

		setTimeout(() => {
			frappe.call({
				method: 'frappe.client.get_list',
				args: {
					doctype: 'Healthcare Practitioner',
					fields: ['name', 'practitioner_name'],
					filters: [['status', '=', 'Active']],
					limit: 100,
				},
				callback: (r) => {
					const sel = document.getElementById('rw-board-practitioner');
					if (!sel) return;
					(r.message || []).forEach(p => {
						const opt = document.createElement('option');
						opt.value = p.name;
						opt.textContent = p.practitioner_name || p.name;
						sel.appendChild(opt);
					});
					sel.addEventListener('change', () => this._filter_board());
					document.getElementById('rw-board-status').addEventListener('change', () => this._filter_board());
					document.getElementById('rw-board-refresh').addEventListener('click', () => this._load_todays_appointments());
				},
			});
		}, 50);
	}

	_load_todays_appointments() {
		frappe.call({
			method: 'clinic_flow.api.appointments.get_todays_appointments',
			args: {},
			callback: (r) => {
				this._all_appointments = r.message || [];
				if (this._panel_mode === "today's_appointments") this._filter_board();
			},
		});
	}

	_filter_board() {
		const sel_prac   = document.getElementById('rw-board-practitioner');
		const sel_status = document.getElementById('rw-board-status');
		const prac_f     = sel_prac   ? sel_prac.value   : '';
		const status_f   = sel_status ? sel_status.value : '';

		let list = this._all_appointments;
		if (prac_f)   list = list.filter(a => a.practitioner === prac_f);
		if (status_f === 'pending') list = list.filter(a => !['Checked In', 'Checked Out'].includes(a.status));
		if (status_f === 'checked') list = list.filter(a =>  ['Checked In', 'Checked Out'].includes(a.status));
		this._render_board(list);
	}

	_render_board(appointments) {
		const body = this._panel_body();
		if (!appointments.length) {
			body.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:48px;font-size:12px;">
				No appointments match the current filter.</div>`;
			return;
		}

		const TYPE_COLORS = { PRE_BOOKED:'#3b82f6', FOLLOW_UP:'#f97316', WALK_IN:'#22c55e', EMERGENCY:'#dc2626' };
		const TYPE_LABELS = { PRE_BOOKED:'STD', FOLLOW_UP:'FLW', WALK_IN:'WLK', EMERGENCY:'EMR' };

		body.innerHTML = appointments.map(a => {
			const checked    = ['Checked In','Checked Out'].includes(a.status);
			const dot        = checked ? '#16a34a' : '#f59e0b';
			const tc         = TYPE_COLORS[a.custom_queue_type] || '#6b7280';
			const tl         = TYPE_LABELS[a.custom_queue_type] || '';
			return `<div class="rw-appt-row">
				<span style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0;"></span>
				<div style="flex:1;min-width:0;">
					<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
						<span style="font-weight:600;font-size:13px;">${a.patient_name}</span>
						${tl ? `<span style="padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700;background:${tc}18;color:${tc};">${tl}</span>` : ''}
						${a.custom_queue_token ? `<span style="font-family:monospace;font-size:12px;font-weight:700;color:var(--primary);">${a.custom_queue_token}</span>` : ''}
					</div>
					<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
						${a.practitioner_name || a.practitioner}
						${a.appointment_time ? '· ' + _fmt_time(a.appointment_time) : ''}
					</div>
				</div>
				${!checked
					? `<button class="rw-checkin-btn" data-name="${a.name}">Check In</button>`
					: `<span style="font-size:11px;color:#16a34a;font-weight:600;">✓ ${a.status}</span>`}
			</div>`;
		}).join('');

		body.querySelectorAll('.rw-checkin-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const appt = this._all_appointments.find(a => a.name === btn.dataset.name);
				if (appt) this._start_checkin_from_board(appt);
			});
		});
	}

	// Check-in from board (no booking needed — appointment already exists)
	_start_checkin_from_board(appt) {
		this._booking_appt    = appt.name;
		this._booking_patient = { name: appt.patient, patient_name: appt.patient_name };
		this._booking_slot    = {
			date: appt.appointment_date,
			from_time: appt.appointment_time || '',
			to_time: '',
		};
		this._load_payment_step();
	}

	// ── SEARCH ────────────────────────────────────────────────────────────────

	_run_search(query) {
		frappe.call({
			method: 'clinic_flow.api.appointments.search_patients',
			args: { query },
			callback: (r) => {
				const dd = document.getElementById('rw-search-dropdown');
				dd.innerHTML = '';
				const patients = r.message || [];

				if (patients.length) {
					patients.forEach(p => {
						const row = document.createElement('div');
						row.className = 'rw-search-row';
						row.innerHTML = `
							<div>
								<div style="font-weight:600;font-size:13px;">${p.patient_name}</div>
								<div style="font-size:11px;color:var(--text-muted);">${p.mobile || 'No mobile on record'}</div>
							</div>
							<svg width="11" height="11" viewBox="0 0 16 16" fill="var(--text-muted)">
								<path d="M4 8a.5.5 0 0 1 .5-.5h5.793L8.146 5.354a.5.5 0 1 1 .708-.708l3 3a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L10.293 8.5H4.5A.5.5 0 0 1 4 8z"/>
							</svg>`;
						row.addEventListener('click', () => {
							document.getElementById('rw-search').value = '';
							dd.style.display = 'none';
							this._show_patient_panel(p);
						});
						dd.appendChild(row);
					});
				} else {
					const none = document.createElement('div');
					none.style.cssText = 'padding:12px 14px;color:var(--text-muted);font-size:12px;';
					none.textContent = 'No patients found.';
					dd.appendChild(none);
				}
				dd.style.display = 'block';
			},
		});
	}

	// ── PATIENT MANAGEMENT PANEL ──────────────────────────────────────────────

	_show_patient_panel(patient) {
		this._mgmt_patient = patient;
		this._set_panel(patient.patient_name, true);

		const body = this._panel_body();
		body.innerHTML = `
			<div style="padding:10px 18px;background:var(--bg-color);border-bottom:1px solid var(--border-color);">
				<div style="font-size:12px;color:var(--text-muted);">${patient.mobile || 'No mobile'}</div>
			</div>
			<div id="rw-mgmt-list" style="padding:14px 18px;">
				<div style="color:var(--text-muted);text-align:center;padding:24px;font-size:12px;">Loading…</div>
			</div>`;

		frappe.call({
			method: 'clinic_flow.api.appointments.get_patient_appointments',
			args: { patient: patient.name },
			callback: (r) => this._render_patient_appointments(r.message || []),
		});
	}

	_render_patient_appointments(appointments) {
		const list = document.getElementById('rw-mgmt-list');
		const today_str = frappe.datetime.get_today();

		if (!appointments.length) {
			list.innerHTML = `<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:32px;line-height:1.8;">
				No upcoming appointments.<br>
				<span style="color:var(--primary);cursor:pointer;font-weight:600;" id="rw-mgmt-book-first">Book one now →</span>
			</div>`;
			document.getElementById('rw-mgmt-book-first').addEventListener('click', () => {
				this._show_board();
				frappe.show_alert({ message: `Select a slot then pick patient "${this._mgmt_patient.patient_name}"`, indicator: 'blue' }, 5);
			});
			return;
		}

		const TYPE_COLORS = { PRE_BOOKED:'#3b82f6', FOLLOW_UP:'#f97316', WALK_IN:'#22c55e', EMERGENCY:'#dc2626' };
		const TYPE_LABELS = { PRE_BOOKED:'Standard', FOLLOW_UP:'Follow-up', WALK_IN:'Walk-in', EMERGENCY:'Emergency' };

		list.innerHTML = '';
		appointments.forEach(a => {
			const is_today = a.appointment_date === today_str;
			const is_past  = a.appointment_date < today_str;
			const tc       = TYPE_COLORS[a.custom_queue_type] || '#6b7280';
			const tl       = TYPE_LABELS[a.custom_queue_type] || a.custom_queue_type || '—';
			const d_obj    = new Date(a.appointment_date + 'T00:00:00');
			const d_label  = d_obj.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
			const dot_c    = a.status === 'Checked In' ? '#16a34a' : a.status === 'Open' ? '#3b82f6' : '#6b7280';

			const card = document.createElement('div');
			card.className = 'rw-mgmt-card';
			card.innerHTML = `
				<span style="width:8px;height:8px;border-radius:50%;background:${dot_c};flex-shrink:0;"></span>
				<div style="flex:1;min-width:0;">
					<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
						<span style="font-weight:600;font-size:13px;">${d_label}${is_today ? ' <span style="color:#16a34a;font-size:11px;">(Today)</span>' : ''}</span>
						<span style="padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700;background:${tc}18;color:${tc};">${tl}</span>
					</div>
					<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
						${a.practitioner_name || a.practitioner}
						${a.appointment_time ? '· ' + _fmt_time(a.appointment_time) : ''}
						· <span style="color:${dot_c};">${a.status}</span>
					</div>
				</div>
				<div style="display:flex;gap:5px;flex-shrink:0;">
					${!is_past && a.status === 'Open'
						? `<button class="rw-btn-secondary rw-reschedule" data-name="${a.name}" data-prac="${a.practitioner}"
							style="padding:4px 10px;font-size:11px;">Reschedule</button>`
						: ''}
					${!['Checked In','Checked Out'].includes(a.status)
						? `<button class="rw-btn-secondary rw-cancel" data-name="${a.name}"
							style="padding:4px 10px;font-size:11px;border-color:#fca5a5;color:#dc2626;">Cancel</button>`
						: ''}
					${is_today && a.status === 'Open'
						? `<button class="rw-checkin-btn rw-mgmt-checkin" data-name="${a.name}" data-patient="${a.patient}"
							data-patient_name="${a.patient_name}" data-date="${a.appointment_date}"
							data-time="${a.appointment_time || ''}" style="padding:4px 10px;font-size:11px;">
							Check In</button>`
						: ''}
				</div>`;

			list.appendChild(card);
		});

		list.querySelectorAll('.rw-cancel').forEach(btn => {
			btn.addEventListener('click', () => this._cancel_appointment(btn.dataset.name));
		});
		list.querySelectorAll('.rw-reschedule').forEach(btn => {
			btn.addEventListener('click', () => this._start_reschedule(btn.dataset.name, btn.dataset.prac));
		});
		list.querySelectorAll('.rw-mgmt-checkin').forEach(btn => {
			btn.addEventListener('click', () => {
				this._booking_appt    = btn.dataset.name;
				this._booking_patient = { name: btn.dataset.patient, patient_name: btn.dataset.patient_name };
				this._booking_slot    = { date: btn.dataset.date, from_time: btn.dataset.time, to_time: '' };
				this._load_payment_step();
			});
		});
	}

	_cancel_appointment(appointment_name) {
		frappe.confirm('Cancel this appointment? This cannot be undone.', () => {
			frappe.call({
				method: 'clinic_flow.api.appointments.cancel_appointment',
				args: { appointment: appointment_name },
				callback: () => {
					frappe.show_alert({ message: 'Appointment cancelled', indicator: 'orange' }, 3);
					if (this._mgmt_patient) this._show_patient_panel(this._mgmt_patient);
					this._load_todays_appointments();
				},
			});
		});
	}

	_start_reschedule(appointment_name, practitioner) {
		this._rescheduling = { appointment_name, patient: this._mgmt_patient };
		this._show_board();

		const sel = document.getElementById('rw-filter-practitioner');
		sel.value = practitioner;
		this._practitioner = practitioner;
		this._load_availability();
		this._load_quota_visualizer();

		frappe.show_alert({
			message: `Rescheduling ${this._mgmt_patient.patient_name} — pick a new slot`,
			indicator: 'blue',
		}, 6);
	}

	// ── AVAILABILITY (left panel) ─────────────────────────────────────────────

	_load_quota_visualizer() {
		frappe.call({
			method: 'clinic_flow.api.queue.get_slot_availability',
			args: { practitioner: this._practitioner, appointment_date: frappe.datetime.get_today() },
			callback: (r) => {
				if (!r.message) return;
				const bars = document.getElementById('rw-quota-bars');
				bars.innerHTML = '';
				const types = [
					{ key:'PRE_BOOKED', label:'Standard',  color:'#3b82f6' },
					{ key:'FOLLOW_UP',  label:'Follow-up', color:'#f97316' },
					{ key:'WALK_IN',    label:'Walk-in',   color:'#22c55e' },
				];
				let any = false;
				types.forEach(t => {
					const s = r.message[t.key];
					if (!s || s.limit >= 9999) return;
					any = true;
					const pct = s.limit ? Math.min(100, Math.round(s.used / s.limit * 100)) : 0;
					const el = document.createElement('div');
					el.style.cssText = 'margin-bottom:8px;';
					el.innerHTML = `
						<div style="display:flex;justify-content:space-between;margin-bottom:3px;">
							<span style="font-size:11px;color:var(--text-muted);">${t.label}</span>
							<span style="font-size:11px;font-weight:600;">${s.used}/${s.limit}
								<span style="color:${s.full?'#dc2626':'#16a34a'};">(${s.available} left)</span>
							</span>
						</div>
						<div style="background:var(--bg-color);border-radius:4px;height:7px;overflow:hidden;">
							<div style="width:${pct}%;background:${t.color};height:100%;border-radius:4px;transition:width .3s;"></div>
						</div>`;
					bars.appendChild(el);
				});
				document.getElementById('rw-quota-viz').style.display = any ? 'block' : 'none';
			},
		});
	}

	_load_availability() {
		const container = document.getElementById('rw-availability');
		const is_walkin = this._queue_type === 'WALK_IN';
		container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:48px;font-size:12px;">Loading…</div>`;

		frappe.call({
			method: 'clinic_flow.api.appointments.get_availability',
			args: { practitioner: this._practitioner, queue_type: this._queue_type },
			callback: (r) => {
				const slots = r.message || [];
				container.innerHTML = '';
				if (is_walkin) {
					const note = document.createElement('div');
					note.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:10px;';
					note.textContent = 'Walk-in slots are for today only.';
					container.appendChild(note);
				}
				if (!slots.length) {
					const msg = document.createElement('div');
					msg.style.cssText = 'text-align:center;color:var(--text-muted);padding:32px;font-size:12px;';
					msg.textContent = is_walkin ? 'No walk-in slots available today.' : 'No available slots in the next 30 days.';
					container.appendChild(msg);
					return;
				}
				slots.forEach(slot => this._render_avail_card(container, slot));
			},
		});
	}

	_render_avail_card(container, slot) {
		const TYPE_COLORS = { PRE_BOOKED:'#3b82f6', FOLLOW_UP:'#f97316', WALK_IN:'#22c55e' };
		const TYPE_LABELS = { PRE_BOOKED:'Standard', FOLLOW_UP:'Follow-up', WALK_IN:'Walk-in' };
		const color  = TYPE_COLORS[this._queue_type] || '#6b7280';
		const label  = TYPE_LABELS[this._queue_type] || '';
		const d_obj  = new Date(slot.date + 'T00:00:00');
		const d_lbl  = d_obj.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });

		const is_reschedule = !!this._rescheduling;
		const btn_label = is_reschedule ? 'Reschedule Here' : 'Book Now';
		const btn_color = is_reschedule ? '#7c3aed' : color;

		const card = document.createElement('div');
		card.className = 'rw-avail-card';
		card.dataset.slot = JSON.stringify(slot);

		card.innerHTML = `
			<div style="flex:1;min-width:0;">
				<div style="font-size:14px;font-weight:700;margin-bottom:3px;">${d_lbl}</div>
				<div style="font-size:12px;color:var(--text-muted);">
					${_fmt_time(slot.from_time)} – ${_fmt_time(slot.to_time)}
					${slot.within_release ? `&nbsp;<span style="background:#fef3c7;color:#d97706;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;">RELEASED</span>` : ''}
				</div>
			</div>
			<div style="text-align:center;padding:0 12px;border-left:1px solid var(--border-color);border-right:1px solid var(--border-color);">
				<div style="font-size:22px;font-weight:800;color:${color};line-height:1.1;">${slot.available}</div>
				<div style="font-size:10px;color:var(--text-muted);white-space:nowrap;">${label} left</div>
			</div>
			<button class="rw-book-btn" data-color="${btn_color}" style="background:${btn_color};color:#fff;">${btn_label}</button>`;

		card.querySelector('.rw-book-btn').addEventListener('click', () => this._on_book_now(slot));
		container.appendChild(card);
	}

	_on_book_now(slot) {
		if (!this._practitioner) {
			frappe.show_alert({ message: 'Please select a practitioner first.', indicator: 'red' }, 3);
			return;
		}
		if (this._rescheduling) {
			this._confirm_reschedule(slot);
			return;
		}
		this._booking_slot    = slot;
		this._booking_patient = null;
		this._booking_appt    = null;
		this._booking_step    = 0;
		this._show_booking_panel();
	}

	// ── BOOKING PANEL ─────────────────────────────────────────────────────────

	_show_booking_panel() {
		const slot      = this._booking_slot;
		const d_obj     = new Date(slot.date + 'T00:00:00');
		const d_label   = d_obj.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' });
		const is_future = slot.date > frappe.datetime.get_today();
		const TYPE_LABELS = { PRE_BOOKED:'Standard', FOLLOW_UP:'Follow-up', WALK_IN:'Walk-in' };

		this._set_panel(
			`${TYPE_LABELS[this._queue_type] || ''} — ${d_label}`,
			true,
		);

		const body = this._panel_body();
		body.innerHTML = `
			<!-- Slot summary -->
			<div style="padding:10px 18px;background:var(--bg-color);border-bottom:1px solid var(--border-color);
				font-size:12px;display:flex;justify-content:space-between;align-items:center;">
				<span style="color:var(--text-muted);">${_fmt_time(slot.from_time)} – ${_fmt_time(slot.to_time)}</span>
				<span style="font-weight:600;">${slot.available} slots remaining</span>
				${is_future ? `<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">Future date — no payment today</span>` : ''}
			</div>

			<!-- Step indicator -->
			<div class="rw-step-indicator" style="padding:12px 18px 0;">
				<div class="rw-step active" id="step-0">1 · Patient</div>
				<div class="rw-step" id="step-1">${is_future ? '2 · Confirm' : '2 · Payment'}</div>
				<div class="rw-step" id="step-2">3 · Done</div>
			</div>

			<!-- Step content -->
			<div id="rw-booking-content" style="padding:16px 18px;"></div>`;

		this._render_booking_step(0);
	}

	_render_booking_step(step) {
		this._booking_step = step;
		['step-0','step-1','step-2'].forEach((id, i) => {
			const el = document.getElementById(id);
			if (!el) return;
			el.className = 'rw-step ' + (i < step ? 'done' : i === step ? 'active' : '');
		});

		const content = document.getElementById('rw-booking-content');
		if (!content) return;

		if (step === 0) this._render_patient_step(content);
		if (step === 1) this._render_payment_step(content);
		if (step === 2) this._render_done_step(content);
	}

	// Step 0: Patient
	_render_patient_step(content) {
		const is_future = this._booking_slot && this._booking_slot.date > frappe.datetime.get_today();
		content.innerHTML = `
			<div style="margin-bottom:4px;">
				<label class="rw-label" style="display:block;margin-bottom:6px;">Patient</label>
				<input class="rw-panel-input" id="bk-patient-search"
					placeholder="Type name or mobile to search…" autocomplete="off">
				<div class="rw-inline-results" id="bk-patient-results"></div>
				<div id="bk-patient-selected" style="display:none;margin-top:8px;
					padding:10px 12px;background:#f0fdf4;border:1px solid #86efac;
					border-radius:6px;display:flex;align-items:center;justify-content:space-between;"></div>
			</div>
			<div id="bk-new-patient-section" style="display:none;margin-top:12px;
				padding:14px;border:1px dashed var(--border-color);border-radius:8px;">
				<div class="rw-label" style="margin-bottom:10px;">New Patient</div>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
					<div>
						<label style="font-size:11px;color:var(--text-muted);">First Name *</label>
						<input class="rw-panel-input" id="bk-first-name" style="margin-top:3px;">
					</div>
					<div>
						<label style="font-size:11px;color:var(--text-muted);">Last Name</label>
						<input class="rw-panel-input" id="bk-last-name" style="margin-top:3px;">
					</div>
				</div>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
					<div>
						<label style="font-size:11px;color:var(--text-muted);">Mobile *</label>
						<input class="rw-panel-input" id="bk-mobile" style="margin-top:3px;" type="tel">
					</div>
					<div>
						<label style="font-size:11px;color:var(--text-muted);">Sex *</label>
						<select class="rw-panel-input" id="bk-sex" style="margin-top:3px;">
							<option>Male</option><option>Female</option><option>Other</option>
						</select>
					</div>
				</div>
				<div style="margin-bottom:8px;">
					<label style="font-size:11px;color:var(--text-muted);">Date of Birth</label>
					<input class="rw-panel-input" id="bk-dob" type="date" style="margin-top:3px;">
				</div>
				<button class="rw-btn-primary" id="bk-create-patient-btn">Create Patient & Continue</button>
			</div>
			<button class="rw-btn-primary" id="bk-patient-next" style="display:none;margin-top:12px;">
				${is_future ? 'Confirm Booking →' : 'Continue to Payment →'}
			</button>`;

		const $input    = $(content).find('#bk-patient-search');
		const $results  = $(content).find('#bk-patient-results');
		const $selected = $(content).find('#bk-patient-selected');
		const $next_btn = $(content).find('#bk-patient-next');
		const $new_sec  = $(content).find('#bk-new-patient-section');

		const set_patient = (p) => {
			this._booking_patient = p;
			$input.hide();
			$results.hide();
			$selected.show().css('display','flex').html(`
				<div>
					<div style="font-weight:700;">${p.patient_name}</div>
					<div style="font-size:11px;color:#166534;">${p.mobile || ''}</div>
				</div>
				<span id="bk-clear-patient" style="cursor:pointer;color:var(--text-muted);font-size:20px;">×</span>`);
			$('#bk-clear-patient').on('click', () => {
				this._booking_patient = null;
				$input.show().val('');
				$selected.hide();
				$next_btn.hide();
				$new_sec.hide();
			});
			$new_sec.hide();
			$next_btn.show();
		};

		let timer = null;
		$input.on('input', () => {
			clearTimeout(timer);
			const q = $input.val().trim();
			$results.hide();
			if (q.length < 2) return;
			timer = setTimeout(() => {
				frappe.call({
					method: 'clinic_flow.api.appointments.search_patients',
					args: { query: q },
					callback: (r) => {
						$results.empty();
						(r.message || []).forEach(p => {
							const row = $(`<div class="rw-search-row">
								<div>
									<div style="font-weight:600;font-size:13px;">${p.patient_name}</div>
									<div style="font-size:11px;color:var(--text-muted);">${p.mobile || 'No mobile'}</div>
								</div>
							</div>`);
							row.on('click', () => set_patient(p));
							$results.append(row);
						});

						const add_row = $(`<div class="rw-search-row" style="color:var(--primary);font-weight:600;">
							<span style="font-size:16px;margin-right:6px;">+</span>
							<span>New patient "${q}"</span>
						</div>`);
						add_row.on('click', () => {
							$results.hide();
							const is_mobile = /^\d/.test(q);
							$('#bk-first-name').val(is_mobile ? '' : q.split(' ')[0]);
							$('#bk-last-name').val(is_mobile ? '' : q.split(' ').slice(1).join(' '));
							$('#bk-mobile').val(is_mobile ? q : '');
							$new_sec.show();
						});
						$results.append(add_row);
						$results.show();
					},
				});
			}, 250);
		});

		$('#bk-create-patient-btn').on('click', () => {
			const first = $('#bk-first-name').val().trim();
			const mobile = $('#bk-mobile').val().trim();
			if (!first) { frappe.show_alert({ message: 'First name is required.', indicator: 'red' }, 3); return; }
			if (!mobile) { frappe.show_alert({ message: 'Mobile is required.', indicator: 'red' }, 3); return; }
			frappe.call({
				method: 'clinic_flow.api.appointments.quick_create_patient',
				args: {
					first_name: first,
					last_name: $('#bk-last-name').val().trim(),
					mobile,
					dob: $('#bk-dob').val(),
					sex: $('#bk-sex').val(),
				},
				callback: (r) => {
					if (!r.message) return;
					frappe.show_alert({ message: `Patient ${r.message.patient_name} created`, indicator: 'green' }, 3);
					set_patient({ name: r.message.patient, patient_name: r.message.patient_name, mobile });
				},
			});
		});

		$next_btn.on('click', () => {
			if (!this._booking_patient) return;
			this._create_appointment_then_payment();
		});
	}

	_create_appointment_then_payment() {
		const slot      = this._booking_slot;
		const is_future = slot.date > frappe.datetime.get_today();
		frappe.call({
			method: 'clinic_flow.api.appointments.book_appointment',
			args: {
				patient:          this._booking_patient.name,
				practitioner:     this._practitioner,
				appointment_date: slot.date,
				from_time:        slot.from_time,
				to_time:          slot.to_time,
				queue_type:       this._queue_type,
				schedule:         slot.schedule || '',
			},
			callback: (r) => {
				if (!r.message) return;
				this._booking_appt = r.message.appointment;
				if (is_future) {
					// Future appointment: no payment today — show scheduled confirmation
					this._booking_result = {
						is_scheduled:     true,
						appointment:      r.message.appointment,
						patient_name:     this._booking_patient.patient_name,
						appointment_date: slot.date,
					};
					this._render_booking_step(2);
					this._load_availability();
				} else {
					this._load_payment_step();
				}
			},
		});
	}

	// Step 1: Payment
	_load_payment_step() {
		// Can be called from booking flow OR from board/management check-in
		const in_booking_flow = !!document.getElementById('rw-booking-content');

		frappe.call({
			method: 'clinic_flow.api.appointments.get_consultation_charge',
			args: {
				practitioner: this._practitioner ||
					frappe.db && frappe.db.get_value
						? this._get_appt_practitioner()
						: '',
				patient: this._booking_patient.name,
			},
			callback: (r) => {
				this._booking_charge = r.message || {};
				if (in_booking_flow) {
					this._render_booking_step(1);
				} else {
					this._show_payment_standalone();
				}
			},
		});
	}

	_get_appt_practitioner() {
		// When checking in from board, get practitioner from appointment
		if (this._practitioner) return this._practitioner;
		const appt = this._all_appointments.find(a => a.name === this._booking_appt);
		return appt ? appt.practitioner : '';
	}

	_render_payment_step(content) {
		const charge = this._booking_charge || {};
		const covered = charge.covered_by_validity;
		const amount  = charge.charge || 0;
		const modes   = charge.payment_modes || ['Cash', 'Card'];
		const mode_opts = modes.map(m => `<option value="${m}">${m}</option>`).join('');
		const patient_name = this._booking_patient ? this._booking_patient.patient_name : '';

		content.innerHTML = `
			<div style="padding:12px 14px;background:var(--bg-color);border-radius:8px;margin-bottom:14px;">
				<div style="font-weight:700;font-size:14px;">${patient_name}</div>
				${covered
					? `<div style="margin-top:6px;padding:6px 10px;background:#f0fdf4;border:1px solid #86efac;border-radius:5px;font-size:12px;color:#166534;">
						✓ Covered by fee validity until ${frappe.datetime.str_to_user(charge.validity_till)} — no charge
					</div>`
					: `<div style="margin-top:6px;font-size:12px;color:var(--text-muted);">
						Consultation fee: <strong>₹ ${_fmt_currency(charge.original_charge)}</strong>
					</div>`
				}
			</div>

			${!covered ? `
			<div style="margin-bottom:12px;">
				<label class="rw-label" style="display:block;margin-bottom:6px;">Mode of Payment</label>
				<select class="rw-panel-input" id="bk-payment-mode">${mode_opts}</select>
			</div>
			<div style="margin-bottom:14px;">
				<label class="rw-label" style="display:block;margin-bottom:6px;">Amount Collected (₹)</label>
				<input class="rw-panel-input" id="bk-amount" type="number"
					value="${amount}" min="0" step="0.01"
					style="font-size:18px;font-weight:700;text-align:right;">
			</div>` : `<input type="hidden" id="bk-payment-mode" value="">
				<input type="hidden" id="bk-amount" value="0">`
			}

			<button class="rw-btn-primary" id="bk-confirm-payment">
				${covered ? 'Check In & Issue Token' : 'Collect Payment & Check In'}
			</button>`;

		$(content).find('#bk-confirm-payment').on('click', () => {
			const mode   = $(content).find('#bk-payment-mode').val() || '';
			const amount = parseFloat($(content).find('#bk-amount').val() || 0);
			this._do_payment_and_checkin(mode, amount);
		});
	}

	// Standalone payment (from board check-in or management panel)
	_show_payment_standalone() {
		const patient_name = this._booking_patient ? this._booking_patient.patient_name : '';
		this._set_panel(`Check In — ${patient_name}`, true);
		const body = this._panel_body();
		body.innerHTML = `
			<div class="rw-step-indicator" style="padding:12px 18px 0;">
				<div class="rw-step done">1 · Patient</div>
				<div class="rw-step active">2 · Payment</div>
				<div class="rw-step">3 · Done</div>
			</div>
			<div id="rw-booking-content" style="padding:16px 18px;"></div>`;
		this._render_payment_step(document.getElementById('rw-booking-content'));
	}

	_do_payment_and_checkin(mode, amount) {
		frappe.call({
			method: 'clinic_flow.api.appointments.record_payment_and_checkin',
			args: {
				appointment:      this._booking_appt,
				mode_of_payment:  mode,
				paid_amount:      amount,
			},
			callback: (r) => {
				if (!r.message) return;
				this._booking_result = r.message;
				const content = document.getElementById('rw-booking-content');
				if (content) {
					const in_booking_flow = document.getElementById('step-2');
					if (in_booking_flow) this._render_booking_step(2);
					else this._render_done_standalone(content, r.message);
				}
				this._load_todays_appointments();
				this._load_availability();
				this._load_quota_visualizer();
				this._load_session_pills();
			},
		});
	}

	// Step 2: Done
	_render_done_step(content) {
		this._render_done_content(content, this._booking_result);
	}

	_render_done_standalone(content, result) {
		this._render_done_content(content, result);
	}

	_render_done_content(content, result) {
		if (!result) return;

		// Future appointment — no token, no payment
		if (result.is_scheduled) {
			const d_label = result.appointment_date
				? new Date(result.appointment_date + 'T00:00:00').toLocaleDateString('en-GB',
					{ weekday:'long', day:'numeric', month:'long', year:'numeric' })
				: '';
			content.innerHTML = `
				<div style="text-align:center;padding:20px 0;">
					<div style="font-size:38px;margin-bottom:10px;">📅</div>
					<div style="font-size:18px;font-weight:700;color:#0f766e;margin-bottom:6px;">Appointment Scheduled</div>
					<div style="font-size:13px;color:var(--text-muted);">${result.patient_name}</div>
					<div style="font-size:14px;font-weight:600;margin-top:6px;">${d_label}</div>
					<div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.6;">
						Payment will be collected on the day of visit.<br>
						Check in the patient when they arrive to issue a queue token.
					</div>
				</div>
				<button class="rw-btn-primary" id="bk-done-next" style="margin-top:10px;">
					Done — Next Patient
				</button>`;
			$(content).find('#bk-done-next').on('click', () => this._show_board());
			return;
		}

		const token     = result.token || '—';
		const prac_name = result.practitioner_name || '';
		const d_label   = result.appointment_date
			? new Date(result.appointment_date + 'T00:00:00').toLocaleDateString('en-GB',
				{ weekday:'short', day:'numeric', month:'short' })
			: '';

		content.innerHTML = `
			<div style="text-align:center;padding:20px 0;">
				<div style="font-size:11px;font-weight:600;color:var(--text-muted);
					text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Queue Token</div>
				<div style="font-size:42px;font-weight:900;font-family:monospace;
					color:var(--primary);letter-spacing:3px;margin-bottom:6px;">${token}</div>
				<div style="font-size:13px;color:var(--text-muted);">${result.patient_name}</div>
				<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${prac_name}  ${d_label}</div>
				${result.paid_amount > 0
					? `<div style="margin-top:8px;font-size:12px;color:#166534;">
						✓ ₹ ${_fmt_currency(result.paid_amount)} · ${result.mode_of_payment}</div>`
					: ''}
			</div>
			<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;">
				<button class="rw-btn-secondary" id="bk-print-receipt" style="text-align:center;padding:10px;">
					🖨 Print Receipt
				</button>
				<button class="rw-btn-secondary" id="bk-print-token" style="text-align:center;padding:10px;">
					🎫 Print Token
				</button>
			</div>
			<button class="rw-btn-primary" id="bk-done-next" style="margin-top:10px;">
				Done — Next Patient
			</button>`;

		$(content).find('#bk-print-receipt').on('click', () => _print_receipt(result));
		$(content).find('#bk-print-token').on('click', () => _print_token(result));
		$(content).find('#bk-done-next').on('click', () => this._show_board());
	}

	// ── EMERGENCY ─────────────────────────────────────────────────────────────

	_show_emergency() {
		frappe.call({
			method: 'clinic_flow.api.queue.get_queue_state_for_display',
			args: { dept: 'all' },
			callback: (r) => {
				const sessions = ((r.message && r.message.sessions) || [])
					.filter(s => s.session_status === 'Active');
				if (!sessions.length) {
					frappe.msgprint({ title:'No Active Sessions',
						message:'No active doctor sessions to route an emergency to.', indicator:'red' });
					return;
				}

				this._set_panel('🚨 Emergency Intake', true);
				const body = this._panel_body();
				const sess_opts = sessions.map(s =>
					`<option value="${s.session}" data-prac="${s.practitioner}">${s.practitioner_name}</option>`
				).join('');

				body.innerHTML = `
					<div style="padding:16px 18px;">
						<div style="margin-bottom:12px;">
							<label class="rw-label" style="display:block;margin-bottom:6px;">Route to Doctor</label>
							<select class="rw-panel-input" id="emg-session">${sess_opts}</select>
						</div>
						<div style="margin-bottom:12px;">
							<label class="rw-label" style="display:block;margin-bottom:6px;">Patient</label>
							<input class="rw-panel-input" id="emg-patient-search"
								placeholder="Search by name or mobile…" autocomplete="off">
							<div class="rw-inline-results" id="emg-patient-results"></div>
							<div id="emg-patient-selected" style="display:none;margin-top:8px;
								padding:10px 12px;background:#fef2f2;border:1px solid #fca5a5;
								border-radius:6px;align-items:center;justify-content:space-between;"></div>
						</div>
						<div id="emg-new-patient-section" style="display:none;margin-top:4px;
							padding:14px;border:1px dashed var(--border-color);border-radius:8px;margin-bottom:12px;">
							<div class="rw-label" style="margin-bottom:10px;">New Patient</div>
							<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
								<div>
									<label style="font-size:11px;color:var(--text-muted);">First Name *</label>
									<input class="rw-panel-input" id="emg-first-name" style="margin-top:3px;">
								</div>
								<div>
									<label style="font-size:11px;color:var(--text-muted);">Last Name</label>
									<input class="rw-panel-input" id="emg-last-name" style="margin-top:3px;">
								</div>
							</div>
							<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
								<div>
									<label style="font-size:11px;color:var(--text-muted);">Mobile *</label>
									<input class="rw-panel-input" id="emg-mobile" style="margin-top:3px;" type="tel">
								</div>
								<div>
									<label style="font-size:11px;color:var(--text-muted);">Sex *</label>
									<select class="rw-panel-input" id="emg-sex" style="margin-top:3px;">
										<option>Male</option><option>Female</option><option>Other</option>
									</select>
								</div>
							</div>
							<div style="margin-bottom:8px;">
								<label style="font-size:11px;color:var(--text-muted);">Date of Birth</label>
								<input class="rw-panel-input" id="emg-dob" type="date" style="margin-top:3px;">
							</div>
							<button class="rw-btn-primary" id="emg-create-patient-btn"
								style="background:#dc2626;">Create Patient</button>
						</div>
						<button class="rw-btn-primary" id="emg-go"
							style="background:#dc2626;">Issue Emergency Token</button>
					</div>`;

				let emg_patient = null;
				let timer = null;
				const $si       = $(body).find('#emg-patient-search');
				const $sr       = $(body).find('#emg-patient-results');
				const $sel      = $(body).find('#emg-patient-selected');

				const set_emg_patient = (p) => {
					emg_patient = p;
					$si.hide(); $sr.hide();
					$sel.show().css('display','flex').html(`
						<div><div style="font-weight:700;">${p.patient_name}</div>
						<div style="font-size:11px;">${p.mobile||''}</div></div>
						<span id="emg-clear" style="cursor:pointer;font-size:20px;color:var(--text-muted);">×</span>`);
					$('#emg-clear').on('click', () => {
						emg_patient = null; $si.show().val(''); $sel.hide();
					});
				};

				$si.on('input', () => {
					clearTimeout(timer);
					const q = $si.val().trim();
					$sr.hide();
					if (q.length < 2) return;
					timer = setTimeout(() => {
						frappe.call({
							method: 'clinic_flow.api.appointments.search_patients',
							args: { query: q },
							callback: (r2) => {
								$sr.empty();
								(r2.message || []).forEach(p => {
									const row = $(`<div class="rw-search-row"><div>
										<div style="font-weight:600;">${p.patient_name}</div>
										<div style="font-size:11px;color:var(--text-muted);">${p.mobile||''}</div>
									</div></div>`);
									row.on('click', () => set_emg_patient(p));
									$sr.append(row);
								});
								const add_row = $(`<div class="rw-search-row" style="color:#dc2626;font-weight:600;">
									<span style="font-size:16px;margin-right:6px;">+</span>
									<span>New patient "${q}"</span>
								</div>`);
								add_row.on('click', () => {
									$sr.hide();
									const is_mobile = /^\d/.test(q);
									$('#emg-first-name').val(is_mobile ? '' : q.split(' ')[0]);
									$('#emg-last-name').val(is_mobile ? '' : q.split(' ').slice(1).join(' '));
									$('#emg-mobile').val(is_mobile ? q : '');
									$(body).find('#emg-new-patient-section').show();
								});
								$sr.append(add_row);
								$sr.show();
							},
						});
					}, 250);
				});

				$(body).find('#emg-create-patient-btn').on('click', () => {
					const first  = $('#emg-first-name').val().trim();
					const mobile = $('#emg-mobile').val().trim();
					if (!first)  { frappe.show_alert({ message: 'First name is required.', indicator: 'red' }, 3); return; }
					if (!mobile) { frappe.show_alert({ message: 'Mobile is required.', indicator: 'red' }, 3); return; }
					frappe.call({
						method: 'clinic_flow.api.appointments.quick_create_patient',
						args: {
							first_name: first,
							last_name:  $('#emg-last-name').val().trim(),
							mobile,
							dob:        $('#emg-dob').val(),
							sex:        $('#emg-sex').val(),
						},
						callback: (r3) => {
							if (!r3.message) return;
							frappe.show_alert({ message: `Patient ${r3.message.patient_name} created`, indicator: 'green' }, 3);
							set_emg_patient({ name: r3.message.patient, patient_name: r3.message.patient_name, mobile });
							$(body).find('#emg-new-patient-section').hide();
						},
					});
				});

				$(body).find('#emg-go').on('click', () => {
					if (!emg_patient) { frappe.show_alert({ message:'Select a patient.', indicator:'red' }, 3); return; }
					const sel_el  = document.getElementById('emg-session');
					const session_name = sel_el.value;
					const prac    = sel_el.options[sel_el.selectedIndex].dataset.prac;

					this._booking_patient  = emg_patient;
					this._booking_slot     = {
						date: frappe.datetime.get_today(),
						from_time: frappe.datetime.now_time(),
						to_time: frappe.datetime.now_time(),
					};
					this._practitioner = prac;

					frappe.call({
						method: 'clinic_flow.api.appointments.book_appointment',
						args: {
							patient: emg_patient.name,
							practitioner: prac,
							appointment_date: frappe.datetime.get_today(),
							from_time: frappe.datetime.now_time(),
							to_time: frappe.datetime.now_time(),
							queue_type: 'EMERGENCY',
							schedule: '',
						},
						callback: (r2) => {
							if (!r2.message) return;
							this._booking_appt = r2.message.appointment;
							this._do_payment_and_checkin('', 0);
						},
					});
				});
			},
		});
	}

	// ── Reschedule ────────────────────────────────────────────────────────────

	_confirm_reschedule(slot) {
		const { appointment_name, patient } = this._rescheduling;
		const d_lbl = new Date(slot.date + 'T00:00').toLocaleDateString('en-GB',
			{ weekday:'short', day:'numeric', month:'short' });
		frappe.confirm(
			`Reschedule ${patient.patient_name} to ${d_lbl} ${_fmt_time(slot.from_time)}?`,
			() => {
				frappe.call({
					method: 'clinic_flow.api.appointments.cancel_appointment',
					args: { appointment: appointment_name },
					callback: () => {
						this._rescheduling = null;
						// Book new appointment
						const qt = this._queue_type;
						frappe.call({
							method: 'clinic_flow.api.appointments.book_appointment',
							args: {
								patient:          patient.name,
								practitioner:     this._practitioner,
								appointment_date: slot.date,
								from_time:        slot.from_time,
								to_time:          slot.to_time,
								queue_type:       qt,
								schedule:         slot.schedule || '',
							},
							callback: (r) => {
								if (!r.message) return;
								frappe.show_alert({
									message: `Rescheduled to ${d_lbl}, ${_fmt_time(slot.from_time)}`,
									indicator: 'green',
								}, 4);
								this._load_availability();
								this._load_todays_appointments();
							},
						});
					},
				});
			},
		);
	}
}

// ── Print: Receipt (A5 / half A4) ─────────────────────────────────────────────
function _print_receipt(data) {
	const company = (frappe.sys_defaults && frappe.sys_defaults.company) || 'Clinic';
	const w = window.open('', '_blank', 'width=700,height=900');
	const type_labels = { PRE_BOOKED:'Standard', FOLLOW_UP:'Follow-up', WALK_IN:'Walk-in', EMERGENCY:'Emergency' };
	const d_label = data.appointment_date
		? new Date(data.appointment_date + 'T00:00').toLocaleDateString('en-GB',
			{ weekday:'long', day:'numeric', month:'long', year:'numeric' })
		: '';
	w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Receipt</title>
<style>
  @page { size: A5; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
  .header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
  .header h1 { font-size: 18px; font-weight: 800; letter-spacing: 1px; }
  .header p { font-size: 11px; color: #555; margin-top: 3px; }
  .row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #ddd; }
  .row .lbl { color: #555; }
  .row .val { font-weight: 600; text-align: right; }
  .section { margin-bottom: 14px; }
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1px; color: #555; margin-bottom: 8px; }
  .token-box { text-align: center; padding: 12px; border: 2px solid #111;
    border-radius: 6px; margin: 14px 0; }
  .token-box .t { font-size: 28px; font-weight: 900; font-family: monospace; letter-spacing: 3px; }
  .footer { text-align: center; margin-top: 16px; font-size: 11px; color: #777; line-height: 1.6; }
  .paid-badge { display: inline-block; padding: 3px 10px; background: #d1fae5;
    color: #065f46; border-radius: 4px; font-weight: 700; font-size: 11px; margin-top: 6px; }
</style>
</head><body>
<div class="header">
  <h1>${company}</h1>
  <p>Consultation Receipt</p>
</div>
<div class="section">
  <div class="section-title">Patient</div>
  <div class="row"><span class="lbl">Name</span><span class="val">${data.patient_name || ''}</span></div>
  <div class="row"><span class="lbl">Doctor</span><span class="val">${data.practitioner_name || ''}</span></div>
  <div class="row"><span class="lbl">Date</span><span class="val">${d_label}</span></div>
  <div class="row"><span class="lbl">Time</span><span class="val">${_fmt_time(data.appointment_time)}</span></div>
  <div class="row"><span class="lbl">Type</span><span class="val">${type_labels[data.queue_type] || data.queue_type || ''}</span></div>
</div>
${data.paid_amount > 0 ? `
<div class="section">
  <div class="section-title">Payment</div>
  <div class="row"><span class="lbl">Consultation Fee</span><span class="val">₹ ${_fmt_currency(data.paid_amount)}</span></div>
  <div class="row"><span class="lbl">Mode</span><span class="val">${data.mode_of_payment || ''}</span></div>
  <div class="row"><span class="lbl">Status</span><span class="val"><span class="paid-badge">PAID</span></span></div>
</div>` : ''}
${data.token ? `
<div class="token-box">
  <div style="font-size:11px;color:#555;margin-bottom:6px;">Your Queue Token</div>
  <div class="t">${data.token}</div>
</div>` : ''}
<div class="footer">
  Thank you for visiting us.<br>
  Please retain this receipt for your records.<br>
  Ref: ${data.appointment || ''}
</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`);
	w.document.close();
}

// ── Print: Token (80mm thermal) ───────────────────────────────────────────────
function _print_token(data) {
	const company = (frappe.sys_defaults && frappe.sys_defaults.company) || 'Clinic';
	const type_labels = { PRE_BOOKED:'Standard', FOLLOW_UP:'Follow-up', WALK_IN:'Walk-in', EMERGENCY:'EMERGENCY' };
	const time_str = data.appointment_time ? _fmt_time(data.appointment_time) : '';
	const date_str = data.appointment_date
		? new Date(data.appointment_date + 'T00:00').toLocaleDateString('en-GB',
			{ day:'numeric', month:'short', year:'numeric' })
		: '';
	const w = window.open('', '_blank', 'width=400,height=500');
	w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Token</title>
<style>
  @page { size: 80mm auto; margin: 4mm 3mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; width: 74mm; font-size: 11px; color: #111; }
  .center { text-align: center; }
  .clinic { font-size: 13px; font-weight: 800; letter-spacing: .5px; }
  .divider { border: none; border-top: 1px dashed #999; margin: 7px 0; }
  .token { font-size: 36px; font-weight: 900; font-family: monospace;
    letter-spacing: 4px; margin: 8px 0; }
  .label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #555; }
  .patient { font-size: 13px; font-weight: 700; margin: 4px 0 2px; }
  .info { font-size: 10px; color: #444; margin-bottom: 2px; }
  .wait { font-size: 10px; color: #555; margin-top: 8px; text-align: center; line-height: 1.5; }
  ${data.queue_type === 'EMERGENCY' ? '.token { color: #dc2626; }' : ''}
</style>
</head><body>
<div class="center">
  <div class="clinic">${company}</div>
</div>
<hr class="divider">
<div class="center">
  <div class="label">Queue Token</div>
  <div class="token">${data.token || '—'}</div>
  <div class="label">${type_labels[data.queue_type] || ''}</div>
</div>
<hr class="divider">
<div class="patient">${data.patient_name || ''}</div>
<div class="info">${data.practitioner_name || ''}</div>
<div class="info">${date_str}${time_str ? '  ·  ' + time_str : ''}</div>
<div class="wait">Please wait for your token<br>to be called at the counter.</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`);
	w.document.close();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _fmt_time(t) {
	if (!t) return '';
	const parts = String(t).split(':');
	let h = parseInt(parts[0], 10);
	const m = parts[1] || '00';
	const ampm = h >= 12 ? 'PM' : 'AM';
	h = h % 12 || 12;
	return `${h}:${m} ${ampm}`;
}

function _fmt_currency(n) {
	return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
