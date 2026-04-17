frappe.pages['doctor-workspace-v2'].on_page_load = function(wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Doctor Workspace V2',
		single_column: true,
	});
	$(wrapper).find('.page-content').html(get_workspace_v2_html());
	new DoctorWorkspaceV2(wrapper);
};

function get_workspace_v2_html() {
	return `
	<div class="dw2-root">
		<div class="dw2-topbar">
			<div class="dw2-top-identity">
				<div class="dw2-token-chip">
					<div class="dw2-token-label">Token</div>
					<div class="dw2-token-rail" id="dw2-token-value">--</div>
				</div>
				<div class="dw2-patient-rail">
					<div class="dw2-brand">Clinic Flow</div>
					<div class="dw2-patient-name-rail" id="dw2-patient-name">No active patient</div>
					<div class="dw2-patient-meta-rail" id="dw2-patient-meta">Age · Sex · Weight</div>
				</div>
			</div>
			<div class="dw2-top-center">
				<div class="dw2-session-label" id="dw2-session-label">No active session</div>
				<div class="dw2-queue-preview" id="dw2-queue-preview">Ready queue will appear here</div>
			</div>
			<div class="dw2-top-alerts">
				<div class="dw2-alerts" id="dw2-alerts">No active alerts</div>
			</div>
			<div class="dw2-top-right">
				<button class="dw2-btn dw2-btn-primary" id="dw2-btn-call-next">Call Next</button>
				<button class="dw2-btn dw2-btn-secondary" id="dw2-btn-call-special" disabled>Call Next Special</button>
				<button class="dw2-btn dw2-btn-secondary" id="dw2-btn-save" disabled>Save Draft</button>
				<button class="dw2-btn dw2-btn-accent" id="dw2-btn-complete" disabled>Complete Visit</button>
			</div>
		</div>

		<div class="dw2-body">
			<div class="dw2-main">
				<div id="dw2-empty-state" class="dw2-empty">
					<div class="dw2-empty-kicker">V2 Preview</div>
					<div class="dw2-empty-title">No active patient</div>
					<div class="dw2-empty-copy">
						This workspace is the new paper-prescription-style shell.
						The current doctor workspace remains unchanged while V2 is built.
					</div>
				</div>

				<div id="dw2-patient-shell" class="dw2-patient-shell" style="display:none;">
					<div class="dw2-sheet-wrap">
						<div class="dw2-sheet-panel">
							<div class="dw2-sheet-head">
								<div>
									<div class="dw2-sheet-title">Consultation Sheet</div>
									<div class="dw2-sheet-subtitle">Assistant drafts, doctor reviews, doctor completes</div>
								</div>
								<div class="dw2-sheet-status" id="dw2-sheet-status">Draft</div>
							</div>
							<div class="dw2-plan-strip" id="dw2-plan-strip" style="display:none;"></div>
							<div class="dw2-main-grid">
								<div class="dw2-dual-grid">
									<div class="dw2-section">
										<div class="dw2-section-label">Chief Complaints</div>
										<div class="dw2-editor-box">
											<div class="dw2-chip-zone" id="dw2-complaints">No complaints entered</div>
											<div class="dw2-inline-entry">
												<input id="dw2-complaint-input" class="dw2-input" placeholder="Type complaint and press Enter">
												<div id="dw2-complaint-dropdown" class="dw2-lookup-dropdown" style="display:none;"></div>
											</div>
										</div>
									</div>
									<div class="dw2-section">
										<div class="dw2-section-label">Diagnosis</div>
										<div class="dw2-editor-box">
											<div class="dw2-chip-zone" id="dw2-diagnosis">No diagnosis entered</div>
											<div class="dw2-inline-entry">
												<input id="dw2-diagnosis-input" class="dw2-input" placeholder="Type diagnosis and press Enter">
												<div id="dw2-diagnosis-dropdown" class="dw2-lookup-dropdown" style="display:none;"></div>
											</div>
										</div>
									</div>
								</div>
								<div class="dw2-section dw2-section-rx">
									<div class="dw2-section-head">
										<div class="dw2-section-label">Prescription</div>
										<div class="dw2-section-actions">
											<button id="dw2-repeat-all-rx" class="dw2-mini-btn dw2-mini-btn-ghost" style="display:none;">Repeat previous Rx</button>
											<button id="dw2-add-rx" class="dw2-mini-btn">Add medicine</button>
										</div>
									</div>
									<div id="dw2-rx-suggestions" class="dw2-rx-suggestions" style="display:none;"></div>
									<div class="dw2-rx-list" id="dw2-rx-list">
										<div class="dw2-rx-empty">No medicines added</div>
									</div>
								</div>
								<div class="dw2-bottom-grid">
									<div class="dw2-section">
										<div class="dw2-section-head">
											<div class="dw2-section-label">Tests</div>
											<button id="dw2-add-test" class="dw2-mini-btn">Add test</button>
										</div>
										<div class="dw2-test-list" id="dw2-tests">No tests ordered</div>
									</div>
									<div class="dw2-section">
										<div class="dw2-section-label">Advice & Follow-up</div>
										<textarea id="dw2-advice-input" class="dw2-textarea" placeholder="Advice, review timing, warning signs..."></textarea>
									</div>
								</div>
							</div>
						</div>

						<div class="dw2-sidepanel">
							<div class="dw2-side-card">
								<div class="dw2-side-label">Previous Prescription</div>
								<div id="dw2-previous-rx" class="dw2-side-body">Recent medicines will appear here</div>
							</div>
							<div class="dw2-side-card">
								<div class="dw2-side-label">Recent History</div>
								<div id="dw2-history" class="dw2-side-body">History snapshot will appear here</div>
							</div>
							<div class="dw2-side-card">
								<div class="dw2-side-label">Vitals Snapshot</div>
								<div id="dw2-vitals" class="dw2-side-body">Latest vitals will appear here</div>
							</div>
							<div class="dw2-side-card">
								<div class="dw2-side-label">Ready Queue</div>
								<div id="dw2-ready-queue" class="dw2-side-body">No ready patients</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
	<datalist id="dw2-med-list"></datalist>
	<datalist id="dw2-test-list"></datalist>

	<style>
	.dw2-root {
		height: calc(100vh - 60px);
		display: flex;
		flex-direction: column;
		background: linear-gradient(180deg, #eef2f1 0%, #e8eeeb 100%);
		color: #14201c;
		font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
	}
	.dw2-topbar {
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) minmax(220px, 0.9fr) minmax(180px, 0.8fr) auto;
		gap: 12px;
		align-items: center;
		padding: 8px 14px;
		background: rgba(247, 248, 246, 0.96);
		border-bottom: 1px solid rgba(20, 32, 28, 0.08);
		backdrop-filter: blur(10px);
		position: sticky;
		top: 0;
		z-index: 10;
	}
	.dw2-brand {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: #5f6b66;
	}
	.dw2-top-identity {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.dw2-token-chip {
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 8px 10px;
		min-width: 70px;
		border-radius: 14px;
		background: #fffdf8;
		border: 1px solid rgba(20, 32, 28, 0.08);
	}
	.dw2-token-rail {
		font-size: 28px;
		font-weight: 700;
		line-height: 1;
		color: #0f5c4d;
	}
	.dw2-patient-rail {
		min-width: 0;
	}
	.dw2-patient-name-rail {
		font-size: 22px;
		font-weight: 700;
		color: #14201c;
		line-height: 1.15;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.dw2-patient-meta-rail {
		font-size: 13px;
		color: #5f6b66;
		margin-top: 2px;
	}
	.dw2-session-label {
		font-size: 12px;
		font-weight: 700;
		color: #14201c;
		margin-bottom: 2px;
	}
	.dw2-queue-preview {
		font-size: 12px;
		color: #5f6b66;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.dw2-top-alerts {
		min-width: 0;
	}
	.dw2-top-right {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	.dw2-btn {
		border-radius: 999px;
		padding: 8px 14px;
		font-size: 12px;
		font-weight: 700;
		border: 1px solid transparent;
		cursor: pointer;
	}
	.dw2-btn:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.dw2-btn-primary {
		background: #0f5c4d;
		color: #f8fafc;
	}
	.dw2-btn-secondary {
		background: #fffdf8;
		color: #485550;
		border-color: rgba(20, 32, 28, 0.12);
	}
	.dw2-btn-accent {
		background: #9a3412;
		color: #fffaf0;
	}
	.dw2-body {
		flex: 1;
		min-height: 0;
		padding: 10px 12px 12px;
	}
	.dw2-main {
		height: 100%;
	}
	.dw2-empty {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 24px;
		border: 1px dashed rgba(120, 113, 108, 0.4);
		border-radius: 28px;
		background: rgba(255, 252, 245, 0.78);
	}
	.dw2-empty-kicker {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: #0f766e;
		margin-bottom: 12px;
		font-weight: 700;
	}
	.dw2-empty-title {
		font-size: 34px;
		font-weight: 700;
		color: #111827;
		margin-bottom: 8px;
	}
	.dw2-empty-copy {
		max-width: 560px;
		font-size: 16px;
		line-height: 1.6;
		color: #6b7280;
	}
	.dw2-patient-shell {
		height: 100%;
	}
	.dw2-token-label,
	.dw2-section-label,
	.dw2-side-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: #5f6b66;
		font-weight: 700;
	}
	.dw2-alerts,
	.dw2-sheet-subtitle,
	.dw2-side-body,
	.dw2-plain-block,
	.dw2-chip-zone {
		font-size: 13px;
		line-height: 1.45;
		color: #5f6b66;
	}
	.dw2-alerts { min-width: 0; }
	.dw2-sheet-wrap {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 300px;
		gap: 12px;
	}
	.dw2-sheet-panel {
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding: 12px;
		background: #fffdf8;
		border-radius: 18px;
		border: 1px solid rgba(20, 32, 28, 0.08);
		box-shadow: 0 10px 24px rgba(20, 32, 28, 0.06);
	}
	.dw2-sheet-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 10px;
		padding-bottom: 10px;
		border-bottom: 1px solid rgba(20, 32, 28, 0.08);
	}
	.dw2-sheet-title {
		font-size: 22px;
		font-weight: 700;
		color: #14201c;
	}
	.dw2-sheet-status {
		padding: 6px 10px;
		border-radius: 999px;
		font-size: 11px;
		font-weight: 700;
		color: #92400e;
		background: #fef3c7;
	}
		.dw2-main-grid {
			flex: 1;
			min-height: 0;
			display: grid;
			grid-template-rows: auto minmax(0, 1fr) auto;
			gap: 10px;
		}
		.dw2-plan-strip {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			margin-bottom: 10px;
			padding-bottom: 10px;
			border-bottom: 1px solid rgba(20, 32, 28, 0.08);
		}
		.dw2-plan-chip {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			padding: 7px 10px;
			border-radius: 12px;
			background: #f0fdf4;
			border: 1px solid rgba(22, 163, 74, 0.12);
			font-size: 11px;
			color: #14532d;
		}
		.dw2-plan-chip button {
			border: none;
			background: #0f5c4d;
			color: #f8fafc;
			border-radius: 999px;
			padding: 4px 8px;
			font-size: 11px;
			font-weight: 700;
			cursor: pointer;
		}
		.dw2-dual-grid,
		.dw2-bottom-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 10px;
		}
		.dw2-section {
			min-height: 0;
		}
		.dw2-section-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 10px;
			margin-bottom: 6px;
		}
		.dw2-section-actions {
			display: flex;
			gap: 8px;
			flex-wrap: wrap;
		}
		.dw2-editor-box {
			padding: 8px 10px;
			border: 1px solid rgba(20, 32, 28, 0.08);
			border-radius: 14px;
			background: #fbfaf6;
		}
		.dw2-inline-entry {
			margin-top: 8px;
			position: relative;
		}
		.dw2-input,
		.dw2-textarea,
		.dw2-rx-input,
		.dw2-test-input {
			width: 100%;
			border: 1px solid rgba(20, 32, 28, 0.1);
			border-radius: 10px;
			padding: 8px 10px;
			background: #ffffff;
			font-size: 13px;
			color: #14201c;
			font-family: inherit;
		}
		.dw2-input:focus,
		.dw2-textarea:focus,
		.dw2-rx-input:focus,
		.dw2-test-input:focus {
			outline: none;
			border-color: #0f766e;
			box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.08);
		}
		.dw2-textarea {
			min-height: 132px;
			resize: vertical;
		}
		.dw2-mini-btn {
			border: 1px solid rgba(15, 92, 77, 0.12);
			background: #f0fdfa;
			color: #0f5c4d;
			border-radius: 999px;
			padding: 5px 9px;
			font-size: 11px;
			font-weight: 700;
			cursor: pointer;
		}
		.dw2-mini-btn-ghost {
			background: #fff7ed;
			color: #9a3412;
			border-color: rgba(154, 52, 18, 0.12);
		}
		.dw2-lookup-dropdown {
			position: absolute;
			top: calc(100% + 6px);
			left: 0;
			right: 0;
			z-index: 20;
			border: 1px solid rgba(120, 113, 108, 0.18);
			border-radius: 16px;
			background: rgba(255, 252, 246, 0.98);
			box-shadow: 0 18px 40px rgba(120, 113, 108, 0.16);
			padding: 6px;
		}
		.dw2-lookup-item {
			padding: 10px 12px;
			border-radius: 12px;
			cursor: pointer;
			color: #111827;
			font-size: 14px;
		}
		.dw2-lookup-item:hover {
			background: #ecfdf5;
		}
		.dw2-lookup-sub {
			display: block;
			margin-top: 2px;
			font-size: 12px;
			color: #6b7280;
		}
		.dw2-pill {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			margin: 0 6px 6px 0;
			padding: 3px 9px;
			border-radius: 999px;
			background: #eff6ff;
			color: #1d4ed8;
			font-size: 11px;
			font-weight: 700;
		}
		.dw2-pill-remove {
			cursor: pointer;
			color: #1e3a8a;
		}
		.dw2-rx-list {
			display: flex;
			flex-direction: column;
			gap: 8px;
			margin-top: 8px;
		}
		.dw2-rx-suggestions {
			display: flex;
			flex-wrap: wrap;
			gap: 6px;
			margin: 8px 0 2px;
		}
		.dw2-rx-suggestion {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			padding: 6px 9px;
			border-radius: 12px;
			border: 1px solid rgba(14, 116, 144, 0.14);
			background: rgba(240, 249, 255, 0.88);
			color: #0f172a;
			font-size: 11px;
		}
		.dw2-rx-suggestion button {
			border: none;
			background: #0f766e;
			color: #f8fafc;
			border-radius: 999px;
			padding: 4px 8px;
			font-size: 11px;
			font-weight: 700;
			cursor: pointer;
		}
		.dw2-rx-row,
		.dw2-test-row {
			display: grid;
			gap: 6px;
			padding: 6px 0;
			border-bottom: 1px dashed rgba(20, 32, 28, 0.08);
		}
		.dw2-rx-row {
			grid-template-columns: minmax(0, 1.3fr) minmax(0, 1.2fr) 1fr 1fr 1fr 1.1fr auto;
			align-items: center;
		}
		.dw2-rx-med-wrap {
			position: relative;
		}
		.dw2-rx-lookup {
			position: absolute;
			top: calc(100% + 6px);
			left: 0;
			right: 0;
			z-index: 25;
			border: 1px solid rgba(120, 113, 108, 0.18);
			border-radius: 14px;
			background: rgba(255, 252, 246, 0.98);
			box-shadow: 0 18px 40px rgba(120, 113, 108, 0.16);
			padding: 6px;
		}
		.dw2-rx-lookup-item {
			padding: 10px 12px;
			border-radius: 10px;
			cursor: pointer;
			font-size: 13px;
			color: #111827;
		}
		.dw2-rx-lookup-item:hover {
			background: #ecfdf5;
		}
		.dw2-test-row {
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
		}
		.dw2-row-remove {
			border: none;
			background: transparent;
			color: #b91c1c;
			font-size: 18px;
			cursor: pointer;
			padding: 0 6px;
		}
		.dw2-rx-empty {
			padding: 8px 0;
			font-size: 13px;
			color: #9ca3af;
		}
		.dw2-side-line {
			padding: 6px 0;
			border-bottom: 1px solid rgba(120,113,108,0.1);
		}
		.dw2-side-line:last-child {
			border-bottom: none;
		}
		.dw2-side-line-title {
			font-weight: 700;
			color: #111827;
		}
		.dw2-side-line-sub {
			font-size: 12px;
			color: #6b7280;
		}
		.dw2-side-line-action {
			margin-top: 6px;
			border: none;
			background: #ecfdf5;
			color: #065f46;
			border-radius: 999px;
			padding: 4px 8px;
			font-size: 11px;
			font-weight: 700;
			cursor: pointer;
		}
		.dw2-test-list {
			display: flex;
			flex-direction: column;
			gap: 8px;
		}
	.dw2-sidepanel {
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.dw2-side-card {
		padding: 10px 12px;
		border-radius: 16px;
		background: #f7f6f2;
		border: 1px solid rgba(20, 32, 28, 0.08);
	}
	@media (max-width: 1200px) {
		.dw2-topbar {
			grid-template-columns: 1fr;
		}
		.dw2-top-right {
			justify-content: flex-start;
			flex-wrap: wrap;
		}
		.dw2-dual-grid,
		.dw2-bottom-grid,
		.dw2-sheet-wrap {
			grid-template-columns: 1fr;
		}
	}
	</style>
	`;
}

