frappe.pages['doctor-workspace'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Doctor Workspace',
		single_column: true,
	});

	// Inject the workspace HTML
	$(wrapper).find('.page-content').html(get_workspace_html());

	// Initialize the workspace controller
	new DoctorWorkspace(wrapper);
};

// ── HTML Template ─────────────────────────────────────────────────────────
function get_workspace_html() {
	return `
	<div class="clinic-workspace" style="display:grid;grid-template-columns:280px 1fr 300px;gap:16px;height:calc(100vh - 120px);overflow:hidden;">

		<!-- LEFT PANEL: Queue -->
		<div class="ws-panel ws-left" style="overflow-y:auto;border-right:1px solid var(--border-color);">
			<div class="panel-header" style="padding:12px 16px;border-bottom:1px solid var(--border-color);">
				<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Queue</div>
				<div id="ws-session-label" style="font-weight:500;font-size:13px;margin-top:2px;">—</div>
			</div>
			<div id="ws-queue-list" style="padding:8px 0;"></div>
		</div>

		<!-- CENTER PANEL: Active Patient -->
		<div class="ws-panel ws-center" style="overflow-y:auto;padding:0 8px;">
			<!-- Action bar -->
			<div id="ws-action-bar" style="display:flex;gap:8px;padding:12px 0;border-bottom:1px solid var(--border-color);flex-wrap:wrap;">
				<button class="btn btn-primary btn-sm" id="ws-btn-call-next">Call Next</button>
				<button class="btn btn-default btn-sm" id="ws-btn-recall" disabled>Recall</button>
				<button class="btn btn-default btn-sm" id="ws-btn-skip" disabled>Skip</button>
				<div style="flex:1"></div>
				<button class="btn btn-default btn-sm" id="ws-btn-save-draft" disabled>Save Draft</button>
				<button class="btn btn-success btn-sm" id="ws-btn-submit" disabled>Submit Encounter</button>
				<button class="btn btn-warning btn-sm" id="ws-btn-pause" style="margin-left:8px;">Pause</button>
				<button class="btn btn-danger btn-sm"  id="ws-btn-end-session">End Session</button>
			</div>
			<div id="ws-session-status-bar" style="display:none;padding:6px 12px;background:var(--yellow-tint,#fff8e6);border:1px solid var(--yellow-600,#d97706);border-radius:4px;margin-top:8px;font-size:13px;color:var(--yellow-800,#92400e);">
				⏸ Session is paused. Queue display shows "Temporarily Unavailable".
				<button class="btn btn-xs btn-default" id="ws-btn-resume" style="margin-left:8px;">Resume</button>
			</div>

			<!-- Patient token banner -->
			<div id="ws-patient-banner" style="display:none;background:var(--bg-color);border:1px solid var(--border-color);border-radius:6px;padding:12px 16px;margin:12px 0;">
				<div style="display:flex;align-items:center;gap:16px;">
					<div id="ws-token-badge" style="font-size:22px;font-weight:700;color:#fff;background:var(--primary);padding:6px 14px;border-radius:6px;letter-spacing:1px;"></div>
					<div>
						<div id="ws-patient-name" style="font-size:16px;font-weight:500;"></div>
						<div id="ws-patient-meta" style="font-size:12px;color:var(--text-muted);margin-top:2px;"></div>
					</div>
					<div id="ws-queue-type-badge" style="margin-left:auto;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:500;"></div>
				</div>
			</div>

			<!-- Encounter editor -->
			<div id="ws-encounter-editor" style="display:none;">

				<!-- Symptoms -->
				<div class="ws-section">
					<div class="ws-section-title">Symptoms / Chief Complaint</div>
					<textarea id="ws-symptoms" class="form-control" rows="3" placeholder="Enter presenting complaints..." list="ws-complaint-list"></textarea>
					<datalist id="ws-complaint-list"></datalist>
				</div>

				<!-- Diagnosis -->
				<div class="ws-section">
					<div class="ws-section-title">Diagnosis</div>
					<div id="ws-diagnosis-wrapper" style="position:relative;">
						<input type="text" id="ws-diagnosis-input" class="form-control" placeholder="Search diagnosis (ICD-10)..." autocomplete="off">
						<div id="ws-diagnosis-tags" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;"></div>
					</div>
				</div>

				<!-- Plan / Notes -->
				<div class="ws-section">
					<div class="ws-section-title">Plan & Notes</div>
					<textarea id="ws-patient-note" class="form-control" rows="3" placeholder="Treatment plan, instructions to patient..."></textarea>
				</div>

				<!-- Medication -->
				<div class="ws-section">
					<div class="ws-section-title ws-collapsible" data-section="medications" style="cursor:pointer;">
						Medication Request <span class="section-toggle">▸</span>
					</div>
					<div id="ws-section-medications" style="display:none;">
						<div id="ws-drug-rows"></div>
						<button class="btn btn-xs btn-default" data-action="add-drug">+ Add Medication</button>
					</div>
				</div>

				<!-- Lab / Observation Orders -->
				<div class="ws-section">
					<div class="ws-section-title ws-collapsible" data-section="lab" style="cursor:pointer;">
						Lab / Observation Orders <span class="section-toggle">▸</span>
					</div>
					<div id="ws-section-lab" style="display:none;">
						<div id="ws-lab-rows"></div>
						<button class="btn btn-xs btn-default" data-action="add-lab">+ Add Order</button>
					</div>
				</div>

				<!-- Referral -->
				<div class="ws-section">
					<div class="ws-section-title ws-collapsible" data-section="referral" style="cursor:pointer;">
						Referral <span class="section-toggle">▸</span>
					</div>
					<div id="ws-section-referral" style="display:none;">
						<textarea id="ws-referral-note" class="form-control" rows="2" placeholder="Referral details..."></textarea>
					</div>
				</div>

			</div>

			<!-- Empty state -->
			<div id="ws-empty-state" style="text-align:center;padding:60px 20px;color:var(--text-muted);">
				<div style="font-size:36px;margin-bottom:12px;">🩺</div>
				<div style="font-size:15px;font-weight:500;">No active patient</div>
				<div style="font-size:13px;margin-top:4px;">Click "Call Next" to begin</div>
			</div>
		</div>

		<!-- RIGHT PANEL: Patient Summary -->
		<div class="ws-panel ws-right" style="overflow-y:auto;border-left:1px solid var(--border-color);padding:0 16px;">
			<div id="ws-summary-empty" style="padding:24px 0;text-align:center;color:var(--text-muted);font-size:13px;">
				Patient summary will appear here
			</div>
			<div id="ws-summary-content" style="display:none;">

				<div class="summary-section">
					<div class="summary-label">Token</div>
					<div id="sum-token" class="summary-value mono"></div>
				</div>
				<div class="summary-section">
					<div class="summary-label">Type</div>
					<div id="sum-queue-type" class="summary-value"></div>
				</div>
				<div class="summary-section">
					<div class="summary-label">Age / Sex</div>
					<div id="sum-age-sex" class="summary-value"></div>
				</div>

				<div class="summary-divider"></div>

				<div class="summary-section">
					<div class="summary-label">Chief Complaint</div>
					<div id="sum-chief-complaint" class="summary-value"></div>
				</div>

				<div class="summary-section">
					<div class="summary-label">Vitals</div>
					<div id="sum-vitals" class="summary-value small"></div>
				</div>

				<div class="summary-divider"></div>

				<div class="summary-section">
					<div class="summary-label">Allergies</div>
					<div id="sum-allergies" class="summary-value alert-text"></div>
				</div>
				<div class="summary-section">
					<div class="summary-label">Active Medications</div>
					<div id="sum-meds" class="summary-value small"></div>
				</div>
				<div class="summary-section">
					<div class="summary-label">Recent Diagnoses</div>
					<div id="sum-diagnoses" class="summary-value small"></div>
				</div>

				<div class="summary-divider"></div>

				<div class="summary-section">
					<div class="summary-label">Fee Validity</div>
					<div id="sum-fee-validity" class="summary-value"></div>
				</div>
				<div class="summary-section">
					<div class="summary-label">Prior Lab Results</div>
					<div id="sum-lab-results" class="summary-value small"></div>
				</div>

			</div>
		</div>

	</div>

	<style>
		.clinic-workspace { font-family: var(--font-stack); }
		.ws-section { margin-bottom:16px; }
		.ws-section-title { font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;padding:4px 0; }
		.ws-collapsible:hover { color:var(--text-color); }
		.summary-section { margin-bottom:10px; }
		.summary-label { font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px; }
		.summary-value { font-size:13px;color:var(--text-color); }
		.summary-value.small { font-size:12px; }
		.summary-value.mono { font-family:var(--mono-font);font-weight:600; }
		.summary-value.alert-text { color:var(--red);font-weight:500; }
		.summary-divider { border-top:1px solid var(--border-color);margin:12px 0; }
		.queue-item { padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--border-color);transition:background .1s; }
		.queue-item:hover { background:var(--bg-color); }
		.queue-item.is-active { background:var(--primary-light);border-left:3px solid var(--primary); }
		.queue-item.is-emergency { border-left:3px solid var(--red); }
		.queue-badge { display:inline-block;font-size:10px;padding:2px 6px;border-radius:10px;font-weight:500;margin-top:3px; }
		.badge-emergency { background:var(--red-light);color:var(--red); }
		.badge-prebooked { background:var(--blue-light);color:var(--blue); }
		.badge-walkin { background:var(--green-light);color:var(--green); }
		.badge-followup { background:var(--orange-light);color:var(--orange); }
		.dx-tag { background:var(--blue-light);color:var(--blue);border-radius:12px;padding:2px 8px;font-size:12px;display:inline-flex;align-items:center;gap:4px; }
		.dx-tag-remove { cursor:pointer;font-weight:700;opacity:.6; }
		.dx-tag-remove:hover { opacity:1; }
		#ws-dx-dropdown { position:absolute;z-index:1000;background:var(--modal-bg,#fff);border:1px solid var(--border-color);border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,.12);max-height:220px;overflow-y:auto;min-width:260px;top:100%;left:0; }
		.dx-option { padding:8px 12px;cursor:pointer;font-size:13px; }
		.dx-option:hover { background:var(--bg-color); }
	</style>
	`;
}


