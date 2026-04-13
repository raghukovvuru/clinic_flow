// Receptionist Dashboard — v2
// Phase 4: Shell + Left Panel (Admission Flow)
// Phase 5: Token Board (center panel) — placeholder
// Phase 6: Live Session Panel (right panel) — placeholder

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

/* typography helpers */
.rd-label {
	font-size: 10px; font-weight: 700; color: var(--text-muted);
	text-transform: uppercase; letter-spacing: 1px;
}
.rd-caption { font-size: 11px; color: var(--text-muted); }

/* channel tab pills */
.rd-channel-btn {
	padding: 6px 18px; border: none; background: transparent;
	font-size: 12px; font-weight: 600; cursor: pointer;
	color: var(--text-muted); border-bottom: 2px solid transparent;
	transition: all .15s;
}
.rd-channel-btn.active { color: var(--primary); border-bottom-color: var(--primary); }

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
	<div style="display:grid;grid-template-columns:380px 1fr 340px;flex:1;overflow:hidden;min-height:0;">

		<!-- LEFT: Admission Panel ─────────────────────────────────────────── -->
		<div id="rd-left"
			style="display:flex;flex-direction:column;overflow:hidden;
				border-right:1px solid var(--border-color);">

			<!-- Left header -->
			<div style="padding:10px 16px;border-bottom:1px solid var(--border-color);flex-shrink:0;">
				<div class="rd-label" style="margin-bottom:8px;">Admit Patient</div>
				<!-- Channel tabs -->
				<div id="rd-channels" style="display:flex;border-bottom:2px solid var(--border-color);">
					<button class="rd-channel-btn active" data-channel="walkin">Walk-in</button>
					<button class="rd-channel-btn" data-channel="phone">Phone</button>
					<button class="rd-channel-btn" data-channel="vip">VIP</button>
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
			<div id="rd-admission-body" style="flex:1;overflow-y:auto;padding:14px 16px;"></div>
		</div>

		<!-- CENTER: Token Board (Phase 5 placeholder) ───────────────────── -->
		<div id="rd-center"
			style="display:flex;flex-direction:column;overflow:hidden;
				border-right:1px solid var(--border-color);">
			<div style="padding:10px 16px;border-bottom:1px solid var(--border-color);flex-shrink:0;">
				<span class="rd-label">Token Board</span>
			</div>
			<div id="rd-token-board"
				style="flex:1;overflow-y:auto;padding:16px;
					display:flex;align-items:center;justify-content:center;">
				<div style="text-align:center;color:var(--text-muted);">
					<div style="font-size:14px;font-weight:600;margin-bottom:6px;">
						Token Board
					</div>
					<div style="font-size:12px;">Available in Phase 5</div>
				</div>
			</div>
		</div>

		<!-- RIGHT: Live Session Panel (Phase 6 placeholder) ──────────────── -->
		<div id="rd-right" style="display:flex;flex-direction:column;overflow:hidden;">
			<div style="padding:10px 16px;border-bottom:1px solid var(--border-color);flex-shrink:0;">
				<span class="rd-label">Live Session</span>
			</div>
			<div id="rd-live-panel"
				style="flex:1;overflow-y:auto;padding:16px;
					display:flex;align-items:center;justify-content:center;">
				<div style="text-align:center;color:var(--text-muted);">
					<div style="font-size:14px;font-weight:600;margin-bottom:6px;">
						Live Session Panel
					</div>
					<div style="font-size:12px;">Available in Phase 6</div>
				</div>
			</div>
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
			step:         'search',    // search | guardian_found | guardian_not_found |
			                           // register | child_selected | session_offered | confirmed
			channel:      'walkin',    // walkin | phone | vip
			mobile:       '',
			guardian:     null,        // {name, guardian_name, mobile, relationship, notes}
			children:     [],          // [{patient, patient_name, dob, age_display}]
			child:        null,        // selected child object
			visit_type:   null,        // result from get_visit_type
			sessions:     [],          // result from get_suggested_sessions
			session_idx:  0,           // which session in the list is being offered
			booking:      null,        // result from confirm_booking
		};

		this._bind_channel_tabs();
		this.load_top_bar();
		this.render_admission();

		// Refresh top bar every 60 seconds
		this._topbar_timer = setInterval(() => this.load_top_bar(), 60000);
	}

	// ── Top bar ──────────────────────────────────────────────────────────────
	load_top_bar() {
		const today = frappe.datetime.get_today();
		this.$topdate.text(frappe.datetime.str_to_user(today, true));

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
			},
		});
	}

	// ── Channel tabs ─────────────────────────────────────────────────────────
	_bind_channel_tabs() {
		this.$channels.on('click', '.rd-channel-btn', (e) => {
			const $btn = $(e.currentTarget);
			this.$channels.find('.rd-channel-btn').removeClass('active');
			$btn.addClass('active');
			this.state.channel = $btn.data('channel');
			// Reset to search step when channel changes
			this._reset_to_search();
		});
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

	// ── Main render dispatcher ───────────────────────────────────────────────
	render_admission() {
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

	// ── Step: Search ─────────────────────────────────────────────────────────
	_render_search() {
		this.$body.html(`
			<div>
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
				this.state.child = child;
				this.state.visit_type = r.message;
				this.state.step = 'child_selected';
				this.render_admission();
			},
		});
	}

	_render_child_selected() {
		const c  = this.state.child;
		const vt = this.state.visit_type;
		const g  = this.state.guardian;

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
					${is_review ? `
					<span class="rd-caption" style="margin-left:6px;">
						${vt.past_visits_90d} visit${vt.past_visits_90d === 1 ? '' : 's'} in last 90 days
					</span>` : ''}
				</div>

				<div class="rd-caption" style="margin-bottom:12px;">
					Channel: <strong>${frappe.utils.escape_html(this.state.channel)}</strong>
					&nbsp;·&nbsp;Load class: <strong>${frappe.utils.escape_html(vt.load_class)}</strong>
				</div>

				<button id="rd-find-slot-btn" class="rd-btn-primary">
					Find Next Suitable Slot →
				</button>
			</div>
		`);

		this.$body.find('#rd-back-guardian').on('click', () => {
			this.state.step = 'guardian_found';
			this.render_admission();
		});

		this.$body.find('#rd-find-slot-btn').on('click', () => this._do_find_slot());
	}

	_do_find_slot() {
		this.$body.find('#rd-find-slot-btn').prop('disabled', true)
			.html('<span class="rd-spinner"></span> Finding…');

		frappe.call({
			method: 'clinic_flow.api.admission.get_suggested_sessions',
			args: {
				load_class: this.state.visit_type.load_class,
				channel:    this.state.channel,
				from_date:  frappe.datetime.get_today(),
			},
			callback: (r) => {
				if (!r.message || !r.message.length) {
					this.$body.html(`
						<div class="rd-card" style="border-color:#f87171;">
							<div style="color:#dc2626;font-weight:600;margin-bottom:4px;">No sessions available</div>
							<div class="rd-caption">
								No open sessions found for
								<strong>${frappe.utils.escape_html(this.state.visit_type.load_class)}</strong>
								via <strong>${frappe.utils.escape_html(this.state.channel)}</strong>.
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

				this.state.sessions   = r.message;
				this.state.session_idx = 0;
				this.state.step = 'session_offered';
				this.render_admission();
			},
		});
	}

	// ── Step: Session Offered ─────────────────────────────────────────────────
	_render_session_offered() {
		const sessions    = this.state.sessions;
		const idx         = this.state.session_idx;
		const s           = sessions[idx];
		const has_next    = idx < sessions.length - 1;
		const has_prev    = idx > 0;

		const load_pct = Math.round((s.load_ratio || 0) * 100);
		const load_bar_color = load_pct < 50 ? '#16a34a' : load_pct < 80 ? '#d97706' : '#dc2626';

		this.$body.html(`
			<div>
				<div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;">
					<button id="rd-back-child2" class="rd-btn-secondary" style="font-size:11px;">← Child</button>
					<span class="rd-label">Session ${idx + 1} of ${sessions.length}</span>
				</div>

				<!-- Session offer card -->
				<div class="rd-session-card">
					<div style="font-size:15px;font-weight:700;margin-bottom:4px;">
						${frappe.utils.escape_html(s.session_name)}
					</div>
					<div class="rd-caption" style="margin-bottom:10px;">
						${frappe.utils.escape_html(s.session_date)}
						&nbsp;·&nbsp;${frappe.utils.escape_html(s.start_time)} – ${frappe.utils.escape_html(s.end_time)}
						${s.dept_abbr ? '&nbsp;·&nbsp;' + frappe.utils.escape_html(s.dept_abbr) : ''}
					</div>

					<!-- Load bar -->
					<div class="rd-label" style="margin-bottom:4px;">Session Load</div>
					<div style="height:6px;border-radius:3px;background:var(--border-color);
						margin-bottom:10px;overflow:hidden;">
						<div style="height:100%;border-radius:3px;width:${load_pct}%;
							background:${load_bar_color};transition:width .4s;"></div>
					</div>

					<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
						<div class="rd-card" style="padding:8px 10px;margin-bottom:0;">
							<div class="rd-label">Available</div>
							<div style="font-size:18px;font-weight:700;color:var(--primary);">
								${s.available_slots}
							</div>
						</div>
						<div class="rd-card" style="padding:8px 10px;margin-bottom:0;">
							<div class="rd-label">Total Booked</div>
							<div style="font-size:18px;font-weight:700;">
								${s.total_booked}
							</div>
						</div>
					</div>

					<div class="rd-caption" style="margin-bottom:10px;">
						Review: ${s.review_load_count}
						&nbsp;·&nbsp;New: ${s.non_review_load_count}
					</div>

					<button id="rd-confirm-btn" class="rd-btn-primary">
						Confirm Booking
					</button>
				</div>

				<!-- Navigation -->
				<div style="display:flex;gap:8px;margin-top:8px;">
					${has_prev ? `<button id="rd-prev-session" class="rd-btn-secondary" style="flex:1;">
						← Previous Session
					</button>` : '<div style="flex:1;"></div>'}
					${has_next ? `<button id="rd-next-session" class="rd-btn-secondary" style="flex:1;">
						Next Session →
					</button>` : ''}
				</div>
			</div>
		`);

		this.$body.find('#rd-back-child2').on('click', () => {
			this.state.step = 'child_selected';
			this.render_admission();
		});
		this.$body.find('#rd-confirm-btn').on('click', () => this._do_confirm_booking(s));
		this.$body.find('#rd-prev-session').on('click', () => {
			this.state.session_idx--;
			this.render_admission();
		});
		this.$body.find('#rd-next-session').on('click', () => {
			this.state.session_idx++;
			this.render_admission();
		});
	}

	// ── Confirm booking ──────────────────────────────────────────────────────
	_do_confirm_booking(session) {
		const $btn = this.$body.find('#rd-confirm-btn').prop('disabled', true)
			.html('<span class="rd-spinner"></span> Confirming…');

		frappe.call({
			method: 'clinic_flow.api.admission.confirm_booking',
			args: {
				queue_session: session.queue_session,
				patient:       this.state.child.patient,
				channel:       this.state.channel,
				load_class:    this.state.visit_type.load_class,
				guardian:      this.state.guardian.name,
			},
			callback: (r) => {
				if (!r.message) return;
				this.state.booking = r.message;
				this.state.step = 'confirmed';
				this.render_admission();
				this.load_top_bar();
			},
			error: () => {
				$btn.prop('disabled', false).text('Confirm Booking');
			},
		});
	}

	// ── Step: Confirmed ───────────────────────────────────────────────────────
	_render_confirmed() {
		const b   = this.state.booking;
		const c   = this.state.child;
		const g   = this.state.guardian;
		const s   = this.state.sessions[this.state.session_idx];

		const report_time = b.report_by_time
			? frappe.datetime.str_to_user(b.report_by_time, true)
			: '—';
		const pred_time   = b.predicted_doctor_time
			? frappe.datetime.str_to_user(b.predicted_doctor_time, true)
			: '—';

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

					<div style="margin-bottom:6px;font-size:13px;">
						<strong>${frappe.utils.escape_html(c.patient_name || c.patient)}</strong>
					</div>
					<div class="rd-caption" style="margin-bottom:10px;">
						${frappe.utils.escape_html(g.guardian_name)} · ${frappe.utils.escape_html(g.mobile)}
					</div>

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
		this.$body.find('#rd-new-booking-btn').on('click', () => this._reset_to_search());
	}

	// ── Print slip ────────────────────────────────────────────────────────────
	_print_slip() {
		const b = this.state.booking;
		const c = this.state.child;
		const g = this.state.guardian;
		const s = this.state.sessions[this.state.session_idx];

		const report_time = b.report_by_time
			? frappe.datetime.str_to_user(b.report_by_time, true) : '—';
		const pred_time = b.predicted_doctor_time
			? frappe.datetime.str_to_user(b.predicted_doctor_time, true) : '—';

		const win = window.open('', '_blank',
			'width=420,height=520,toolbar=0,menubar=0,scrollbars=0');
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
			<div class="val">${frappe.utils.escape_html(c.patient_name || c.patient)}</div>
			<div class="cap">${frappe.utils.escape_html(g.guardian_name)} · ${frappe.utils.escape_html(g.mobile)}</div>
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
			step:         'search',
			channel:      this.state.channel,
			mobile:       '',
			guardian:     null,
			children:     [],
			child:        null,
			visit_type:   null,
			sessions:     [],
			session_idx:  0,
			booking:      null,
		};
		this.render_admission();
	}
}