class DoctorWorkspaceV2 {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.$root = $(wrapper).find('.dw2-root');
		this.$empty = this.$root.find('#dw2-empty-state');
		this.$shell = this.$root.find('#dw2-patient-shell');
		this.state = {
			queue_session: null,
			current_entry: null,
			current_encounter: null,
			session_paused: false,
			complaint_list: [],
			diagnosis_list: [],
			drug_rows: [],
			lab_rows: [],
			previous_drugs: [],
			suggested_plans: [],
			special_ready_count: 0,
		};
		this._queue_poll = null;
		this._complaint_lookup = frappe.utils.debounce((value) => this._lookup_complaints(value), 250);
		this._diagnosis_lookup = frappe.utils.debounce((value) => this._lookup_diagnosis(value), 300);
		this._plan_refresh = frappe.utils.debounce(() => this._load_suggested_plans(), 300);
		this._bind();
		this._init();
	}

	_bind() {
		this.$root.find('#dw2-btn-call-next').on('click', () => this._call_next());
		this.$root.find('#dw2-btn-call-special').on('click', () => this._call_next_special());
		this.$root.find('#dw2-btn-save').on('click', () => this._save_draft());
		this.$root.find('#dw2-btn-complete').on('click', () => this._complete_visit());
		this.$root.find('#dw2-repeat-all-rx').on('click', () => this._repeat_previous_rx());
		this.$root.on('keydown', '#dw2-complaint-input', (e) => this._handle_complaint_keydown(e));
		this.$root.on('keydown', '#dw2-diagnosis-input', (e) => this._handle_diagnosis_keydown(e));
		this.$root.on('input', '#dw2-complaint-input', (e) => this._complaint_lookup(e.target.value));
		this.$root.on('input', '#dw2-diagnosis-input', (e) => this._diagnosis_lookup(e.target.value));
		this.$root.on('input', '#dw2-advice-input', (e) => {
			if (this.state.current_encounter) this.state.current_encounter.patient_note = e.target.value;
		});
		this.$root.on('click', '#dw2-add-rx', () => {
			this.state.drug_rows.push({ drug_name: '', dosage: '', period: '', dosage_form: '' });
			this._render_drug_rows();
		});
		this.$root.on('click', '#dw2-add-test', () => {
			this.state.lab_rows.push({ lab_test_name: '' });
			this._render_lab_rows();
		});
		this.$root.on('click', '.dw2-apply-plan', (e) => this._apply_treatment_plan(e));
		this.$root.on('click', '.dw2-pill-remove', (e) => this._remove_pill(e));
		this.$root.on('mousedown', '.dw2-lookup-item', (e) => this._select_lookup_item(e));
		this.$root.on('input', '.dw2-rx-input', (e) => this._update_drug_row(e));
		this.$root.on('input', '.dw2-rx-input[data-field="drug_name"]', (e) => this._lookup_medication(e));
		this.$root.on('keydown', '.dw2-rx-input[data-field="drug_name"]', (e) => this._handle_medication_keydown(e));
		this.$root.on('keydown', '.dw2-rx-input', (e) => this._handle_rx_keydown(e));
		this.$root.on('mousedown', '.dw2-rx-lookup-item', (e) => this._select_medication(e));
		this.$root.on('input', '.dw2-rx-input[data-field="drug_code"]', (e) => this._update_drug_code(e));
		this.$root.on('click', '.dw2-row-remove[data-kind="rx"]', (e) => this._remove_drug_row(e));
		this.$root.on('input', '.dw2-test-input', (e) => this._update_test_row(e));
		this.$root.on('keydown', '.dw2-test-input', (e) => this._handle_test_keydown(e));
		this.$root.on('click', '.dw2-row-remove[data-kind="test"]', (e) => this._remove_test_row(e));
		this.$root.on('click', '.dw2-add-suggested-rx', (e) => this._add_suggested_rx(e));
		this.$root.on('click', '.dw2-repeat-single-rx', (e) => this._repeat_single_rx(e));
		$(document).on('mousedown.dw2', (e) => {
			if (!$(e.target).closest('.dw2-inline-entry').length) {
				this.$root.find('.dw2-lookup-dropdown').hide().empty();
			}
			if (!$(e.target).closest('.dw2-rx-med-wrap').length) {
				this.$root.find('.dw2-rx-lookup').hide().empty();
			}
		});
		$(document).on('keydown.dw2', (e) => this._handle_global_shortcuts(e));
	}

	async _init() {
		const stored = localStorage.getItem('clinic_flow_session');
		if (stored) {
			try {
				const cached = JSON.parse(stored);
				const v = await frappe.call({
					method: 'clinic_flow.api.queue.get_session',
					args: { queue_session: cached.name },
				});
				if (v.message) {
					this._activate_session(v.message);
					return;
				}
			} catch (_) {}
			localStorage.removeItem('clinic_flow_session');
		}

		try {
			const r = await frappe.call({ method: 'clinic_flow.api.queue.get_active_session_for_user' });
			if (r.message) {
				this._activate_session(r.message);
				return;
			}
		} catch (_) {}

		this._show_no_session_state();
	}

	_activate_session(session) {
		this.state.queue_session = session.name;
		this.state.session_paused = session.status === 'Paused';
		this.$root.find('#dw2-session-label').text(session.session_name || session.name);
		localStorage.setItem('clinic_flow_session', JSON.stringify({ name: session.name }));
		this._set_action_state();
		this._ensure_reference_data();
		this._load_queue();
		this._subscribe_realtime();
		if (this._queue_poll) clearInterval(this._queue_poll);
		this._queue_poll = setInterval(() => this._load_queue(), 15000);
	}

	_subscribe_realtime() {
		if (this._subscribed) return;
		this._subscribed = true;
		frappe.realtime.on('queue_update', (data) => {
			if (!this.state.queue_session) return;
			this._render_queue_preview(data.next_tokens || []);
		});
	}

	_show_no_session_state() {
		this.$root.find('#dw2-session-label').text('No active session');
		this.$root.find('#dw2-queue-preview').text('Start or restore a session in the current doctor workspace.');
		this.$root.find('#dw2-ready-queue').text('No ready patients');
		this._set_action_state();
	}

	_set_action_state() {
		const has_session = !!this.state.queue_session;
		const has_patient = !!this.state.current_encounter;
		this.$root.find('#dw2-btn-call-next').prop('disabled', !has_session || this.state.session_paused);
		this.$root.find('#dw2-btn-call-special').prop('disabled', !has_session || this.state.session_paused || !this.state.special_ready_count);
		this.$root.find('#dw2-btn-save').prop('disabled', !has_patient);
		this.$root.find('#dw2-btn-complete').prop('disabled', !has_patient);
	}

	async _load_queue() {
		if (!this.state.queue_session) return;
		const r = await frappe.call({
			method: 'clinic_flow.api.queue.get_queue_state',
			args: { queue_session: this.state.queue_session },
		});
		if (!r.message) return;

		this.state.session_paused = r.message.session?.status === 'Paused';
		this.state.special_ready_count = Number(r.message.special_ready_count || 0);
		this._set_action_state();
		this._render_queue_preview(r.message.waiting || []);

		if (r.message.current) {
			await this._restore_current_patient(r.message.current);
			this.$root.find('#dw2-queue-preview').text(
				`With doctor: ${r.message.current.token || ''} · ${r.message.current.patient_name || ''}`
			);
		} else if ((r.message.waiting || []).length) {
			this.$root.find('#dw2-queue-preview').text(
				`${r.message.waiting.length} patients lined up for consultation`
			);
		} else {
			this.$root.find('#dw2-queue-preview').text('Ready queue empty');
		}
	}

	async _restore_current_patient(current) {
		if (!current || !current.name || !current.patient || !current.patient_encounter) return;
		if (this.state.current_entry?.name === current.name && this.state.current_encounter?.name === current.patient_encounter) {
			return;
		}
		try {
			const r = await frappe.call({
				method: 'clinic_flow.api.workspace.get_workspace_payload',
				args: {
					patient: current.patient,
					encounter: current.patient_encounter,
					queue_entry: current.name,
				},
			});
			if (!r.message) return;
			this.state.current_entry = r.message.queue_entry;
			this.state.current_encounter = r.message.encounter;
			this._render_patient(r.message);
			this._set_action_state();
		} catch (_) {}
	}

	_render_queue_preview(waiting) {
		const preview = waiting.length
			? waiting.slice(0, 5).map((row) => `${row.token} ${row.patient_name || ''}${row.priority === 'special' ? ' [Special]' : ''}`.trim()).join('  •  ')
			: 'Ready queue empty';
		this.$root.find('#dw2-queue-preview').text(preview);

		if (!waiting.length) {
			this.$root.find('#dw2-ready-queue').html('<div>No ready patients</div>');
			return;
		}

		const html = waiting.slice(0, 8).map((row, idx) => `
			<div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid rgba(120,113,108,0.12);">
				<div style="min-width:28px;font-weight:700;color:#123f35;">${frappe.utils.escape_html(row.token || String(idx + 1))}</div>
				<div style="min-width:0;">
					<div style="font-weight:700;color:#111827;">${frappe.utils.escape_html(row.patient_name || 'Patient')}</div>
					<div style="font-size:12px;color:#6b7280;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
						<span>${frappe.utils.escape_html(row.queue_type || '')}</span>
						${row.priority === 'special' ? '<span style="padding:2px 6px;border-radius:999px;background:#fff7ed;color:#c2410c;border:1px solid #fdba74;font-weight:700;">Special</span>' : ''}
					</div>
				</div>
			</div>
		`).join('');
		this.$root.find('#dw2-ready-queue').html(html);
	}

	async _call_next() {
		if (!this.state.queue_session) return;
		const $btn = this.$root.find('#dw2-btn-call-next').prop('disabled', true).text('Calling...');
		try {
			const r = await frappe.call({
				method: 'clinic_flow.api.queue.call_next',
				args: { queue_session: this.state.queue_session },
			});
			const payload = r.message;
			if (!payload) return;
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
			this._render_patient(payload);
			this._set_action_state();
			this._load_queue();
		} catch (e) {
			frappe.show_alert({ message: 'Failed to call next patient', indicator: 'red' });
		} finally {
			this.$root.find('#dw2-btn-call-next').text('Call Next');
			this._set_action_state();
		}
	}

	async _call_next_special() {
		if (!this.state.queue_session || !this.state.special_ready_count) return;
		const $btn = this.$root.find('#dw2-btn-call-special').prop('disabled', true).text('Calling...');
		try {
			const r = await frappe.call({
				method: 'clinic_flow.api.queue.call_next_special',
				args: { queue_session: this.state.queue_session },
			});
			const payload = r.message;
			if (!payload) return;
			if (payload.status === 'empty') {
				frappe.show_alert({ message: 'No special patient is ready near doctor', indicator: 'blue' });
				return;
			}
			if (payload.status === 'paused') {
				frappe.show_alert({ message: payload.message, indicator: 'orange' });
				return;
			}

			this.state.current_entry = payload.queue_entry;
			this.state.current_encounter = payload.encounter;
			this._render_patient(payload);
			this._set_action_state();
			this._load_queue();
		} catch (e) {
			frappe.show_alert({ message: 'Failed to call next special patient', indicator: 'red' });
		} finally {
			this.$root.find('#dw2-btn-call-special').text('Call Next Special');
			this._set_action_state();
		}
	}

	_render_patient(payload) {
		const entry = payload.queue_entry || {};
		const encounter = payload.encounter || {};
		const summary = payload.patient_summary || {};
		const demo = summary.demographics || {};
		const vitals = summary.vitals || {};
		const diagnoses = (encounter.diagnosis || []).map((d) => d.diagnosis).filter(Boolean);
		const drugs = encounter.drug_prescription || [];
		const labs = encounter.lab_test_prescription || [];
		const symptoms = (encounter.symptoms || '').split(',').map((s) => s.trim()).filter(Boolean);
		const advice = encounter.patient_note || '';

		this.state.complaint_list = symptoms;
		this.state.diagnosis_list = diagnoses.map((d) => ({ diagnosis: d }));
		this.state.drug_rows = drugs.map((rx) => ({
			drug_code: rx.drug_code || rx.drug_name || rx.medication || '',
			drug_name: rx.drug_name || rx.medication || rx.drug_code || '',
			medication: rx.medication || rx.drug_name || '',
			dosage: rx.dosage || '',
			period: rx.period || rx.duration || '',
			dosage_form: rx.dosage_form || '',
			comment: rx.comment || '',
			item_options: rx.drug_code ? [rx.drug_code] : [],
		}));
		this.state.lab_rows = labs.map((t) => ({ lab_test_name: t.lab_test_name || t.template || '' }));
		this.state.previous_drugs = (summary.active_medications || []).map((rx) => ({
			drug_name: rx.drug_name || rx.medication || '',
			medication: rx.medication || rx.drug_name || '',
			dosage: rx.dosage || '',
			period: rx.period || '',
			dosage_form: rx.dosage_form || '',
			comment: rx.comment || '',
			encounter_date: rx.encounter_date || '',
		}));

		this.$empty.hide();
		this.$shell.show();

		this.$root.find('#dw2-token-value').text(entry.token || '--');
		this.$root.find('#dw2-patient-name').text(demo.patient_name || entry.patient_name || 'Patient');

		const meta = [
			demo.age ? `${demo.age} yrs` : '',
			demo.sex || '',
			vitals.weight ? `${vitals.weight} kg` : '',
		].filter(Boolean).join(' · ');
		this.$root.find('#dw2-patient-meta').text(meta || 'Demographics unavailable');

		const alerts = [];
		if ((summary.allergies || []).length) alerts.push('Allergy noted');
		if (summary.fee_validity?.has_validity) alerts.push(`Fee valid till ${frappe.datetime.str_to_user(summary.fee_validity.valid_till)}`);
		this.$root.find('#dw2-alerts').text(alerts.join(' • ') || 'No active alerts');
		this.$root.find('#dw2-sheet-status').text(encounter.docstatus === 1 ? 'Submitted' : 'Draft');
		this._render_complaints();
		this._render_diagnoses();
		this._render_drug_rows();
		this._render_lab_rows();
		this._render_previous_rx();
		this._load_suggested_plans();
		this.$root.find('#dw2-advice-input').val(advice);

		const dxHtml = (summary.recent_diagnoses || []).slice(0, 6).map((d) => `
			<div style="padding:5px 0;border-bottom:1px solid rgba(120,113,108,0.1);">
				<div style="font-weight:700;color:#111827;">${frappe.utils.escape_html(d.diagnosis || '')}</div>
				<div style="font-size:12px;color:#6b7280;">${frappe.utils.escape_html(String(d.encounter_date || ''))}</div>
			</div>
		`).join('');
		this.$root.find('#dw2-history').html(dxHtml || 'No significant recent history');

		const vitalsItems = [];
		if (vitals.weight) vitalsItems.push(`Weight: ${vitals.weight} kg`);
		if (vitals.temperature) vitalsItems.push(`Temp: ${vitals.temperature}`);
		if (vitals.pulse) vitalsItems.push(`Pulse: ${vitals.pulse}`);
		if (vitals.bp_systolic && vitals.bp_diastolic) vitalsItems.push(`BP: ${vitals.bp_systolic}/${vitals.bp_diastolic}`);
		this.$root.find('#dw2-vitals').html(
			vitalsItems.length
				? vitalsItems.map((item) => `<div style="padding:4px 0;">${frappe.utils.escape_html(item)}</div>`).join('')
				: 'No recent vitals recorded'
		);
	}

	_hydrate_encounter_state(encounter) {
		const diagnoses = (encounter.diagnosis || []).map((d) => d.diagnosis).filter(Boolean);
		const drugs = encounter.drug_prescription || [];
		const labs = encounter.lab_test_prescription || [];
		const symptoms = (encounter.symptoms || '').split(',').map((s) => s.trim()).filter(Boolean);
		this.state.complaint_list = symptoms;
		this.state.diagnosis_list = diagnoses.map((d) => ({ diagnosis: d }));
		this.state.drug_rows = drugs.map((rx) => ({
			drug_code: rx.drug_code || rx.drug_name || rx.medication || '',
			drug_name: rx.drug_name || rx.medication || rx.drug_code || '',
			medication: rx.medication || rx.drug_name || '',
			dosage: rx.dosage || '',
			period: rx.period || rx.duration || '',
			dosage_form: rx.dosage_form || '',
			comment: rx.comment || '',
			item_options: rx.drug_code ? [rx.drug_code] : [],
		}));
		this.state.lab_rows = labs.map((t) => ({ lab_test_name: t.lab_test_name || t.template || '' }));
		this.$root.find('#dw2-sheet-status').text(encounter.docstatus === 1 ? 'Submitted' : 'Draft');
		this._render_complaints();
		this._render_diagnoses();
		this._render_drug_rows();
		this._render_lab_rows();
		this.$root.find('#dw2-advice-input').val(encounter.patient_note || '');
	}

	_collect_data_from_state() {
		const invalidRow = this.state.drug_rows.find((r) => (r.medication || r.drug_name || '').trim() && !(r.drug_code || '').trim());
		if (invalidRow) {
			throw new Error('Select a valid medicine from lookup before saving the prescription.');
		}
		return {
			symptoms: this.state.complaint_list.join(', '),
			patient_note: this.$root.find('#dw2-advice-input').val() || '',
			diagnosis: this.state.diagnosis_list.map((d) => ({ diagnosis: d.diagnosis })),
			drug_prescription: this.state.drug_rows
				.filter((r) => (r.medication || r.drug_code || r.drug_name || '').trim())
				.map((r) => ({
					drug_code: r.drug_code || '',
					drug_name: r.drug_name || r.medication || r.drug_code || '',
					medication: r.medication || '',
					dosage: r.dosage || '',
					period: r.period || '',
					dosage_form: r.dosage_form || '',
					comment: r.comment || '',
				})),
			lab_test_prescription: this.state.lab_rows
				.filter((r) => (r.lab_test_name || '').trim())
				.map((r) => ({ lab_test_name: r.lab_test_name || '' })),
		};
	}

	async _save_draft() {
		if (!this.state.current_encounter) return;
		const $btn = this.$root.find('#dw2-btn-save').prop('disabled', true).text('Saving...');
		try {
			const data = this._collect_data_from_state();
			await frappe.call({
				method: 'clinic_flow.api.workspace.save_encounter_draft',
				args: {
					encounter: this.state.current_encounter.name,
					data: JSON.stringify(data),
				},
			});
			frappe.show_alert({ message: 'Draft saved', indicator: 'green' });
		} catch (e) {
			frappe.show_alert({ message: e.message || 'Save failed', indicator: 'red' });
		} finally {
			this.$root.find('#dw2-btn-save').text('Save Draft');
			this._set_action_state();
		}
	}

	async _complete_visit() {
		if (!this.state.current_encounter) return;
		await this._save_draft();
		const confirmed = await this._confirm_dialog('Complete this visit and submit the encounter?');
		if (!confirmed) return;
		const $btn = this.$root.find('#dw2-btn-complete').prop('disabled', true).text('Completing...');
		try {
			await frappe.call({
				method: 'clinic_flow.api.workspace.submit_encounter',
				args: { encounter: this.state.current_encounter.name },
			});
			frappe.show_alert({ message: 'Visit completed', indicator: 'green' });
			this.state.current_entry = null;
			this.state.current_encounter = null;
			this.$shell.hide();
			this.$empty.show();
			this._set_action_state();
			this._load_queue();
		} catch (e) {
			frappe.show_alert({ message: 'Complete visit failed', indicator: 'red' });
		} finally {
			this.$root.find('#dw2-btn-complete').text('Complete Visit');
			this._set_action_state();
		}
	}

	_render_complaints() {
		const $box = this.$root.find('#dw2-complaints');
		if (!this.state.complaint_list.length) {
			$box.text('No complaints entered');
			return;
		}
		$box.html(this.state.complaint_list.map((item, idx) => `
			<span class="dw2-pill">
				${frappe.utils.escape_html(item)}
				<span class="dw2-pill-remove" data-kind="complaint" data-idx="${idx}">×</span>
			</span>
		`).join(''));
	}

	_render_diagnoses() {
		const $box = this.$root.find('#dw2-diagnosis');
		if (!this.state.diagnosis_list.length) {
			$box.text('No diagnosis entered');
			return;
		}
		$box.html(this.state.diagnosis_list.map((item, idx) => `
			<span class="dw2-pill" style="background:#ecfccb;color:#3f6212;">
				${frappe.utils.escape_html(item.diagnosis)}
				<span class="dw2-pill-remove" style="color:#365314;" data-kind="diagnosis" data-idx="${idx}">×</span>
			</span>
		`).join(''));
	}

	_render_drug_rows() {
		const $list = this.$root.find('#dw2-rx-list');
		if (!this.state.drug_rows.length) {
			$list.html('<div class="dw2-rx-empty">No medicines added</div>');
			this._render_rx_suggestions();
			return;
		}
		$list.html(this.state.drug_rows.map((row, idx) => `
			<div class="dw2-rx-row">
				<div class="dw2-rx-med-wrap">
					<input class="dw2-rx-input" data-idx="${idx}" data-field="drug_name" placeholder="Medication" value="${frappe.utils.escape_html(row.medication || row.drug_name || '')}" autocomplete="off">
					<div class="dw2-rx-lookup" id="dw2-rx-lookup-${idx}" style="display:none;"></div>
				</div>
				<input class="dw2-rx-input" list="dw2-drug-code-list-${idx}" data-idx="${idx}" data-field="drug_code" placeholder="Drug item" value="${frappe.utils.escape_html(row.drug_code || '')}">
				<datalist id="dw2-drug-code-list-${idx}">${(row.item_options || []).map((item) => `<option value="${frappe.utils.escape_html(item)}">`).join('')}</datalist>
				<input class="dw2-rx-input" list="dw2-dosage-list" data-idx="${idx}" data-field="dosage" placeholder="Frequency" value="${frappe.utils.escape_html(row.dosage || '')}">
				<input class="dw2-rx-input" list="dw2-duration-list" data-idx="${idx}" data-field="period" placeholder="Duration" value="${frappe.utils.escape_html(row.period || '')}">
				<input class="dw2-rx-input" list="dw2-form-list" data-idx="${idx}" data-field="dosage_form" placeholder="Form" value="${frappe.utils.escape_html(row.dosage_form || '')}">
				<input class="dw2-rx-input" data-idx="${idx}" data-field="comment" placeholder="Note" value="${frappe.utils.escape_html(row.comment || '')}">
				<button class="dw2-row-remove" data-kind="rx" data-idx="${idx}">×</button>
			</div>
		`).join(''));
		this._render_rx_suggestions();
	}

	_render_lab_rows() {
		const $list = this.$root.find('#dw2-tests');
		if (!this.state.lab_rows.length) {
			$list.html('No tests ordered');
			return;
		}
		$list.html(this.state.lab_rows.map((row, idx) => `
			<div class="dw2-test-row">
				<input class="dw2-test-input" list="dw2-test-list" data-idx="${idx}" placeholder="Test / Observation" value="${frappe.utils.escape_html(row.lab_test_name || '')}">
				<button class="dw2-row-remove" data-kind="test" data-idx="${idx}">×</button>
			</div>
		`).join(''));
	}

	_render_rx_suggestions() {
		const $box = this.$root.find('#dw2-rx-suggestions');
		const rows = (this.state.previous_drugs || []).filter((row) => row.drug_name);
		const actionable = rows.filter((row) => !this.state.drug_rows.find((drug) => (drug.drug_name || '').trim() === (row.drug_name || '').trim()));
		this.$root.find('#dw2-repeat-all-rx').toggle(!!rows.length);
		if (!actionable.length) {
			$box.hide().empty();
			return;
		}
		$box.html(actionable.slice(0, 6).map((row, idx) => `
			<div class="dw2-rx-suggestion">
				<span>${frappe.utils.escape_html([row.drug_name, row.dosage, row.period].filter(Boolean).join(' · '))}</span>
				<button class="dw2-add-suggested-rx" data-idx="${idx}">Add</button>
			</div>
		`).join('')).show();
	}

	_render_previous_rx() {
		const rows = this.state.previous_drugs || [];
		if (!rows.length) {
			this.$root.find('#dw2-previous-rx').html('No recent prescription available');
			this.$root.find('#dw2-repeat-all-rx').hide();
			this.$root.find('#dw2-rx-suggestions').hide().empty();
			return;
		}
		const html = rows.slice(0, 6).map((row, idx) => `
			<div class="dw2-side-line">
				<div class="dw2-side-line-title">${frappe.utils.escape_html(row.drug_name || '')}</div>
				<div class="dw2-side-line-sub">${frappe.utils.escape_html([row.dosage, row.period, row.encounter_date].filter(Boolean).join(' · '))}</div>
				<button class="dw2-side-line-action dw2-repeat-single-rx" data-idx="${idx}">Repeat</button>
			</div>
		`).join('');
		this.$root.find('#dw2-previous-rx').html(html);
		this._render_rx_suggestions();
	}

	_render_suggested_plans() {
		const $strip = this.$root.find('#dw2-plan-strip');
		const plans = this.state.suggested_plans || [];
		if (!plans.length) {
			$strip.hide().empty();
			return;
		}
		$strip.html(plans.map((plan) => `
			<div class="dw2-plan-chip">
				<span>${frappe.utils.escape_html(plan.template_name || plan.name)}</span>
				<button class="dw2-apply-plan" data-plan="${frappe.utils.escape_html(plan.name)}">Apply</button>
			</div>
		`).join('')).show();
	}

	_handle_complaint_keydown(e) {
		if (e.key !== 'Enter' && e.key !== ',') return;
		e.preventDefault();
		const value = $(e.currentTarget).val().replace(/,$/, '').trim();
		if (!value) return;
		if (!this.state.complaint_list.includes(value)) this.state.complaint_list.push(value);
		$(e.currentTarget).val('');
		this.$root.find('#dw2-complaint-dropdown').hide().empty();
		this._render_complaints();
		this._plan_refresh();
	}

	_handle_diagnosis_keydown(e) {
		if (e.key !== 'Enter' && e.key !== ',') return;
		e.preventDefault();
		const value = $(e.currentTarget).val().replace(/,$/, '').trim();
		if (!value) return;
		if (!this.state.diagnosis_list.find((d) => d.diagnosis === value)) {
			this.state.diagnosis_list.push({ diagnosis: value });
		}
		$(e.currentTarget).val('');
		this.$root.find('#dw2-diagnosis-dropdown').hide().empty();
		this._render_diagnoses();
		this._plan_refresh();
	}

	_remove_pill(e) {
		const idx = parseInt($(e.currentTarget).data('idx'), 10);
		const kind = $(e.currentTarget).data('kind');
		if (kind === 'complaint') {
			this.state.complaint_list.splice(idx, 1);
			this._render_complaints();
			this._plan_refresh();
			return;
		}
		if (kind === 'diagnosis') {
			this.state.diagnosis_list.splice(idx, 1);
			this._render_diagnoses();
			this._plan_refresh();
		}
	}

	_update_drug_row(e) {
		const idx = parseInt($(e.currentTarget).data('idx'), 10);
		const field = $(e.currentTarget).data('field');
		if (!this.state.drug_rows[idx]) return;
		this.state.drug_rows[idx][field] = $(e.currentTarget).val();
		if (field === 'drug_name') {
			this.state.drug_rows[idx].drug_code = '';
			this.state.drug_rows[idx].medication = '';
			this.state.drug_rows[idx].item_options = [];
		}
	}

	_update_drug_code(e) {
		const idx = parseInt($(e.currentTarget).data('idx'), 10);
		if (!this.state.drug_rows[idx]) return;
		this.state.drug_rows[idx].drug_code = $(e.currentTarget).val();
	}

	_remove_drug_row(e) {
		const idx = parseInt($(e.currentTarget).data('idx'), 10);
		this.state.drug_rows.splice(idx, 1);
		this._render_drug_rows();
	}

	_update_test_row(e) {
		const idx = parseInt($(e.currentTarget).data('idx'), 10);
		if (!this.state.lab_rows[idx]) return;
		this.state.lab_rows[idx].lab_test_name = $(e.currentTarget).val();
	}

	_remove_test_row(e) {
		const idx = parseInt($(e.currentTarget).data('idx'), 10);
		this.state.lab_rows.splice(idx, 1);
		this._render_lab_rows();
	}

	_handle_rx_keydown(e) {
		if ($(e.currentTarget).data('field') === 'drug_name' && (e.key === 'ArrowDown' || e.key === 'Enter')) {
			const idx = parseInt($(e.currentTarget).data('idx'), 10);
			const $first = this.$root.find(`#dw2-rx-lookup-${idx} .dw2-rx-lookup-item`).first();
			if ($first.length && e.key === 'ArrowDown') {
				e.preventDefault();
				$first.trigger('focus');
				return;
			}
		}
		if (e.key !== 'Enter') return;
		e.preventDefault();
		const idx = parseInt($(e.currentTarget).data('idx'), 10);
		const field = String($(e.currentTarget).data('field') || '');
		const order = ['drug_name', 'drug_code', 'dosage', 'period', 'dosage_form', 'comment'];
		const fieldIdx = order.indexOf(field);
		if (fieldIdx === -1) return;
		if (fieldIdx < order.length - 1) {
			this.$root.find(`.dw2-rx-input[data-idx="${idx}"][data-field="${order[fieldIdx + 1]}"]`).trigger('focus');
			return;
		}
		if (idx === this.state.drug_rows.length - 1) {
			this.state.drug_rows.push({ drug_name: '', medication: '', drug_code: '', dosage: '', period: '', dosage_form: '', comment: '', item_options: [] });
			this._render_drug_rows();
		}
		this.$root.find(`.dw2-rx-input[data-idx="${idx + 1}"][data-field="drug_name"]`).trigger('focus');
	}

	_handle_test_keydown(e) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		const idx = parseInt($(e.currentTarget).data('idx'), 10);
		if (idx === this.state.lab_rows.length - 1) {
			this.state.lab_rows.push({ lab_test_name: '' });
			this._render_lab_rows();
		}
		this.$root.find(`.dw2-test-input[data-idx="${idx + 1}"]`).trigger('focus');
	}

	async _lookup_medication(e) {
		const $input = $(e.currentTarget);
		const idx = parseInt($input.data('idx'), 10);
		const value = ($input.val() || '').trim();
		const $dropdown = this.$root.find(`#dw2-rx-lookup-${idx}`);
		if (value.length < 2) {
			$dropdown.hide().empty();
			return;
		}
		try {
			const r = await frappe.call({
				method: 'frappe.desk.search.search_link',
				args: { txt: value, doctype: 'Medication', ignore_user_permissions: 1 },
			});
			const items = (r.message || []).slice(0, 8);
			if (!items.length) {
				$dropdown.hide().empty();
				return;
			}
			$dropdown.html(items.map((row) => {
				const linkValue = row.value || row;
				const desc = row.description || '';
				return `
					<div class="dw2-rx-lookup-item" tabindex="0" data-idx="${idx}" data-value="${frappe.utils.escape_html(linkValue)}">
						${frappe.utils.escape_html(linkValue)}
						${desc ? `<span class="dw2-lookup-sub">${frappe.utils.escape_html(desc)}</span>` : ''}
					</div>
				`;
			}).join('')).show();
		} catch (_) {
			$dropdown.hide().empty();
		}
	}

	_handle_medication_keydown(e) {
		if (e.key === 'Escape') {
			const idx = parseInt($(e.currentTarget).data('idx'), 10);
			this.$root.find(`#dw2-rx-lookup-${idx}`).hide().empty();
		}
	}

	_select_medication(e) {
		e.preventDefault();
		const $item = $(e.currentTarget);
		const idx = parseInt($item.data('idx'), 10);
		const value = String($item.data('value') || '').trim();
		if (!value || !this.state.drug_rows[idx]) return;
		this.state.drug_rows[idx].drug_code = '';
		this.state.drug_rows[idx].medication = value;
		this.state.drug_rows[idx].drug_name = value;
		this.state.drug_rows[idx].item_options = [];
		this.$root.find(`.dw2-rx-input[data-idx="${idx}"][data-field="drug_name"]`).val(value);
		this.$root.find(`#dw2-rx-lookup-${idx}`).hide().empty();
		this._resolve_medication_item(idx, value);
	}

	async _resolve_medication_item(idx, medication) {
		if (!this.state.drug_rows[idx] || !medication) return;
		try {
			const r = await frappe.call({
				method: 'healthcare.healthcare.doctype.patient_encounter.patient_encounter.get_medications',
				args: { medication },
			});
			const items = (r.message || []).map((row) => row.item).filter(Boolean);
			this.state.drug_rows[idx].item_options = items;
			if (items.length === 1) {
				this.state.drug_rows[idx].drug_code = items[0];
			} else if (!items.includes(this.state.drug_rows[idx].drug_code || '')) {
				this.state.drug_rows[idx].drug_code = '';
			}
			this._render_drug_rows();
			this.$root.find(`.dw2-rx-input[data-idx="${idx}"][data-field="${items.length === 1 ? 'dosage' : 'drug_code'}"]`).trigger('focus');
		} catch (_) {}
	}

	_add_suggested_rx(e) {
		const idx = parseInt($(e.currentTarget).data('idx'), 10);
		const rows = (this.state.previous_drugs || []).filter((row) => row.drug_name)
			.filter((row) => !this.state.drug_rows.find((drug) => (drug.drug_name || '').trim() === (row.drug_name || '').trim()));
		const row = rows[idx];
		if (!row) return;
		this.state.drug_rows.push({
			drug_code: row.drug_code || row.drug_name || row.medication || '',
			drug_name: row.drug_name || '',
			medication: row.medication || row.drug_name || '',
			dosage: row.dosage || '',
			period: row.period || '',
			dosage_form: row.dosage_form || '',
			comment: row.comment || '',
			item_options: row.drug_code ? [row.drug_code] : [],
		});
		this._render_drug_rows();
	}

	_repeat_single_rx(e) {
		const idx = parseInt($(e.currentTarget).data('idx'), 10);
		const row = (this.state.previous_drugs || [])[idx];
		if (!row) return;
		if (this.state.drug_rows.find((drug) => (drug.drug_name || '').trim() === (row.drug_name || '').trim())) return;
		this.state.drug_rows.push({
			drug_code: row.drug_code || row.drug_name || row.medication || '',
			drug_name: row.drug_name || '',
			medication: row.medication || row.drug_name || '',
			dosage: row.dosage || '',
			period: row.period || '',
			dosage_form: row.dosage_form || '',
			comment: row.comment || '',
			item_options: row.drug_code ? [row.drug_code] : [],
		});
		this._render_drug_rows();
	}

	_repeat_previous_rx() {
		const rows = (this.state.previous_drugs || []).filter((row) => row.drug_name);
		if (!rows.length) return;
		rows.forEach((row) => {
			if (this.state.drug_rows.find((drug) => (drug.drug_name || '').trim() === (row.drug_name || '').trim())) return;
			this.state.drug_rows.push({
				drug_code: row.drug_code || row.drug_name || row.medication || '',
				drug_name: row.drug_name || '',
				medication: row.medication || row.drug_name || '',
				dosage: row.dosage || '',
				period: row.period || '',
				dosage_form: row.dosage_form || '',
				comment: row.comment || '',
				item_options: row.drug_code ? [row.drug_code] : [],
			});
		});
		this._render_drug_rows();
	}

	async _lookup_complaints(value) {
		const q = (value || '').trim();
		const $dropdown = this.$root.find('#dw2-complaint-dropdown');
		if (q.length < 1) {
			$dropdown.hide().empty();
			return;
		}
		try {
			const r = await frappe.call({
				method: 'frappe.desk.search.search_link',
				args: { txt: q, doctype: 'Complaint', ignore_user_permissions: 1 },
			});
			this._render_lookup_dropdown($dropdown, 'complaint', r.message || []);
		} catch (_) {
			$dropdown.hide().empty();
		}
	}

	async _lookup_diagnosis(value) {
		const q = (value || '').trim();
		const $dropdown = this.$root.find('#dw2-diagnosis-dropdown');
		if (q.length < 2) {
			$dropdown.hide().empty();
			return;
		}
		try {
			const r = await frappe.call({
				method: 'frappe.desk.search.search_link',
				args: {
					txt: q,
					doctype: 'Diagnosis',
					ignore_user_permissions: 1,
					reference_doctype: 'Patient Encounter Diagnosis',
				},
			});
			this._render_lookup_dropdown($dropdown, 'diagnosis', r.message || []);
		} catch (_) {
			$dropdown.hide().empty();
		}
	}

	_render_lookup_dropdown($dropdown, kind, rows) {
		const items = (rows || []).slice(0, 8);
		if (!items.length) {
			$dropdown.hide().empty();
			return;
		}
		$dropdown.html(items.map((row) => {
			const value = row.value || row;
			const description = row.description || '';
			return `
				<div class="dw2-lookup-item" data-kind="${kind}" data-value="${frappe.utils.escape_html(value)}">
					${frappe.utils.escape_html(value)}
					${description ? `<span class="dw2-lookup-sub">${frappe.utils.escape_html(description)}</span>` : ''}
				</div>
			`;
		}).join('')).show();
	}

	_select_lookup_item(e) {
		e.preventDefault();
		const $item = $(e.currentTarget);
		const kind = $item.data('kind');
		const value = String($item.data('value') || '').trim();
		if (!value) return;

		if (kind === 'complaint') {
			if (!this.state.complaint_list.includes(value)) this.state.complaint_list.push(value);
			this.$root.find('#dw2-complaint-input').val('');
			this.$root.find('#dw2-complaint-dropdown').hide().empty();
			this._render_complaints();
			this._plan_refresh();
			return;
		}

		if (!this.state.diagnosis_list.find((d) => d.diagnosis === value)) {
			this.state.diagnosis_list.push({ diagnosis: value });
		}
		this.$root.find('#dw2-diagnosis-input').val('');
		this.$root.find('#dw2-diagnosis-dropdown').hide().empty();
		this._render_diagnoses();
		this._plan_refresh();
	}

	_confirm_dialog(message) {
		return new Promise((resolve) => {
			frappe.confirm(message, () => resolve(true), () => resolve(false));
		});
	}

	async _load_suggested_plans() {
		if (!this.state.current_encounter?.name) return;
		try {
			const r = await frappe.call({
				method: 'clinic_flow.api.workspace.get_suggested_treatment_plans',
				args: {
					encounter: this.state.current_encounter.name,
					symptoms: JSON.stringify(this.state.complaint_list || []),
					diagnosis: JSON.stringify(this.state.diagnosis_list || []),
				},
			});
			this.state.suggested_plans = r.message || [];
			this._render_suggested_plans();
		} catch (_) {
			this.state.suggested_plans = [];
			this._render_suggested_plans();
		}
	}

	async _apply_treatment_plan(e) {
		const planName = String($(e.currentTarget).data('plan') || '').trim();
		if (!planName || !this.state.current_encounter?.name) return;
		const confirmed = await this._confirm_dialog(`Apply treatment plan "${planName}" to this encounter?`);
		if (!confirmed) return;
		try {
			const r = await frappe.call({
				method: 'clinic_flow.api.workspace.apply_treatment_plan',
				args: {
					encounter: this.state.current_encounter.name,
					plan_name: planName,
				},
			});
			if (r.message?.encounter) {
				this.state.current_encounter = r.message.encounter;
				this.state.suggested_plans = r.message.suggested_plans || [];
				this._hydrate_encounter_state(r.message.encounter);
				this._render_suggested_plans();
				frappe.show_alert({ message: `Applied ${planName}`, indicator: 'green' });
			}
		} catch (err) {
			frappe.show_alert({ message: err.message || 'Failed to apply treatment plan', indicator: 'red' });
		}
	}

	_handle_global_shortcuts(e) {
		if (!this.state.current_encounter) return;
		if (!(e.ctrlKey || e.metaKey)) return;
		if (e.key.toLowerCase() === 's') {
			e.preventDefault();
			this._save_draft();
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			this._complete_visit();
		}
	}

	async _ensure_reference_data() {
		if (!this._med_data) {
			try {
				const r = await frappe.call({ method: 'clinic_flow.api.workspace.get_medication_form_data' });
				this._med_data = r.message || { medications: [], dosage_forms: [], dosages: [], durations: [] };
			} catch (_) {
				this._med_data = { medications: [], dosage_forms: [], dosages: [], durations: [] };
			}
			this._populate_medication_lists();
		}

		if (!this._obs_templates) {
			try {
				const r = await frappe.call({ method: 'clinic_flow.api.workspace.get_observation_templates' });
				this._obs_templates = r.message || [];
			} catch (_) {
				this._obs_templates = [];
			}
			this._populate_test_list();
		}
	}

	_populate_medication_lists() {
		const medData = this._med_data || { medications: [], dosage_forms: [], dosages: [], durations: [] };
		this.$root.siblings('#dw2-med-list').remove();
		this.$root.siblings('#dw2-form-list').remove();
		this.$root.siblings('#dw2-dosage-list').remove();
		this.$root.siblings('#dw2-duration-list').remove();
		this.$root.after(`
			<datalist id="dw2-med-list">${(medData.medications || []).map((item) => `<option value="${frappe.utils.escape_html(item)}">`).join('')}</datalist>
			<datalist id="dw2-form-list">${(medData.dosage_forms || []).map((item) => `<option value="${frappe.utils.escape_html(item)}">`).join('')}</datalist>
			<datalist id="dw2-dosage-list">${(medData.dosages || []).map((item) => `<option value="${frappe.utils.escape_html(item)}">`).join('')}</datalist>
			<datalist id="dw2-duration-list">${(medData.durations || []).map((item) => `<option value="${frappe.utils.escape_html(item)}">`).join('')}</datalist>
		`);
	}

	_populate_test_list() {
		const $list = this.$root.siblings('#dw2-test-list');
		const html = (this._obs_templates || []).map((item) => `<option value="${frappe.utils.escape_html(typeof item === 'string' ? item : item.name)}">`).join('');
		if ($list.length) {
			$list.html(html);
			return;
		}
		this.$root.after(`<datalist id="dw2-test-list">${html}</datalist>`);
	}
}