// ── Workspace Controller ───────────────────────────────────────────────────
class DoctorWorkspace {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.state = {
			queue_session: null,
			current_entry: null,
			current_encounter: null,
			diagnosis_list: [],
			session_paused: false,
		};
		this._queue_poll = null;
		this._autocomplete_ready = false;

		this._init();
	}

	async _init() {
		// Step 1: try to restore from localStorage (survives page reloads)
		const stored = localStorage.getItem('clinic_flow_session');
		if (stored) {
			try {
				const cached = JSON.parse(stored);
				const v = await frappe.call({
					method: 'clinic_flow.api.queue.get_session',
					args: { queue_session: cached.name },
				});
				if (v.message) {
					this._activate_session(v.message.name, v.message.session_name);
					return;
				}
			} catch (_) {}
			localStorage.removeItem('clinic_flow_session');
		}

		// Step 2: check server for a session linked to this user's practitioner
		try {
			const r = await frappe.call({
				method: 'clinic_flow.api.queue.get_active_session_for_user',
			});
			if (r.message) {
				this._activate_session(r.message.name, r.message.session_name);
				return;
			}
		} catch (_) {}

		// Step 3: no session found — show start prompt
		this._show_start_session_prompt();
	}

	_activate_session(session_name, label) {
		this.state.queue_session = session_name;
		$('#ws-session-label').text(label || session_name);
		localStorage.setItem('clinic_flow_session', JSON.stringify({ name: session_name }));
		this._load_queue();
		this._bind_events();
		this._subscribe_realtime();

		// Polling fallback — refreshes queue every 15 s in case realtime misses an event
		if (this._queue_poll) clearInterval(this._queue_poll);
		this._queue_poll = setInterval(() => this._load_queue(), 15000);
	}

	_show_start_session_prompt() {
		$('#ws-session-label').text('No session today');
		$('#ws-empty-state').html(`
			<div style="font-size:32px;margin-bottom:12px;">📋</div>
			<div style="font-size:15px;font-weight:500;">No active session for today</div>
			<div style="font-size:13px;margin-top:4px;color:var(--text-muted);">Start a session to begin seeing patients</div>
			<button class="btn btn-primary btn-sm" style="margin-top:16px;" id="ws-btn-start-session">
				Start Consultation Session
			</button>
		`);

		$('#ws-btn-start-session').on('click', async () => {
			const res = await frappe.call({
				method: 'clinic_flow.api.queue.get_today_schedules',
			});

			if (!res.message?.practitioner) {
				frappe.msgprint({
					title: 'Account not linked',
					message: 'Your account is not linked to a Healthcare Practitioner. Please contact the administrator.',
					indicator: 'red',
				});
				return;
			}

			this._open_session_dialog(res.message.practitioner_name, res.message.schedules);
		});
	}

	_open_session_dialog(practitioner_name, schedules) {
		let selectedSchedule = null;
		let isUnscheduled = false;

		/* ── Format HH:MM:SS → "6:00 PM" ── */
		function fmtTime(t) {
			if (!t) return '';
			const parts = String(t).split(':');
			let h = parseInt(parts[0]), m = parts[1] || '00';
			const ampm = h >= 12 ? 'PM' : 'AM';
			h = h % 12 || 12;
			return `${h}:${m} ${ampm}`;
		}

		/* ── Schedule cards ── */
		const cardStyles = `
			border:2px solid var(--border-color);border-radius:6px;
			padding:12px 16px;margin-bottom:8px;cursor:pointer;
			transition:border-color .15s,background .15s;
		`;
		const scheduleCards = schedules.length
			? schedules.map((s, i) => {
				const unit = s.service_unit ? s.service_unit.replace(/\s*-\s*[A-Z]+$/, '') : '';
				return `<div class="cf-sched-card" data-idx="${i}" style="${cardStyles}">
					<div style="display:flex;justify-content:space-between;align-items:center;">
						<div>
							<div style="font-weight:600;font-size:14px;">${s.schedule}</div>
							<div style="font-size:12px;color:var(--text-muted);margin-top:3px;">
								${fmtTime(s.from_time)} – ${fmtTime(s.to_time)}
								${unit ? ` &middot; ${unit}` : ''}
							</div>
						</div>
						<div style="font-size:13px;font-weight:500;color:var(--text-muted);">
							${s.capacity || '—'} slots
						</div>
					</div>
				</div>`;
			}).join('')
			: `<div style="color:var(--text-muted);font-size:13px;padding:6px 0 10px;">
				No scheduled sessions for today.
			   </div>`;

		const dialogBody = `
			<div style="padding:4px 0;">
				<div style="font-size:11px;font-weight:600;color:var(--text-muted);
					text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">
					Today's Schedules
				</div>
				${scheduleCards}

				<div style="display:flex;align-items:center;gap:8px;margin:14px 0;">
					<div style="flex:1;height:1px;background:var(--border-color);"></div>
					<span style="font-size:11px;color:var(--text-muted);">or</span>
					<div style="flex:1;height:1px;background:var(--border-color);"></div>
				</div>

				<button class="btn btn-default btn-sm" id="cf-toggle-unscheduled" style="width:100%;">
					+ Start Unscheduled Session
				</button>
				<div id="cf-unscheduled-form" style="display:none;margin-top:12px;
					padding:12px;background:var(--bg-color);border-radius:6px;border:1px solid var(--border-color);">
					<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
						<div>
							<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Start Time</div>
							<input type="time" id="cf-start-time" class="form-control form-control-sm" value="08:00">
						</div>
						<div>
							<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">End Time</div>
							<input type="time" id="cf-end-time" class="form-control form-control-sm" value="14:00">
						</div>
						<div>
							<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Max Patients</div>
							<input type="number" id="cf-capacity" class="form-control form-control-sm" value="20" min="1" max="500">
						</div>
					</div>
				</div>
			</div>
		`;

		const d = new frappe.ui.Dialog({
			title: 'Start Consultation Session',
			fields: [{ fieldtype: 'HTML', fieldname: 'body', options: dialogBody }],
			primary_action_label: 'Start Session',
			primary_action: async () => {
				if (!selectedSchedule && !isUnscheduled) {
					frappe.show_alert({ message: 'Select a schedule or choose unscheduled.', indicator: 'orange' });
					return;
				}
				const args = {};
				if (selectedSchedule) {
					args.schedule  = selectedSchedule.schedule;
					args.from_time = String(selectedSchedule.from_time);
					args.to_time   = String(selectedSchedule.to_time);
				} else {
					args.from_time = ($('#cf-start-time').val() || '08:00') + ':00';
					args.to_time   = ($('#cf-end-time').val()   || '14:00') + ':00';
					args.capacity  = parseInt($('#cf-capacity').val()) || 20;
				}
				d.hide();
				const r = await frappe.call({
					method: 'clinic_flow.api.queue.start_session',
					args,
				});
				if (r.message) {
					$('#ws-empty-state').html(`
						<div style="font-size:36px;margin-bottom:12px;">🩺</div>
						<div style="font-size:15px;font-weight:500;">No active patient</div>
						<div style="font-size:13px;margin-top:4px;">Click "Call Next" to begin</div>
					`);
					this._activate_session(r.message.session, r.message.session_name);
					frappe.show_alert({ message: 'Consultation session started', indicator: 'green' });
				}
			},
		});

		d.show();

		/* ── Bind interactions after dialog renders ── */
		setTimeout(() => {
			$('.cf-sched-card').on('click', function() {
				const idx = parseInt($(this).data('idx'));
				selectedSchedule = schedules[idx];
				isUnscheduled = false;

				$('.cf-sched-card').css({ borderColor: 'var(--border-color)', background: '' });
				$(this).css({ borderColor: 'var(--primary)', background: 'var(--primary-light)' });

				$('#cf-unscheduled-form').hide();
				$('#cf-toggle-unscheduled').text('+ Start Unscheduled Session');
			});

			$('#cf-toggle-unscheduled').on('click', function() {
				isUnscheduled = !isUnscheduled;
				selectedSchedule = null;
				if (isUnscheduled) {
					$('#cf-unscheduled-form').show();
					$(this).text('✕ Cancel');
					$('.cf-sched-card').css({ borderColor: 'var(--border-color)', background: '' });
				} else {
					$('#cf-unscheduled-form').hide();
					$(this).text('+ Start Unscheduled Session');
				}
			});

			/* Auto-select when there is exactly one schedule */
			if (schedules.length === 1) {
				$('.cf-sched-card').first().trigger('click');
			}
		}, 200);
	}

	_bind_events() {
		const self = this;

		$('#ws-btn-call-next').on('click', () => self._call_next());
		$('#ws-btn-recall').on('click', () => self._recall());
		$('#ws-btn-skip').on('click', () => self._skip());
		$('#ws-btn-save-draft').on('click', () => self._save_draft());
		$('#ws-btn-submit').on('click', () => self._submit_encounter());
		$('#ws-btn-pause').on('click', () => self._pause_session());
		$('#ws-btn-resume').on('click', () => self._resume_session());
		$('#ws-btn-end-session').on('click', () => self._end_session());

		// Section toggle — delegate from document so it works regardless of page eval scope
		$(document).on('click.ws', '.ws-collapsible', function() {
			const id = $(this).data('section');
			const section = $(`#ws-section-${id}`);
			section.toggle();
			$(this).find('.section-toggle').text(section.is(':visible') ? '▾' : '▸');
		});

		// Add-row buttons
		$(document).on('click.ws', '[data-action="add-drug"]', () => self._add_drug_row());
		$(document).on('click.ws', '[data-action="add-lab"]',  () => self._add_lab_row());

		// Remove individual drug / lab rows
		$(document).on('click.ws', '[data-action="remove-drug"]', function() {
			$(this).closest('.drug-row').remove();
		});
		$(document).on('click.ws', '[data-action="remove-lab"]', function() {
			$(this).closest('.lab-row').remove();
		});

		// Diagnosis tag removal
		$(document).on('click.ws', '.dx-tag-remove', function() {
			const idx = parseInt($(this).data('idx'));
			self.state.diagnosis_list.splice(idx, 1);
			self._render_diagnosis_tags();
		});

		// Close diagnosis dropdown when clicking outside
		$(document).on('click.ws-dx', (e) => {
			if (!$(e.target).closest('#ws-diagnosis-wrapper').length) {
				$('#ws-dx-dropdown').remove();
			}
		});
	}

	async _pause_session() {
		const r = await frappe.call({
			method: 'clinic_flow.api.queue.pause_session',
			args: { queue_session: this.state.queue_session },
		});
		if (r.message?.status === 'paused') {
			this.state.session_paused = true;
			$('#ws-btn-pause').hide();
			$('#ws-btn-call-next').prop('disabled', true);
			$('#ws-session-status-bar').show();
			frappe.show_alert({ message: 'Session paused. Queue display updated.', indicator: 'orange' });
		}
	}

	async _resume_session() {
		const r = await frappe.call({
			method: 'clinic_flow.api.queue.resume_session',
			args: { queue_session: this.state.queue_session },
		});
		if (r.message?.status === 'active') {
			this.state.session_paused = false;
			$('#ws-btn-pause').show();
			$('#ws-btn-call-next').prop('disabled', false);
			$('#ws-session-status-bar').hide();
			frappe.show_alert({ message: 'Session resumed.', indicator: 'green' });
		}
	}

	async _end_session() {
		const waiting_count = $('#ws-queue-list .queue-item').length;
		const msg = waiting_count > 0
			? `There are ${waiting_count} patients still waiting. End session and mark them as No Show?`
			: 'End this session?';

		frappe.confirm(msg, async () => {
			const r = await frappe.call({
				method: 'clinic_flow.api.queue.end_session',
				args: { queue_session: this.state.queue_session, no_show_waiting: 1 },
			});
			if (r.message?.status === 'completed') {
				localStorage.removeItem('clinic_flow_session');
				const others = r.message.other_sessions || [];
				if (others.length > 0) {
					this._offer_reroute(others);
				} else {
					frappe.msgprint('Session ended.');
					this._reset_workspace();
				}
			}
		});
	}

	_offer_reroute(other_sessions) {
		const options = other_sessions.map(s =>
			`<option value="${s.name}">${s.session_name} — Dr. ${s.practitioner} (${s.dept_abbr})</option>`
		).join('');

		frappe.msgprint({
			title: 'Session Ended',
			message: `
				<p>Session ended. Do you want to reroute the waiting patients to another active session?</p>
				<select id="reroute-select" class="form-control" style="margin-top:8px;">${options}</select>
				<button class="btn btn-primary btn-sm" style="margin-top:8px;" id="reroute-confirm">Reroute Patients</button>
				<button class="btn btn-default btn-sm" style="margin-top:8px;margin-left:4px;" id="reroute-skip">No, skip</button>
			`,
			wide: true,
		});

		setTimeout(() => {
			$('#reroute-confirm').on('click', async () => {
				const to = $('#reroute-select').val();
				if (to) {
					await frappe.call({
						method: 'clinic_flow.api.queue.reroute_patients',
						args: { from_session: this.state.queue_session, to_session: to },
					});
					frappe.show_alert('Patients rerouted.', 4);
				}
				frappe.hide_msgprint();
				this._reset_workspace();
			});
			$('#reroute-skip').on('click', () => {
				frappe.hide_msgprint();
				this._reset_workspace();
			});
		}, 300);
	}

	_reset_workspace() {
		if (this._queue_poll) {
			clearInterval(this._queue_poll);
			this._queue_poll = null;
		}
		this.state = {
			queue_session: null,
			current_entry: null,
			current_encounter: null,
			diagnosis_list: [],
			session_paused: false,
		};
		$('#ws-session-label').text('No session today');
		$('#ws-empty-state').html(`
			<div style="font-size:32px;margin-bottom:12px;">📋</div>
			<div style="font-size:15px;font-weight:500;">Session ended</div>
			<div style="font-size:13px;margin-top:4px;color:var(--text-muted);">Start a new session to continue</div>
		`);
		$('#ws-session-status-bar').hide();
		$('#ws-btn-pause').show();
		$('#ws-btn-call-next').prop('disabled', false);
		this._show_start_session_prompt();
	}

	_subscribe_realtime() {
		const self = this;
		frappe.realtime.on('queue_update', (data) => {
			self._render_queue(data.next_tokens, data.current_token);
		});
	}

	async _load_queue() {
		const r = await frappe.call({
			method: 'clinic_flow.api.queue.get_queue_state',
			args: { queue_session: this.state.queue_session },
		});
		if (r.message) {
			this._render_queue(r.message.waiting, r.message.session?.current_token);
		}
	}

	_render_queue(waiting, current_token) {
		const container = $('#ws-queue-list');
		container.empty();

		if (!waiting || !waiting.length) {
			container.html('<div style="padding:16px;color:var(--text-muted);font-size:13px;text-align:center;">Queue is empty</div>');
			return;
		}

		waiting.forEach((entry, idx) => {
			const badge_class = {
				'EMERGENCY': 'badge-emergency',
				'PRE_BOOKED': 'badge-prebooked',
				'WALK_IN': 'badge-walkin',
				'FOLLOW_UP': 'badge-followup',
			}[entry.queue_type] || 'badge-walkin';

			const type_label = {
				'EMERGENCY': 'Emergency',
				'PRE_BOOKED': 'Pre-booked',
				'WALK_IN': 'Walk-in',
				'FOLLOW_UP': 'Follow-up',
			}[entry.queue_type] || entry.queue_type;

			const is_active = entry.token === current_token;
			const is_emergency = entry.queue_type === 'EMERGENCY';

			container.append(`
				<div class="queue-item ${is_active ? 'is-active' : ''} ${is_emergency ? 'is-emergency' : ''}">
					<div style="display:flex;justify-content:space-between;align-items:center;">
						<div style="font-weight:600;font-size:14px;font-family:var(--mono-font);">${entry.token}</div>
						<div style="font-size:12px;color:var(--text-muted);">#${idx + 1}</div>
					</div>
					<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${entry.patient_name || ''}</div>
					<span class="queue-badge ${badge_class}">${type_label}</span>
				</div>
			`);
		});
	}

	async _call_next() {
		const btn = $('#ws-btn-call-next');
		btn.prop('disabled', true).text('Calling...');

		try {
			const r = await frappe.call({
				method: 'clinic_flow.api.queue.call_next',
				args: { queue_session: this.state.queue_session },
			});

			const payload = r.message;
			if (payload.status === 'empty') {
				frappe.show_alert({ message: 'Queue is empty', indicator: 'blue' });
				return;
			}
			if (payload.status === 'paused') {
				frappe.show_alert({ message: payload.message, indicator: 'orange' });
				return;
			}

			this.state.current_entry = payload.queue_entry;
			this.state.current_encounter = payload.encounter;
			this.state.diagnosis_list = [];

			this._render_patient_banner(payload);
			this._render_encounter_editor(payload.encounter);
			this._render_patient_summary(payload.patient_summary);
			this._set_buttons_active();
			this._load_queue();

		} catch (e) {
			frappe.show_alert({ message: 'Failed to call next patient', indicator: 'red' });
		} finally {
			btn.prop('disabled', false).text('Call Next');
		}
	}

	async _recall() {
		if (!this.state.current_entry) return;
		await frappe.call({
			method: 'clinic_flow.api.queue.recall_patient',
			args: { queue_entry: this.state.current_entry.name },
		});
		frappe.show_alert({ message: 'Patient recalled on display', indicator: 'green' });
	}

	async _skip() {
		if (!this.state.current_entry) return;
		const result = await frappe.confirm('Skip this patient? They will not be re-queued automatically.');
		if (!result) return;

		const r = await frappe.call({
			method: 'clinic_flow.api.queue.skip_patient',
			args: { queue_entry: this.state.current_entry.name },
		});

		if (r.message && r.message.status !== 'empty') {
			this.state.current_entry = r.message.queue_entry;
			this.state.current_encounter = r.message.encounter;
			this._render_patient_banner(r.message);
			this._render_encounter_editor(r.message.encounter);
			this._render_patient_summary(r.message.patient_summary);
		}
	}

	async _save_draft() {
		if (!this.state.current_encounter) return;

		const data = this._collect_encounter_data();
		const btn = $('#ws-btn-save-draft');
		btn.prop('disabled', true).text('Saving...');

		try {
			await frappe.call({
				method: 'clinic_flow.api.workspace.save_encounter_draft',
				args: {
					encounter: this.state.current_encounter.name,
					data: JSON.stringify(data),
				},
			});
			frappe.show_alert({ message: 'Draft saved', indicator: 'green' });
		} catch (e) {
			frappe.show_alert({ message: 'Save failed', indicator: 'red' });
		} finally {
			btn.prop('disabled', false).text('Save Draft');
		}
	}

	async _submit_encounter() {
		if (!this.state.current_encounter) return;

		// Save draft first
		await this._save_draft();

		const confirmed = await frappe.confirm('Submit this encounter? This cannot be undone.');
		if (!confirmed) return;

		const btn = $('#ws-btn-submit');
		btn.prop('disabled', true).text('Submitting...');

		try {
			await frappe.call({
				method: 'clinic_flow.api.workspace.submit_encounter',
				args: { encounter: this.state.current_encounter.name },
			});

			frappe.show_alert({ message: 'Encounter submitted', indicator: 'green' });
			this._reset_workspace();

		} catch (e) {
			frappe.show_alert({ message: 'Submit failed', indicator: 'red' });
		} finally {
			btn.prop('disabled', false).text('Submit Encounter');
		}
	}

	_collect_encounter_data() {
		return {
			symptoms: $('#ws-symptoms').val(),
			patient_note: $('#ws-patient-note').val(),
			diagnosis: this.state.diagnosis_list,
			drug_prescription: this._collect_drug_rows(),
			lab_test_prescription: this._collect_lab_rows(),
		};
	}

	_collect_drug_rows() {
		const rows = [];
		$('#ws-drug-rows .drug-row').each(function() {
			rows.push({
				drug_name:   $(this).find('.drug-name').val(),
				dosage:      $(this).find('.drug-dosage').val(),
				period:      $(this).find('.drug-period').val(),
				dosage_form: $(this).find('.drug-form').val(),
			});
		});
		return rows.filter(r => r.drug_name);
	}

	_collect_lab_rows() {
		const rows = [];
		$('#ws-lab-rows .lab-row').each(function() {
			rows.push({ lab_test_name: $(this).find('.lab-test-name').val() });
		});
		return rows.filter(r => r.lab_test_name);
	}

	_render_patient_banner(payload) {
		const entry = payload.queue_entry;
		const summary = payload.patient_summary;
		const demo = summary?.demographics || {};

		$('#ws-patient-banner').show();
		$('#ws-empty-state').hide();

		$('#ws-token-badge').text(entry.token);
		$('#ws-patient-name').text(demo.patient_name || entry.patient_name || '');
		$('#ws-patient-meta').text(`${demo.age || '?'} yrs · ${demo.sex || '?'} · ${demo.blood_group || ''}`);

		const type_colors = {
			'EMERGENCY': '#dc3545',
			'PRE_BOOKED': '#0d6efd',
			'WALK_IN':    '#198754',
			'FOLLOW_UP':  '#fd7e14',
		};
		const type_labels = {
			'EMERGENCY': 'Emergency',
			'PRE_BOOKED': 'Pre-booked',
			'WALK_IN':    'Walk-in',
			'FOLLOW_UP':  'Follow-up',
		};
		const color = type_colors[entry.queue_type] || '#6c757d';
		$('#ws-queue-type-badge')
			.text(type_labels[entry.queue_type] || entry.queue_type)
			.css({ background: color + '20', color: color, border: `1px solid ${color}40` });
	}

	_render_encounter_editor(encounter) {
		$('#ws-encounter-editor').show();

		if (!encounter) return;

		$('#ws-symptoms').val(encounter.symptoms || '');
		$('#ws-patient-note').val(encounter.patient_note || '');

		// Restore diagnosis tags from saved encounter
		this.state.diagnosis_list = (encounter.diagnosis || [])
			.map(d => ({ diagnosis: d.diagnosis }))
			.filter(d => d.diagnosis);
		this._render_diagnosis_tags();

		// Render medication and lab rows
		this._render_drug_rows(encounter.drug_prescription || []);
		this._render_lab_rows(encounter.lab_test_prescription || []);

		// Wire up autocomplete (once per session)
		if (!this._autocomplete_ready) {
			this._setup_diagnosis_autocomplete();
			this._setup_complaint_autocomplete();
			this._autocomplete_ready = true;
		}
	}

	_render_drug_rows(rows) {
		$('#ws-drug-rows').empty();
		rows.forEach(row => this._add_drug_row(row));
	}

	_render_lab_rows(rows) {
		$('#ws-lab-rows').empty();
		rows.forEach(row => this._add_lab_row(row));
	}

	_add_drug_row(data = {}) {
		$('#ws-drug-rows').append(`
			<div class="drug-row" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:6px;margin-bottom:6px;align-items:center;">
				<input class="form-control form-control-sm drug-name"   placeholder="Drug name"  value="${data.drug_name   || ''}">
				<input class="form-control form-control-sm drug-dosage" placeholder="Dosage"     value="${data.dosage      || ''}">
				<input class="form-control form-control-sm drug-period" placeholder="Duration"   value="${data.period      || ''}">
				<input class="form-control form-control-sm drug-form"   placeholder="Form"       value="${data.dosage_form || ''}">
				<button class="btn btn-xs btn-danger" data-action="remove-drug">✕</button>
			</div>
		`);
	}

	_add_lab_row(data = {}) {
		$('#ws-lab-rows').append(`
			<div class="lab-row" style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">
				<input class="form-control form-control-sm lab-test-name" placeholder="Observation Template / Test name" value="${data.lab_test_name || ''}" list="ws-obs-list">
				<button class="btn btn-xs btn-danger" data-action="remove-lab">✕</button>
			</div>
		`);
	}

	// ── Diagnosis autocomplete ────────────────────────────────────────────────

	_render_diagnosis_tags() {
		const container = $('#ws-diagnosis-tags');
		container.empty();
		this.state.diagnosis_list.forEach((dx, idx) => {
			container.append(`
				<span class="dx-tag">
					${frappe.utils.escape_html(dx.diagnosis)}
					<span class="dx-tag-remove" data-idx="${idx}" title="Remove">×</span>
				</span>
			`);
		});
	}

	_setup_diagnosis_autocomplete() {
		const self = this;

		$('#ws-diagnosis-input').on('keyup', frappe.utils.debounce(async function(e) {
			if (e.key === 'Escape') {
				$('#ws-dx-dropdown').remove();
				return;
			}
			if (e.key === 'Enter') return; // handled by click

			const q = $(this).val().trim();
			if (q.length < 2) {
				$('#ws-dx-dropdown').remove();
				return;
			}

			const r = await frappe.call({
				method: 'frappe.desk.search.search_link',
				args: {
					txt: q,
					doctype: 'Diagnosis',
					ignore_user_permissions: 1,
					reference_doctype: 'Patient Encounter Diagnosis',
				},
			});

			$('#ws-dx-dropdown').remove();
			const results = (r.message || []).slice(0, 8);
			if (!results.length) return;

			const dropdown = $('<div id="ws-dx-dropdown"></div>');
			results.forEach(item => {
				const val = item.value || item;
				const desc = item.description
					? `<span style="color:var(--text-muted);font-size:11px;margin-left:6px;">${item.description}</span>`
					: '';
				const row = $(`<div class="dx-option">${frappe.utils.escape_html(val)}${desc}</div>`);
				row.on('click', () => {
					if (!self.state.diagnosis_list.find(d => d.diagnosis === val)) {
						self.state.diagnosis_list.push({ diagnosis: val });
						self._render_diagnosis_tags();
					}
					$('#ws-diagnosis-input').val('');
					$('#ws-dx-dropdown').remove();
				});
				dropdown.append(row);
			});
			$('#ws-diagnosis-input').after(dropdown);
		}, 300));
	}

	// ── Complaint autocomplete (datalist for the symptoms textarea) ───────────

	async _setup_complaint_autocomplete() {
		try {
			const r = await frappe.call({
				method: 'frappe.client.get_list',
				args: { doctype: 'Complaint', fields: ['name'], limit: 200 },
			});
			const items = r.message || [];
			if (!items.length) return;

			const dl = $('#ws-complaint-list');
			dl.empty();
			items.forEach(c => {
				if (c.name) dl.append(`<option value="${frappe.utils.escape_html(c.name)}">`);
			});
		} catch (_) {
			// Complaint doctype not available — silently skip
		}
	}

	// ── Patient summary ───────────────────────────────────────────────────────

	_render_patient_summary(summary) {
		if (!summary) return;

		$('#ws-summary-empty').hide();
		$('#ws-summary-content').show();

		const entry = this.state.current_entry;
		const demo = summary.demographics || {};
		const vitals = summary.vitals || {};

		$('#sum-token').text(entry?.token || '—');
		$('#sum-queue-type').text(entry?.queue_type?.replace('_', ' ') || '—');
		$('#sum-age-sex').text(`${demo.age || '?'} yrs · ${demo.sex || '?'}`);

		const vitals_str = vitals.bp_systolic
			? `BP: ${vitals.bp_systolic}/${vitals.bp_diastolic} · Pulse: ${vitals.pulse} · Temp: ${vitals.temperature}°C`
			: 'No vitals recorded today';
		$('#sum-vitals').text(vitals_str);

		const allergies = summary.allergies || [];
		$('#sum-allergies').text(
			allergies.length ? allergies.map(a => a.allergy).join(', ') : 'None recorded'
		);
		if (allergies.length) {
			$('#sum-allergies').addClass('alert-text');
		}

		const meds = summary.active_medications || [];
		$('#sum-meds').html(
			meds.length
				? meds.map(m => `<div>• ${m.drug_name} ${m.dosage || ''}</div>`).join('')
				: '<div>None</div>'
		);

		const dx = summary.recent_diagnoses || [];
		$('#sum-diagnoses').html(
			dx.slice(0, 5).map(d => `<div>• ${d.diagnosis}</div>`).join('') || '<div>None</div>'
		);

		const fv = summary.fee_validity || {};
		$('#sum-fee-validity').text(
			fv.has_validity
				? `Valid till ${fv.valid_till} · ${fv.visits_remaining} visits remaining`
				: 'No active validity'
		);

		const labs = summary.recent_lab_results || [];
		$('#sum-lab-results').html(
			labs.length
				? labs.map(l => `<div>• ${l.name} (${l.result_date || ''})</div>`).join('')
				: '<div>None</div>'
		);
	}

	_set_buttons_active() {
		$('#ws-btn-recall').prop('disabled', false);
		$('#ws-btn-skip').prop('disabled', false);
		$('#ws-btn-save-draft').prop('disabled', false);
		$('#ws-btn-submit').prop('disabled', false);
	}
}

// ── Observation Template datalist (shared, loaded once) ───────────────────
// Populated lazily when the first lab row is added via the add-lab handler.
(function _load_obs_templates() {
	frappe.call({
		method: 'frappe.client.get_list',
		args: { doctype: 'Observation Template', fields: ['name'], limit: 500 },
	}).then(r => {
		const items = (r && r.message) || [];
		if (!items.length) return;
		let dl = document.getElementById('ws-obs-list');
		if (!dl) {
			dl = document.createElement('datalist');
			dl.id = 'ws-obs-list';
			document.body.appendChild(dl);
		}
		items.forEach(t => {
			const opt = document.createElement('option');
			opt.value = t.name;
			dl.appendChild(opt);
		});
	}).catch(() => {});
}());
