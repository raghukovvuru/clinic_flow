frappe.pages['doctor-workspace'].on_page_load = function(wrapper) {
	frappe.ui.make_app_page({ parent: wrapper, title: 'Doctor Workspace', single_column: true });
	$(wrapper).find('.page-content').html(get_workspace_html());
	new DoctorWorkspace(wrapper);
};

// ── HTML Template ─────────────────────────────────────────────────────────
function get_workspace_html() {
	return `
	<div class="cw-root">

		<!-- HEADER -->
		<div class="cw-header">
			<div class="cw-header-left">
				<div class="cw-action-group">
					<button class="cw-btn-call-next" id="ws-btn-call-next">▶ Call Next</button>
					<button class="cw-btn-secondary-action" id="ws-btn-recall" disabled>↩ Recall</button>
					<button class="cw-btn-secondary-action" id="ws-btn-skip"   disabled>⇥ Skip</button>
				</div>
			</div>
			<div class="cw-header-center">
				<div id="ws-queue-tokens" class="cw-token-strip">
					<span class="cw-token-empty">Queue empty</span>
				</div>
			</div>
			<div class="cw-header-right">
				<div class="cw-session-info">
					<div id="ws-session-dept" class="cw-dept-chip">—</div>
					<div id="ws-session-label" class="cw-session-name">No session</div>
				</div>
				<button class="cw-btn-pause-toggle" id="ws-btn-pause-toggle">⏸ Pause Session</button>
				<button class="cw-btn-end-session"  id="ws-btn-end-session">■ End Session</button>
			</div>
		</div>

		<!-- Pause bar -->
		<div id="ws-session-status-bar" class="cw-pause-bar" style="display:none;">
			⏸ Session paused — patients see "Temporarily Unavailable" on the queue display
		</div>

		<!-- BODY -->
		<div class="cw-body">

			<!-- ── MAIN PANEL ── -->
			<div class="cw-main">

				<div id="ws-empty-state" class="cw-empty-state">
					<div class="cw-empty-icon">🩺</div>
					<div class="cw-empty-title">No active patient</div>
					<div class="cw-empty-sub">Click "Call Next" to begin</div>
				</div>

				<div id="ws-patient-content" style="display:none;">

					<!-- Patient header -->
					<div class="cw-patient-header">
						<div class="cw-avatar" id="ws-avatar">--</div>
						<div class="cw-patient-identity">
							<div class="cw-patient-name" id="ws-patient-name"></div>
							<div class="cw-patient-meta" id="ws-patient-meta"></div>
						</div>
						<div class="cw-patient-badges">
							<div id="ws-token-badge"     class="cw-token-large"></div>
							<div id="ws-queue-type-badge" class="cw-type-pill"></div>
						</div>
						<div id="ws-patient-alerts" class="cw-patient-alerts"></div>
					</div>

					<!-- Vitals strip -->
					<div class="cw-vitals-strip">
						<div class="cw-vitals-header">
							<span class="cw-vitals-title">Vitals &amp; Biometrics</span>
							<span id="ws-vitals-date" class="cw-vitals-date"></span>
						</div>
						<div class="cw-vitals-grid" id="ws-vitals-grid">
							<div class="cw-vital-empty">No vitals recorded</div>
						</div>
					</div>

					<!-- Tabs -->
					<div class="cw-tabs">
						<button class="cw-tab is-active" data-tab="consultation">Consultation</button>
						<button class="cw-tab"           data-tab="history">History</button>
					</div>

					<!-- Consultation tab -->
					<div class="cw-tab-pane" id="ws-tab-consultation">

						<div class="cw-field-group">
							<div class="cw-field-label">Complaints</div>
							<div class="cw-tag-box" id="ws-complaint-box">
								<div id="ws-complaint-tags" class="cw-tag-list"></div>
								<input id="ws-complaint-input" class="cw-tag-input"
									placeholder="Type to add complaint..." autocomplete="off">
							</div>
							<div id="ws-complaint-dropdown" class="cw-ac-dropdown" style="display:none;"></div>
						</div>

						<div class="cw-field-group">
							<div class="cw-field-label">Diagnosis (ICD-10)</div>
							<div class="cw-tag-box" id="ws-diagnosis-wrapper">
								<div id="ws-diagnosis-tags" class="cw-tag-list"></div>
								<input id="ws-diagnosis-input" class="cw-tag-input"
									placeholder="Search diagnosis..." autocomplete="off">
							</div>
							<div id="ws-dx-dropdown" class="cw-ac-dropdown" style="display:none;"></div>
						</div>

						<div class="cw-field-group">
							<div class="cw-field-label">Plan &amp; Review</div>
							<textarea id="ws-patient-note" class="cw-textarea" rows="4"
								placeholder="Treatment plan, instructions to patient..."></textarea>
						</div>

					</div>

					<!-- History tab -->
					<div class="cw-tab-pane" id="ws-tab-history" style="display:none;">
						<div id="ws-history-content"></div>
					</div>

				</div>
			</div>

			<!-- ── PRESCRIPTION PANEL ── -->
			<div class="cw-rx-panel">

				<div class="cw-rx-panel-title">Prescription</div>

				<!-- Drug orders -->
				<div class="cw-rx-section">
					<div class="cw-rx-sec-header">
						<span class="cw-rx-sec-label">
							<span class="cw-rx-badge rx-badge-drug">Rx</span>
							Drug orders
							<span class="cw-rx-count" id="rx-drug-count">0</span>
						</span>
						<button class="cw-rx-add" data-action="add-drug">Add +</button>
					</div>
					<div id="ws-drug-form-area" class="cw-rx-form" style="display:none;"></div>
					<div id="ws-drug-cards"></div>
				</div>

				<!-- Lab orders -->
				<div class="cw-rx-section">
					<div class="cw-rx-sec-header">
						<span class="cw-rx-sec-label">
							<span class="cw-rx-badge rx-badge-lab">Lab</span>
							Lab orders
							<span class="cw-rx-count" id="rx-lab-count">0</span>
						</span>
						<button class="cw-rx-add" data-action="add-lab">Add +</button>
					</div>
					<div id="ws-lab-rows"></div>
					<datalist id="ws-obs-list"></datalist>
				</div>

				<!-- Footer -->
				<div class="cw-rx-footer">
					<button class="cw-btn-outline-full" id="ws-btn-save-draft" disabled>Save Draft</button>
					<button class="cw-btn-teal-full"    id="ws-btn-submit"     disabled>Submit Encounter ▶</button>
				</div>

			</div>

		</div>
	</div>

	<style>
	.cw-root {
		display:flex; flex-direction:column;
		height:calc(100vh - 60px); font-family:var(--font-stack); background:var(--bg-color);
	}

	/* Header */
	.cw-header {
		display:flex; align-items:center; gap:12px;
		background:#134e4a; color:#fff;
		padding:10px 16px; flex-shrink:0; min-height:80px; flex-wrap:wrap;
	}
	.cw-header-left   { display:flex; align-items:center; min-width:220px; }
	.cw-header-center { flex:1; overflow:hidden; min-width:0; }
	.cw-header-right  { display:flex; flex-direction:column; align-items:flex-end; gap:5px; flex-shrink:0; min-width:160px; }

	.cw-session-info { display:flex; align-items:center; gap:6px; justify-content:flex-end; max-width:100%; }
	.cw-dept-chip {
		background:rgba(255,255,255,.15); color:#fff; border-radius:4px;
		padding:2px 8px; font-size:11px; font-weight:700; letter-spacing:.5px; white-space:nowrap;
	}
	.cw-session-name {
		font-size:12px; font-weight:500; color:rgba(255,255,255,.8);
		text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:220px;
	}
	.cw-action-group { display:flex; gap:6px; }

	/* ── Header action buttons ── */
	.cw-btn-call-next {
		background:#fff; color:#0f766e; border:none; border-radius:5px;
		padding:6px 16px; font-size:13px; font-weight:700; cursor:pointer;
		transition:background .15s, box-shadow .15s;
		box-shadow:0 1px 3px rgba(0,0,0,.2);
	}
	.cw-btn-call-next:hover:not(:disabled) { background:#f0fdfa; box-shadow:0 2px 6px rgba(0,0,0,.25); }
	.cw-btn-call-next:disabled { opacity:.5; cursor:default; }

	.cw-btn-secondary-action {
		background:rgba(255,255,255,.12); color:#fff;
		border:1px solid rgba(255,255,255,.35); border-radius:5px;
		padding:6px 12px; font-size:13px; cursor:pointer;
		transition:background .15s, border-color .15s;
	}
	.cw-btn-secondary-action:hover:not(:disabled) { background:rgba(255,255,255,.22); border-color:rgba(255,255,255,.65); }
	.cw-btn-secondary-action:disabled { opacity:.4; cursor:default; }

	/* Pause/Resume toggle — green outline by default, amber when paused */
	.cw-btn-pause-toggle {
		display:block; width:100%; background:rgba(255,255,255,.1); color:#fff;
		border:1.5px solid rgba(255,255,255,.4); border-radius:5px;
		padding:6px 10px; font-size:12px; font-weight:600; cursor:pointer;
		transition:background .15s, border-color .15s, color .15s;
		text-align:center;
	}
	.cw-btn-pause-toggle:hover { background:rgba(255,255,255,.2); border-color:rgba(255,255,255,.7); }
	.cw-btn-pause-toggle.is-paused {
		background:#d97706; color:#fff; border-color:#d97706;
	}
	.cw-btn-pause-toggle.is-paused:hover { background:#b45309; border-color:#b45309; }

	/* End session — red-tinted outline */
	.cw-btn-end-session {
		display:block; width:100%; background:transparent; color:#fca5a5;
		border:1.5px solid rgba(252,165,165,.5); border-radius:5px;
		padding:6px 10px; font-size:12px; font-weight:600; cursor:pointer;
		transition:background .15s, border-color .15s;
		text-align:center;
	}
	.cw-btn-end-session:hover { background:rgba(252,165,165,.12); border-color:#fca5a5; }

	/* Queue token strip */
	.cw-token-strip {
		display:flex; align-items:center; gap:6px; overflow-x:auto; padding-bottom:2px; scrollbar-width:none;
	}
	.cw-token-strip::-webkit-scrollbar { display:none; }
	.cw-token-empty { font-size:12px; color:rgba(255,255,255,.4); }
	.cw-token-chip {
		display:inline-flex; flex-direction:column; align-items:center;
		background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.2);
		border-radius:6px; padding:4px 10px; white-space:nowrap; flex-shrink:0;
	}
	.cw-token-chip.chip-current   { background:rgba(255,255,255,.25); border-color:rgba(255,255,255,.7); }
	.cw-token-chip.chip-emergency { background:rgba(239,68,68,.25); border-color:#ef4444; }
	.cw-token-chip-label { font-size:9px; color:rgba(255,255,255,.5); text-transform:uppercase; margin-bottom:1px; }
	.cw-token-chip-value { font-size:13px; font-weight:700; color:#fff; font-family:var(--mono-font,monospace); }
	.cw-token-chip-name  { font-size:10px; color:rgba(255,255,255,.6); max-width:80px; overflow:hidden; text-overflow:ellipsis; }

	/* Pause bar */
	.cw-pause-bar {
		background:#fef3c7; border-bottom:1px solid #fcd34d;
		padding:8px 16px; font-size:13px; color:#92400e;
		display:flex; align-items:center; flex-shrink:0;
	}
	/* Body */
	.cw-body { display:flex; flex:1; min-height:0; }

	/* Main panel */
	.cw-main { flex:1; overflow-y:auto; padding:16px 20px; min-width:0; }

	/* Empty state */
	.cw-empty-state { text-align:center; padding:80px 20px; color:var(--text-muted); }
	.cw-empty-icon  { font-size:48px; margin-bottom:16px; }
	.cw-empty-title { font-size:16px; font-weight:600; color:var(--text-color); }
	.cw-empty-sub   { font-size:13px; margin-top:6px; }

	/* Patient header */
	.cw-patient-header {
		display:flex; align-items:center; gap:12px; flex-wrap:wrap;
		background:#fff; border:1px solid var(--border-color); border-left:4px solid #0f766e;
		border-radius:6px; padding:12px 16px; margin-bottom:12px;
		box-shadow:0 1px 4px rgba(0,0,0,.06);
	}
	.cw-avatar {
		width:44px; height:44px; border-radius:50%; flex-shrink:0;
		display:flex; align-items:center; justify-content:center;
		font-weight:700; font-size:16px; color:#fff; background:#0f766e;
	}
	.cw-patient-identity { flex:1; min-width:0; }
	.cw-patient-name { font-size:16px; font-weight:600; color:var(--text-color); }
	.cw-patient-meta { font-size:12px; color:var(--text-muted); margin-top:2px; }
	.cw-patient-badges { display:flex; gap:6px; align-items:center; flex-shrink:0; }
	.cw-token-large {
		font-family:var(--mono-font,monospace); font-size:18px; font-weight:700;
		background:#0f766e; color:#fff; padding:4px 12px; border-radius:4px; letter-spacing:1px;
	}
	.cw-type-pill { padding:3px 10px; border-radius:12px; font-size:11px; font-weight:600; }
	.cw-patient-alerts { display:flex; gap:6px; flex-wrap:wrap; }
	.cw-allergy-alert {
		background:#fef2f2; color:#dc2626; border:1px solid #fca5a5;
		border-radius:4px; padding:2px 8px; font-size:11px; font-weight:600;
	}
	.cw-fee-badge {
		background:#f0fdf4; color:#16a34a; border:1px solid #86efac;
		border-radius:4px; padding:2px 8px; font-size:11px; font-weight:600;
	}

	/* Vitals strip */
	.cw-vitals-strip {
		background:#fff; border:1px solid var(--border-color); border-radius:6px;
		padding:12px 16px; margin-bottom:12px; box-shadow:0 1px 4px rgba(0,0,0,.04);
	}
	.cw-vitals-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
	.cw-vitals-title  { font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.4px; }
	.cw-vitals-date   { font-size:11px; color:var(--text-muted); }
	.cw-vitals-grid   { display:grid; grid-template-columns:repeat(auto-fit,minmax(95px,1fr)); gap:8px; }
	.cw-vital-card {
		border:1px solid var(--border-color); border-radius:6px;
		padding:8px 10px; background:var(--bg-color);
	}
	.cw-vital-card.is-abnormal { border-color:#fbbf24; background:#fffbeb; }
	.cw-vital-card.is-high     { border-color:#f87171; background:#fef2f2; }
	.cw-vital-label { font-size:10px; color:var(--text-muted); font-weight:600; margin-bottom:4px; text-transform:uppercase; letter-spacing:.3px; }
	.cw-vital-value { font-size:19px; font-weight:700; color:var(--text-color); line-height:1; }
	.cw-vital-unit  { font-size:10px; color:var(--text-muted); margin-top:2px; }
	.cw-vital-empty { font-size:13px; color:var(--text-muted); padding:4px 0; }

	/* Tabs */
	.cw-tabs {
		display:flex; border-bottom:2px solid var(--border-color); margin-bottom:16px;
	}
	.cw-tab {
		background:none; border:none; padding:8px 20px 10px;
		font-size:13px; font-weight:500; color:var(--text-muted);
		cursor:pointer; position:relative; transition:color .15s;
	}
	.cw-tab:hover { color:var(--text-color); }
	.cw-tab.is-active { color:#0f766e; font-weight:600; }
	.cw-tab.is-active::after {
		content:''; position:absolute; bottom:-2px; left:0; right:0;
		height:2px; background:#0f766e; border-radius:1px;
	}

	/* Field groups */
	.cw-field-group { margin-bottom:18px; }
	.cw-field-label {
		font-size:11px; font-weight:700; color:var(--text-muted);
		text-transform:uppercase; letter-spacing:.4px; margin-bottom:6px;
	}

	/* Tag box (complaints + diagnosis) */
	.cw-tag-box {
		display:flex; flex-wrap:wrap; align-items:center; gap:4px;
		min-height:38px; border:1px solid var(--border-color); border-radius:4px;
		padding:4px 8px; background:var(--control-bg,#fff); cursor:text; position:relative;
	}
	.cw-tag-box:focus-within { border-color:#0f766e; box-shadow:0 0 0 2px rgba(15,118,110,.12); }
	.cw-tag-list { display:flex; flex-wrap:wrap; gap:4px; }
	.cw-tag {
		display:inline-flex; align-items:center; gap:4px;
		background:#f0fdfa; color:#0f766e; border:1px solid #99f6e4;
		border-radius:12px; padding:2px 8px; font-size:12px; font-weight:500;
	}
	.cw-tag-remove { cursor:pointer; font-weight:700; opacity:.6; font-size:13px; line-height:1; }
	.cw-tag-remove:hover { opacity:1; }
	.cw-tag-input {
		border:none; outline:none; background:transparent;
		font-size:13px; min-width:140px; flex:1; padding:2px 4px; color:var(--text-color);
	}

	/* Autocomplete dropdown */
	.cw-ac-dropdown {
		background:var(--modal-bg,#fff); border:1px solid var(--border-color);
		border-radius:4px; box-shadow:0 4px 12px rgba(0,0,0,.1);
		max-height:220px; overflow-y:auto; margin-top:2px; z-index:1000;
	}
	.cw-ac-item { padding:8px 12px; cursor:pointer; font-size:13px; }
	.cw-ac-item:hover { background:var(--bg-color); }
	.cw-ac-desc { font-size:11px; color:var(--text-muted); }

	/* Diagnosis dropdown (created dynamically by autocomplete, same style) */
	#ws-dx-dropdown {
		position:absolute; z-index:1000; background:var(--modal-bg,#fff);
		border:1px solid var(--border-color); border-radius:4px;
		box-shadow:0 4px 12px rgba(0,0,0,.12); max-height:220px; overflow-y:auto;
		min-width:260px; top:100%; left:0;
	}
	.dx-option { padding:8px 12px; cursor:pointer; font-size:13px; }
	.dx-option:hover { background:var(--bg-color); }

	/* Diagnosis tags */
	.dx-tag {
		background:#f0fdfa; color:#0f766e; border:1px solid #99f6e4;
		border-radius:12px; padding:2px 8px; font-size:12px;
		display:inline-flex; align-items:center; gap:4px;
	}
	.dx-tag-remove { cursor:pointer; font-weight:700; opacity:.6; }
	.dx-tag-remove:hover { opacity:1; }

	/* Textarea */
	.cw-textarea {
		width:100%; border:1px solid var(--border-color); border-radius:4px;
		padding:8px 10px; font-size:13px; resize:vertical;
		background:var(--control-bg,#fff); color:var(--text-color);
		font-family:var(--font-stack); line-height:1.5; transition:border-color .15s;
		box-sizing:border-box;
	}
	.cw-textarea:focus { outline:none; border-color:#0f766e; box-shadow:0 0 0 2px rgba(15,118,110,.12); }

	/* History tab */
	.cw-history-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
	.cw-history-card {
		background:#fff; border:1px solid var(--border-color);
		border-radius:6px; padding:12px 14px;
	}
	.cw-history-card-title {
		font-size:11px; font-weight:700; color:var(--text-muted);
		text-transform:uppercase; letter-spacing:.4px; margin-bottom:8px;
	}
	.cw-history-item {
		font-size:12px; color:var(--text-color); padding:4px 0;
		border-bottom:1px solid var(--border-color);
	}
	.cw-history-item:last-child { border-bottom:none; }
	.cw-history-sub   { font-size:11px; color:var(--text-muted); }
	.cw-history-empty { font-size:12px; color:var(--text-muted); }

	/* Prescription panel */
	.cw-rx-panel {
		width:600px; flex-shrink:0; border-left:1px solid var(--border-color);
		background:#f8fafc; display:flex; flex-direction:column; overflow-y:auto;
	}
	.cw-rx-panel-title {
		font-size:11px; font-weight:700; color:var(--text-muted);
		text-transform:uppercase; letter-spacing:.5px; padding:14px 14px 0;
	}
	.cw-rx-section { padding:0 14px 14px; border-bottom:1px solid var(--border-color); }
	.cw-rx-sec-header {
		display:flex; align-items:center; justify-content:space-between; padding:10px 0 8px;
	}
	.cw-rx-sec-label {
		display:flex; align-items:center; gap:6px;
		font-size:13px; font-weight:600; color:var(--text-color);
	}
	.cw-rx-badge { font-size:9px; font-weight:700; padding:2px 5px; border-radius:3px; }
	.rx-badge-drug { background:#dbeafe; color:#1d4ed8; }
	.rx-badge-lab  { background:#dcfce7; color:#15803d; }
	.cw-rx-count {
		background:var(--border-color); color:var(--text-muted);
		border-radius:10px; padding:0 6px; font-size:11px; font-weight:700;
		min-width:18px; text-align:center;
	}
	.cw-rx-add {
		background:none; border:1px dashed var(--border-color); border-radius:4px;
		padding:2px 8px; font-size:12px; font-weight:600; color:#0f766e;
		cursor:pointer; transition:background .15s, border-color .15s;
	}
	.cw-rx-add:hover { background:#f0fdfa; border-color:#0f766e; }

	/* Drug cards */
	.drug-card {
		display:flex; align-items:flex-start; justify-content:space-between;
		padding:8px 10px; margin-bottom:6px; background:#fff;
		border:1px solid var(--border-color); border-radius:6px;
		box-shadow:0 1px 3px rgba(0,0,0,.05);
	}
	.drug-card-label {
		font-size:9px; font-weight:700; color:#1d4ed8; background:#dbeafe;
		padding:1px 5px; border-radius:3px; margin-right:6px; flex-shrink:0;
	}
	.drug-card-text  { font-size:12px; color:var(--text-color); font-weight:500; }
	.drug-card-note  { font-size:11px; color:var(--text-muted); display:block; margin-top:2px; }
	.drug-card-actions { display:flex; gap:4px; flex-shrink:0; margin-left:6px; }

	/* Lab rows */
	.lab-row { display:flex; gap:6px; margin-bottom:6px; align-items:center; }
	.lab-row input {
		flex:1; border:1px solid var(--border-color); border-radius:4px;
		padding:5px 8px; font-size:12px; background:#fff;
	}
	.lab-row input:focus { outline:none; border-color:#0f766e; }

	/* Rx inline form */
	.cw-rx-form {
		background:#fff; border:1px solid var(--border-color);
		border-radius:6px; padding:10px; margin-bottom:8px;
	}
	.df-label {
		font-size:10px; color:var(--text-muted); margin-bottom:2px;
		font-weight:600; text-transform:uppercase; letter-spacing:.3px;
	}

	/* Rx footer */
	.cw-rx-footer { padding:12px 14px; margin-top:auto; display:flex; flex-direction:column; gap:8px; }
	.cw-btn-outline-full {
		display:block; width:100%; padding:8px; border-radius:4px; font-size:13px; font-weight:600;
		background:none; border:1px solid var(--border-color); color:var(--text-color);
		cursor:pointer; transition:background .15s;
	}
	.cw-btn-outline-full:hover:not(:disabled) { background:var(--bg-color); }
	.cw-btn-outline-full:disabled { opacity:.5; cursor:default; }
	.cw-btn-teal-full {
		display:block; width:100%; padding:8px; border-radius:4px; font-size:13px; font-weight:600;
		background:#0f766e; color:#fff; border:none; cursor:pointer; transition:background .15s;
	}
	.cw-btn-teal-full:hover:not(:disabled) { background:#0d9488; }
	.cw-btn-teal-full:disabled { opacity:.5; cursor:default; }
	</style>
	`;
}


// ── Workspace Controller ───────────────────────────────────────────────────
class DoctorWorkspace {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.state = {
			queue_session:    null,
			current_entry:    null,
			current_encounter: null,
			diagnosis_list:   [],
			complaint_list:   [],
			drug_rows:        [],
			session_paused:   false,
		};
		this._queue_poll       = null;
		this._autocomplete_ready = false;
		this._med_data         = null;
		this._init();
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
					this._activate_session(v.message.name, v.message.session_name,
						v.message.dept_abbr, v.message.status, v.message.dept_name);
					return;
				}
			} catch (_) {}
			localStorage.removeItem('clinic_flow_session');
		}

		try {
			const r = await frappe.call({ method: 'clinic_flow.api.queue.get_active_session_for_user' });
			if (r.message) {
				this._activate_session(r.message.name, r.message.session_name,
					r.message.dept_abbr, r.message.status, r.message.dept_name);
				return;
			}
		} catch (_) {}

		this._show_start_session_prompt();
	}

	_activate_session(session_name, label, dept_abbr, status, dept_name) {
		this.state.queue_session = session_name;
		$('#ws-session-label').text(label || session_name);
		const dept_display = dept_name || dept_abbr || '';
		if (dept_display) $('#ws-session-dept').text(dept_display);
		localStorage.setItem('clinic_flow_session', JSON.stringify({ name: session_name }));

		// Restore paused state immediately so the UI is correct before the first poll
		if (status === 'Paused') {
			this.state.session_paused = true;
			$('#ws-btn-pause-toggle').addClass('is-paused').text('▶ Resume Session');
			$('#ws-btn-call-next').prop('disabled', true);
			$('#ws-session-status-bar').show();
		} else {
			this.state.session_paused = false;
			$('#ws-btn-pause-toggle').removeClass('is-paused').text('⏸ Pause Session');
			$('#ws-btn-call-next').prop('disabled', false);
			$('#ws-session-status-bar').hide();
		}

		this._load_queue();
		this._bind_events();
		this._subscribe_realtime();
		if (this._queue_poll) clearInterval(this._queue_poll);
		this._queue_poll = setInterval(() => this._load_queue(), 15000);
	}

	_show_start_session_prompt() {
		$('#ws-session-label').text('No session today');
		$('#ws-empty-state').html(`
			<div class="cw-empty-icon">📋</div>
			<div class="cw-empty-title">No active session for today</div>
			<div class="cw-empty-sub">Start a session to begin seeing patients</div>
			<button class="cw-btn-teal" style="margin-top:16px;padding:8px 20px;" id="ws-btn-start-session">
				Start Consultation Session
			</button>
		`);

		$('#ws-btn-start-session').on('click', async () => {
			const res = await frappe.call({ method: 'clinic_flow.api.queue.get_today_schedules' });
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

		function fmtTime(t) {
			if (!t) return '';
			const parts = String(t).split(':');
			let h = parseInt(parts[0]), m = parts[1] || '00';
			const ampm = h >= 12 ? 'PM' : 'AM';
			h = h % 12 || 12;
			return `${h}:${m} ${ampm}`;
		}

		const cardStyles = `border:2px solid var(--border-color);border-radius:6px;padding:12px 16px;margin-bottom:8px;cursor:pointer;transition:border-color .15s,background .15s;`;
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
						<div style="font-size:13px;font-weight:500;color:var(--text-muted);">${s.capacity || '—'} slots</div>
					</div>
				</div>`;
			}).join('')
			: `<div style="color:var(--text-muted);font-size:13px;padding:6px 0 10px;">No scheduled sessions for today.</div>`;

		const dialogBody = `
			<div style="padding:4px 0;">
				<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Today's Schedules</div>
				${scheduleCards}
				<div style="display:flex;align-items:center;gap:8px;margin:14px 0;">
					<div style="flex:1;height:1px;background:var(--border-color);"></div>
					<span style="font-size:11px;color:var(--text-muted);">or</span>
					<div style="flex:1;height:1px;background:var(--border-color);"></div>
				</div>
				<button class="btn btn-default btn-sm" id="cf-toggle-unscheduled" style="width:100%;">+ Start Unscheduled Session</button>
				<div id="cf-unscheduled-form" style="display:none;margin-top:12px;padding:12px;background:var(--bg-color);border-radius:6px;border:1px solid var(--border-color);">
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
				const r = await frappe.call({ method: 'clinic_flow.api.queue.start_session', args });
				if (r.message) {
					const is_paused = r.message.status === 'Paused';
					$('#ws-empty-state').html(`
						<div class="cw-empty-icon">🩺</div>
						<div class="cw-empty-title">No active patient</div>
						<div class="cw-empty-sub">${is_paused ? 'Session is paused — click Resume to continue' : 'Click "Call Next" to begin'}</div>
					`);
					this._activate_session(r.message.session, r.message.session_name,
						r.message.dept_abbr, r.message.status, r.message.dept_name);
					frappe.show_alert({
						message: is_paused ? 'Existing paused session restored' : 'Consultation session started',
						indicator: is_paused ? 'orange' : 'green',
					});
				}
			},
		});

		d.show();

		setTimeout(() => {
			$('.cf-sched-card').on('click', function() {
				const idx = parseInt($(this).data('idx'));
				selectedSchedule = schedules[idx];
				isUnscheduled = false;
				$('.cf-sched-card').css({ borderColor: 'var(--border-color)', background: '' });
				$(this).css({ borderColor: '#0f766e', background: '#f0fdfa' });
				$('#cf-unscheduled-form').hide();
				$('#cf-toggle-unscheduled').text('+ Start Unscheduled Session');
			});

			$('#cf-toggle-unscheduled').on('click', function() {
				isUnscheduled = !isUnscheduled;
				selectedSchedule = null;
				if (isUnscheduled) {
					$('#cf-unscheduled-form').show();
					$('.cf-sched-card').css({ borderColor: 'var(--border-color)', background: '' });
					$(this).text('✕ Cancel Unscheduled');
				} else {
					$('#cf-unscheduled-form').hide();
					$(this).text('+ Start Unscheduled Session');
				}
			});
		}, 200);
	}

	_bind_events() {
		const self = this;

		$('#ws-btn-call-next').on('click', () => self._call_next());
		$('#ws-btn-recall').on('click',    () => self._recall());
		$('#ws-btn-skip').on('click',      () => self._skip());
		$('#ws-btn-save-draft').on('click',() => self._save_draft());
		$('#ws-btn-submit').on('click',    () => self._submit_encounter());
		$('#ws-btn-pause-toggle').on('click', () => {
			if (self.state.session_paused) self._resume_session();
			else self._pause_session();
		});
		$('#ws-btn-end-session').on('click', () => self._end_session());

		// Tab switching
		$(document).on('click.ws', '.cw-tab', function() {
			self._switch_tab($(this).data('tab'));
		});

		// Complaint tag removal
		$(document).on('click.ws', '.cw-tag-remove', function() {
			const idx = parseInt($(this).data('idx'));
			self.state.complaint_list.splice(idx, 1);
			self._render_complaint_tags();
		});

		// Diagnosis tag removal
		$(document).on('click.ws', '.dx-tag-remove', function() {
			const idx = parseInt($(this).data('idx'));
			self.state.diagnosis_list.splice(idx, 1);
			self._render_diagnosis_tags();
		});

		// Close complaint dropdown on outside click
		$(document).on('click.ws-complaint', (e) => {
			if (!$(e.target).closest('#ws-complaint-box, #ws-complaint-dropdown').length) {
				$('#ws-complaint-dropdown').hide().empty();
			}
		});

		// Close diagnosis dropdown on outside click
		$(document).on('click.ws-dx', (e) => {
			if (!$(e.target).closest('#ws-diagnosis-wrapper').length) {
				$('#ws-dx-dropdown').hide();
			}
		});

		// Click tag box → focus input
		$('#ws-complaint-box').on('click', () => $('#ws-complaint-input').focus());
		$('#ws-diagnosis-wrapper').on('click', () => $('#ws-diagnosis-input').focus());

		// Drug card actions
		$(document).on('click.ws', '[data-action="add-drug"]',    () => self._show_drug_form(null));
		$(document).on('click.ws', '[data-action="edit-drug"]',   function() {
			self._show_drug_form(parseInt($(this).data('idx')));
		});
		$(document).on('click.ws', '[data-action="remove-drug"]', function() {
			self.state.drug_rows.splice(parseInt($(this).data('idx')), 1);
			self._render_drug_cards();
			self._update_rx_counts();
		});
		$(document).on('click.ws', '[data-action="confirm-drug-form"]', function() {
			const idx = $(this).data('idx');
			self._confirm_drug_form(idx !== '' ? parseInt(idx) : null);
		});
		$(document).on('click.ws', '[data-action="cancel-drug-form"]', () => {
			$('#ws-drug-form-area').hide().empty();
		});

		// Lab actions
		$(document).on('click.ws', '[data-action="add-lab"]', () => {
			self._add_lab_row();
			self._update_rx_counts();
		});
		$(document).on('click.ws', '[data-action="remove-lab"]', function() {
			$(this).closest('.lab-row').remove();
			self._update_rx_counts();
		});
	}

	// ── Session controls ─────────────────────────────────────────────────────

	async _pause_session() {
		const r = await frappe.call({
			method: 'clinic_flow.api.queue.pause_session',
			args: { queue_session: this.state.queue_session },
		});
		if (r.message?.status === 'paused') {
			this.state.session_paused = true;
			$('#ws-btn-pause-toggle').addClass('is-paused').text('▶ Resume Session');
			$('#ws-btn-call-next').prop('disabled', true);
			$('#ws-session-status-bar').show();
			frappe.show_alert({ message: 'Session paused.', indicator: 'orange' });
		}
	}

	async _resume_session() {
		const r = await frappe.call({
			method: 'clinic_flow.api.queue.resume_session',
			args: { queue_session: this.state.queue_session },
		});
		if (r.message?.status === 'active') {
			this.state.session_paused = false;
			$('#ws-btn-pause-toggle').removeClass('is-paused').text('⏸ Pause Session');
			$('#ws-btn-call-next').prop('disabled', false);
			$('#ws-session-status-bar').hide();
			frappe.show_alert({ message: 'Session resumed.', indicator: 'green' });
		}
	}

	async _end_session() {
		const waiting_count = $('#ws-queue-tokens .cw-token-chip').length;
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
				<p>Session ended. Reroute waiting patients to another active session?</p>
				<select id="reroute-select" class="form-control" style="margin-top:8px;">${options}</select>
				<button class="btn btn-primary btn-sm" style="margin-top:8px;" id="reroute-confirm">Reroute Patients</button>
				<button class="btn btn-default btn-sm" style="margin-top:8px;margin-left:4px;" id="reroute-skip">Skip</button>
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
			$('#reroute-skip').on('click', () => { frappe.hide_msgprint(); this._reset_workspace(); });
		}, 300);
	}

	_reset_workspace() {
		if (this._queue_poll) { clearInterval(this._queue_poll); this._queue_poll = null; }
		this.state = {
			queue_session: null, current_entry: null, current_encounter: null,
			diagnosis_list: [], complaint_list: [], drug_rows: [], session_paused: false,
		};
		$('#ws-patient-content').hide();
		$('#ws-empty-state').show().html(`
			<div class="cw-empty-icon">📋</div>
			<div class="cw-empty-title">Session ended</div>
			<div class="cw-empty-sub">Start a new session to continue</div>
		`);
		$('#ws-session-status-bar').hide();
		$('#ws-btn-pause-toggle').removeClass('is-paused').text('⏸ Pause Session');
		$('#ws-btn-call-next').prop('disabled', false);
		$('#ws-btn-recall').prop('disabled', true);
		$('#ws-btn-skip').prop('disabled', true);
		$('#ws-btn-save-draft').prop('disabled', true);
		$('#ws-btn-submit').prop('disabled', true);
		$('#ws-drug-cards').empty();
		$('#ws-drug-form-area').hide().empty();
		$('#ws-lab-rows').empty();
		$('#ws-queue-tokens').html('<span class="cw-token-empty">Queue empty</span>');
		this._update_rx_counts();
		this._show_start_session_prompt();
	}

	// ── Realtime & queue ─────────────────────────────────────────────────────

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

			// Sync pause state from server truth on every poll
			const sess_status = r.message.session?.status;
			if (sess_status === 'Paused' && !this.state.session_paused) {
				this.state.session_paused = true;
				$('#ws-btn-pause-toggle').addClass('is-paused').text('▶ Resume Session');
				$('#ws-btn-call-next').prop('disabled', true);
				$('#ws-session-status-bar').show();
			} else if (sess_status === 'Active' && this.state.session_paused) {
				this.state.session_paused = false;
				$('#ws-btn-pause-toggle').removeClass('is-paused').text('⏸ Pause Session');
				$('#ws-btn-call-next').prop('disabled', false);
				$('#ws-session-status-bar').hide();
			}
		}
	}

	_render_queue(waiting, current_token) {
		const strip = $('#ws-queue-tokens');
		strip.empty();

		if (!waiting || !waiting.length) {
			strip.html('<span class="cw-token-empty">Queue empty</span>');
			return;
		}

		waiting.forEach((entry, idx) => {
			const is_current   = entry.token === current_token;
			const is_emergency = entry.queue_type === 'EMERGENCY';
			const chip_cls = is_emergency ? 'chip-emergency' : (is_current ? 'chip-current' : '');
			const label    = is_current ? 'Current' : `#${idx + 1}`;
			const short    = (entry.patient_name || '').split(' ')[0];

			strip.append(`
				<div class="cw-token-chip ${chip_cls}">
					<span class="cw-token-chip-label">${frappe.utils.escape_html(label)}</span>
					<span class="cw-token-chip-value">${frappe.utils.escape_html(entry.token)}</span>
					<span class="cw-token-chip-name">${frappe.utils.escape_html(short)}</span>
				</div>
			`);
		});
	}

	// ── Patient actions ───────────────────────────────────────────────────────

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

			this.state.current_entry    = payload.queue_entry;
			this.state.current_encounter = payload.encounter;
			this.state.diagnosis_list   = [];
			this.state.complaint_list   = [];

			this._render_patient_header(payload);
			this._render_vitals_strip(payload.patient_summary?.vitals || {});
			this._render_encounter_editor(payload.encounter);
			this._render_history_tab(payload.patient_summary);
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
			this.state.current_entry    = r.message.queue_entry;
			this.state.current_encounter = r.message.encounter;
			this.state.diagnosis_list   = [];
			this.state.complaint_list   = [];
			this._render_patient_header(r.message);
			this._render_vitals_strip(r.message.patient_summary?.vitals || {});
			this._render_encounter_editor(r.message.encounter);
			this._render_history_tab(r.message.patient_summary);
		}
	}

	async _save_draft() {
		if (!this.state.current_encounter) return;
		const data = this._collect_encounter_data();
		const btn  = $('#ws-btn-save-draft');
		btn.prop('disabled', true).text('Saving...');
		try {
			await frappe.call({
				method: 'clinic_flow.api.workspace.save_encounter_draft',
				args: { encounter: this.state.current_encounter.name, data: JSON.stringify(data) },
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

			// Clear patient area, stay ready for next call
			$('#ws-patient-content').hide();
			$('#ws-empty-state').show().html(`
				<div class="cw-empty-icon">🩺</div>
				<div class="cw-empty-title">No active patient</div>
				<div class="cw-empty-sub">Click "Call Next" to begin</div>
			`);
			this.state.current_entry    = null;
			this.state.current_encounter = null;
			this.state.diagnosis_list   = [];
			this.state.complaint_list   = [];
			this.state.drug_rows        = [];
			$('#ws-drug-cards').empty();
			$('#ws-lab-rows').empty();
			$('#ws-drug-form-area').hide().empty();
			this._update_rx_counts();
			$('#ws-btn-recall, #ws-btn-skip, #ws-btn-save-draft, #ws-btn-submit')
				.prop('disabled', true);
			this._load_queue();
		} catch (e) {
			frappe.show_alert({ message: 'Submit failed', indicator: 'red' });
		} finally {
			btn.prop('disabled', false).text('Submit Encounter ▶');
		}
	}

	_collect_encounter_data() {
		return {
			symptoms:             this.state.complaint_list.join(', '),
			patient_note:         $('#ws-patient-note').val(),
			diagnosis:            this.state.diagnosis_list,
			drug_prescription:    this._collect_drug_rows(),
			lab_test_prescription: this._collect_lab_rows(),
		};
	}

	_collect_drug_rows() {
		return (this.state.drug_rows || []).filter(r => r.drug_name || r.medication);
	}

	_collect_lab_rows() {
		const rows = [];
		$('#ws-lab-rows .lab-row').each(function() {
			const v = $(this).find('input').val();
			if (v) rows.push({ lab_test_name: v });
		});
		return rows;
	}

	_set_buttons_active() {
		$('#ws-btn-recall, #ws-btn-skip, #ws-btn-save-draft, #ws-btn-submit')
			.prop('disabled', false);
		$('#ws-btn-submit').text('Submit Encounter ▶');
	}

	// ── Render: patient header ────────────────────────────────────────────────

	_render_patient_header(payload) {
		const entry   = payload.queue_entry;
		const summary = payload.patient_summary || {};
		const demo    = summary.demographics || {};

		// Avatar initials + deterministic color
		const name   = demo.patient_name || entry.patient_name || '';
		const parts  = name.trim().split(/\s+/);
		const initials = parts.length >= 2
			? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
			: name.slice(0, 2).toUpperCase();
		const colors = ['#0f766e','#0369a1','#7c3aed','#be185d','#b45309','#15803d'];
		let h = 0;
		for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
		$('#ws-avatar').text(initials).css('background', colors[Math.abs(h) % colors.length]);

		$('#ws-patient-name').text(name);
		$('#ws-patient-meta').text(
			[demo.age ? `${demo.age} yrs` : '', demo.sex, demo.blood_group].filter(Boolean).join(' · ')
		);
		$('#ws-token-badge').text(entry.token);

		const type_colors = {
			'EMERGENCY': ['#dc2626','#fef2f2'], 'PRE_BOOKED': ['#1d4ed8','#eff6ff'],
			'WALK_IN':   ['#15803d','#f0fdf4'], 'FOLLOW_UP':  ['#b45309','#fffbeb'],
		};
		const type_labels = {
			'EMERGENCY':'Emergency','PRE_BOOKED':'Pre-booked','WALK_IN':'Walk-in','FOLLOW_UP':'Follow-up',
		};
		const [tc, tbc] = type_colors[entry.queue_type] || ['#6b7280','#f9fafb'];
		$('#ws-queue-type-badge')
			.text(type_labels[entry.queue_type] || entry.queue_type)
			.css({ color: tc, background: tbc, border: `1px solid ${tc}40` });

		// Alerts
		const alerts = [];
		const allergies = summary.allergies || [];
		if (allergies.length) {
			const names = allergies.map(a => a.allergy).filter(Boolean).slice(0, 3).join(', ');
			alerts.push(`<span class="cw-allergy-alert">⚠ ${frappe.utils.escape_html(names)}</span>`);
		}
		const fv = summary.fee_validity || {};
		if (fv.has_validity) {
			const fv_till = fv.valid_till ? frappe.datetime.str_to_user(fv.valid_till) : '';
			alerts.push(`<span class="cw-fee-badge">Fee valid till ${fv_till} · ${fv.visits_remaining} visits</span>`);
		}
		$('#ws-patient-alerts').html(alerts.join(''));

		$('#ws-empty-state').hide();
		$('#ws-patient-content').show();
	}

	// ── Render: vitals strip ──────────────────────────────────────────────────

	_render_vitals_strip(vitals) {
		const grid = $('#ws-vitals-grid');
		grid.empty();

		const has_data = vitals && (vitals.pulse || vitals.temperature || vitals.bp_systolic || vitals.weight);
		if (!has_data) {
			grid.html('<div class="cw-vital-empty">No vitals recorded</div>');
			$('#ws-vitals-date').text('');
			return;
		}

		if (vitals.signs_date) {
			$('#ws-vitals-date').text(frappe.datetime.str_to_user(vitals.signs_date));
		}

		const DEFS = [
			{
				label: 'Blood Pressure', unit: 'mmHg',
				value: (vitals.bp_systolic && vitals.bp_diastolic)
					? `${vitals.bp_systolic}/${vitals.bp_diastolic}` : vitals.bp_systolic || null,
				abnormal: vitals.bp_systolic > 140 || vitals.bp_systolic < 90
					|| vitals.bp_diastolic > 90 || vitals.bp_diastolic < 60,
				high: vitals.bp_systolic > 160 || vitals.bp_diastolic > 100,
			},
			{
				label: 'Heart Rate', unit: 'bpm', value: vitals.pulse,
				abnormal: vitals.pulse > 100 || vitals.pulse < 60,
				high: vitals.pulse > 120,
			},
			{
				label: 'Temperature', unit: '°C', value: vitals.temperature,
				abnormal: vitals.temperature > 38.5 || vitals.temperature < 36.0,
				high: vitals.temperature > 39.5,
			},
			{
				label: 'Resp Rate', unit: '/min', value: vitals.respiratory_rate,
				abnormal: vitals.respiratory_rate > 20 || vitals.respiratory_rate < 12,
				high: vitals.respiratory_rate > 25,
			},
			{ label: 'Weight',  unit: 'kg',    value: vitals.weight },
			{ label: 'Height',  unit: 'cm',    value: vitals.height },
			{
				label: 'BMI', unit: 'kg/m²', value: vitals.bmi ? parseFloat(vitals.bmi).toFixed(1) : null,
				abnormal: vitals.bmi > 30 || vitals.bmi < 18.5,
				high: vitals.bmi > 35,
			},
		];

		DEFS.forEach(v => {
			if (v.value === null || v.value === undefined || v.value === '') return;
			const cls   = v.high ? 'is-high' : (v.abnormal ? 'is-abnormal' : '');
			const arrow = v.high ? ' <span style="font-size:11px;color:#ef4444;">↑↑</span>'
				: (v.abnormal ? ' <span style="font-size:11px;color:#f59e0b;">↑</span>' : '');
			grid.append(`
				<div class="cw-vital-card ${cls}">
					<div class="cw-vital-label">${v.label}</div>
					<div class="cw-vital-value">${v.value}${arrow}</div>
					<div class="cw-vital-unit">${v.unit}</div>
				</div>
			`);
		});
	}

	// ── Render: encounter editor (work area) ──────────────────────────────────

	_render_encounter_editor(encounter) {
		if (!encounter) return;

		// Parse saved complaints back into tags
		const saved_symptoms = encounter.symptoms || '';
		this.state.complaint_list = saved_symptoms
			? saved_symptoms.split(',').map(s => s.trim()).filter(Boolean)
			: [];
		this._render_complaint_tags();

		$('#ws-patient-note').val(encounter.patient_note || '');

		this.state.diagnosis_list = (encounter.diagnosis || [])
			.map(d => ({ diagnosis: d.diagnosis }))
			.filter(d => d.diagnosis);
		this._render_diagnosis_tags();

		this._render_drug_rows(encounter.drug_prescription || []);
		this._render_lab_rows(encounter.lab_test_prescription || []);
		this._update_rx_counts();

		if (!this._autocomplete_ready) {
			this._setup_complaint_tags();
			this._setup_diagnosis_autocomplete();
			this._autocomplete_ready = true;
		}

		this._switch_tab('consultation');
	}

	// ── Render: history tab ───────────────────────────────────────────────────

	_render_history_tab(summary) {
		if (!summary) return;
		const meds  = summary.active_medications  || [];
		const dx    = summary.recent_diagnoses     || [];
		const labs  = summary.recent_lab_results   || [];
		const fv    = summary.fee_validity         || {};

		const meds_html = meds.length
			? meds.map(m => `<div class="cw-history-item">
					${frappe.utils.escape_html(m.drug_name || '')}
					${m.dosage ? `<span class="cw-history-sub"> · ${m.dosage}</span>` : ''}
				</div>`).join('')
			: '<div class="cw-history-empty">None recorded</div>';

		const dx_html = dx.length
			? dx.slice(0, 8).map(d => `<div class="cw-history-item">
					${frappe.utils.escape_html(d.diagnosis || '')}
					${d.encounter_date ? `<span class="cw-history-sub"> · ${d.encounter_date}</span>` : ''}
				</div>`).join('')
			: '<div class="cw-history-empty">None recorded</div>';

		const labs_html = labs.length
			? labs.map(l => `<div class="cw-history-item">
					${frappe.utils.escape_html(l.name || '')}
					${l.result_date ? `<span class="cw-history-sub"> · ${l.result_date}</span>` : ''}
				</div>`).join('')
			: '<div class="cw-history-empty">None available</div>';

		const fv_html = fv.has_validity
			? `<div class="cw-history-item" style="color:#16a34a;">
					Valid till ${frappe.utils.escape_html(String(fv.valid_till))}
					<span class="cw-history-sub"> · ${fv.visits_remaining} visits remaining</span>
				</div>`
			: '<div class="cw-history-empty">No active validity</div>';

		$('#ws-history-content').html(`
			<div class="cw-history-grid">
				<div class="cw-history-card">
					<div class="cw-history-card-title">Active Medications</div>${meds_html}
				</div>
				<div class="cw-history-card">
					<div class="cw-history-card-title">Recent Diagnoses</div>${dx_html}
				</div>
				<div class="cw-history-card">
					<div class="cw-history-card-title">Fee Validity</div>${fv_html}
				</div>
				<div class="cw-history-card">
					<div class="cw-history-card-title">Prior Lab Results</div>${labs_html}
				</div>
			</div>
		`);
	}

	_switch_tab(name) {
		$('.cw-tab').removeClass('is-active');
		$(`.cw-tab[data-tab="${name}"]`).addClass('is-active');
		$('.cw-tab-pane').hide();
		$(`#ws-tab-${name}`).show();
	}

	// ── Complaint tag input ───────────────────────────────────────────────────

	_render_complaint_tags() {
		const container = $('#ws-complaint-tags');
		container.empty();
		this.state.complaint_list.forEach((c, idx) => {
			container.append(`
				<span class="cw-tag">
					${frappe.utils.escape_html(c)}
					<span class="cw-tag-remove" data-idx="${idx}" title="Remove">×</span>
				</span>
			`);
		});
	}

	_setup_complaint_tags() {
		const self = this;

		$('#ws-complaint-input').on('keydown', function(e) {
			if ((e.key === 'Enter' || e.key === ',') && !e.shiftKey) {
				e.preventDefault();
				const val = $(this).val().replace(/,$/, '').trim();
				if (val && !self.state.complaint_list.includes(val)) {
					self.state.complaint_list.push(val);
					self._render_complaint_tags();
				}
				$(this).val('');
				$('#ws-complaint-dropdown').hide().empty();
			}
			if (e.key === 'Escape') {
				$('#ws-complaint-dropdown').hide().empty();
			}
		});

		$('#ws-complaint-input').on('input', frappe.utils.debounce(async function() {
			const q = $(this).val().trim();
			const dd = $('#ws-complaint-dropdown');
			if (q.length < 1) { dd.hide().empty(); return; }

			try {
				const r = await frappe.call({
					method: 'frappe.desk.search.search_link',
					args: { txt: q, doctype: 'Complaint', ignore_user_permissions: 1 },
				});
				const results = (r.message || []).slice(0, 8);
				dd.empty();
				if (!results.length) { dd.hide(); return; }

				results.forEach(item => {
					const val = item.value || item;
					const row = $(`<div class="cw-ac-item">${frappe.utils.escape_html(val)}</div>`);
					row.on('mousedown', (e) => {
						e.preventDefault();
						if (!self.state.complaint_list.includes(val)) {
							self.state.complaint_list.push(val);
							self._render_complaint_tags();
						}
						$('#ws-complaint-input').val('');
						dd.hide().empty();
					});
					dd.append(row);
				});
				dd.show();
			} catch (_) {}
		}, 250));
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
			if (e.key === 'Escape') { $('#ws-dx-dropdown').hide(); return; }
			if (e.key === 'Enter')  return;

			const q = $(this).val().trim();
			$('#ws-dx-dropdown').hide().empty();
			if (q.length < 2) return;

			const r = await frappe.call({
				method: 'frappe.desk.search.search_link',
				args: { txt: q, doctype: 'Diagnosis', ignore_user_permissions: 1,
					reference_doctype: 'Patient Encounter Diagnosis' },
			});

			const results = (r.message || []).slice(0, 8);
			if (!results.length) return;

			const dd = $('#ws-dx-dropdown');
			dd.empty();
			results.forEach(item => {
				const val  = item.value || item;
				const desc = item.description
					? `<span class="cw-ac-desc">${item.description}</span>` : '';
				const row  = $(`<div class="dx-option">${frappe.utils.escape_html(val)}${desc}</div>`);
				row.on('click', () => {
					if (!self.state.diagnosis_list.find(d => d.diagnosis === val)) {
						self.state.diagnosis_list.push({ diagnosis: val });
						self._render_diagnosis_tags();
					}
					$('#ws-diagnosis-input').val('');
					dd.hide();
				});
				dd.append(row);
			});
			dd.show();
		}, 300));
	}

	// ── Medication form ───────────────────────────────────────────────────────

	_render_drug_rows(rows) {
		this.state.drug_rows = (rows || []).map(r => ({
			medication:  r.medication  || '',
			drug_name:   r.drug_name   || r.medication || '',
			dosage_form: r.dosage_form || '',
			dosage:      r.dosage      || '',
			period:      r.period      || '',
			comment:     r.comment     || '',
		}));
		this._render_drug_cards();
	}

	_render_drug_cards() {
		const container = $('#ws-drug-cards');
		container.empty();
		this.state.drug_rows.forEach((row, idx) => {
			const summary = [row.drug_name || row.medication, row.dosage_form, row.dosage, row.period]
				.filter(Boolean).join(' · ');
			container.append(`
				<div class="drug-card">
					<span>
						<span class="drug-card-label">Rx</span>
						<span class="drug-card-text">${frappe.utils.escape_html(summary)}</span>
						${row.comment ? `<span class="drug-card-note">${frappe.utils.escape_html(row.comment)}</span>` : ''}
					</span>
					<span class="drug-card-actions">
						<button class="btn btn-xs btn-default" data-action="edit-drug"   data-idx="${idx}" title="Edit">✎</button>
						<button class="btn btn-xs btn-danger"  data-action="remove-drug" data-idx="${idx}" title="Remove">✕</button>
					</span>
				</div>
			`);
		});
		this._update_rx_counts();
	}

	async _show_drug_form(idx) {
		await this._ensure_med_data();
		const data = (idx !== null && idx !== undefined) ? (this.state.drug_rows[idx] || {}) : {};
		const md   = this._med_data;

		const med_opts  = md.medications.map(m => `<option value="${frappe.utils.escape_html(m)}">`).join('');
		const form_opts = ['', ...md.dosage_forms].map(f =>
			`<option value="${frappe.utils.escape_html(f)}">${f || '—'}</option>`).join('');
		const dos_opts  = ['', ...md.dosages].map(d =>
			`<option value="${frappe.utils.escape_html(d)}">${d || '—'}</option>`).join('');
		const dur_opts  = ['', ...md.durations].map(d =>
			`<option value="${frappe.utils.escape_html(d)}">${d || '—'}</option>`).join('');
		const action_idx   = (idx !== null && idx !== undefined) ? idx : '';
		const action_label = action_idx !== '' ? 'Update' : 'Add';

		const area = $('#ws-drug-form-area');
		area.html(`
			<datalist id="df-med-list">${med_opts}</datalist>
			<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
				<div>
					<div class="df-label">Medication</div>
					<input class="form-control form-control-sm df-medication" list="df-med-list"
						placeholder="Search or type name..."
						value="${frappe.utils.escape_html(data.drug_name || data.medication || '')}">
				</div>
				<div>
					<div class="df-label">Dosage Form</div>
					<select class="form-control form-control-sm df-dosage-form">${form_opts}</select>
				</div>
			</div>
			<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
				<div>
					<div class="df-label">Frequency</div>
					<select class="form-control form-control-sm df-dosage">${dos_opts}</select>
				</div>
				<div>
					<div class="df-label">Duration</div>
					<select class="form-control form-control-sm df-duration">${dur_opts}</select>
				</div>
			</div>
			<div style="margin-bottom:8px;">
				<div class="df-label">Note (optional)</div>
				<input class="form-control form-control-sm df-comment"
					placeholder="e.g. Take after meals"
					value="${frappe.utils.escape_html(data.comment || '')}">
			</div>
			<div style="display:flex;gap:6px;justify-content:flex-end;">
				<button class="btn btn-xs btn-default" data-action="cancel-drug-form">Cancel</button>
				<button class="btn btn-xs btn-primary" data-action="confirm-drug-form" data-idx="${action_idx}">${action_label}</button>
			</div>
		`);

		if (data.dosage_form) area.find('.df-dosage-form').val(data.dosage_form);
		if (data.dosage)      area.find('.df-dosage').val(data.dosage);
		if (data.period)      area.find('.df-duration').val(data.period);

		area.show();
		area[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}

	_confirm_drug_form(idx) {
		const area     = $('#ws-drug-form-area');
		const drug_name = area.find('.df-medication').val().trim();
		if (!drug_name) {
			frappe.show_alert({ message: 'Medication name is required', indicator: 'orange' });
			return;
		}
		const row = {
			drug_code:   drug_name,
			medication:  drug_name,
			drug_name:   drug_name,
			dosage_form: area.find('.df-dosage-form').val(),
			dosage:      area.find('.df-dosage').val(),
			period:      area.find('.df-duration').val(),
			comment:     area.find('.df-comment').val().trim(),
		};
		if (idx !== null && idx !== undefined) {
			this.state.drug_rows[idx] = row;
		} else {
			this.state.drug_rows.push(row);
		}
		area.hide().empty();
		this._render_drug_cards();
		this._update_rx_counts();
	}

	async _ensure_med_data() {
		if (this._med_data) return;
		try {
			const r = await frappe.call({ method: 'clinic_flow.api.workspace.get_medication_form_data' });
			this._med_data = r.message || { medications: [], dosage_forms: [], dosages: [], durations: [] };
		} catch (_) {
			this._med_data = { medications: [], dosage_forms: [], dosages: [], durations: [] };
		}
	}

	_update_rx_counts() {
		$('#rx-drug-count').text(this.state.drug_rows.length);
		$('#rx-lab-count').text($('#ws-lab-rows .lab-row').length);
	}

	// ── Lab rows ─────────────────────────────────────────────────────────────

	_render_lab_rows(rows) {
		$('#ws-lab-rows').empty();
		rows.forEach(row => this._add_lab_row(row));
	}

	_add_lab_row(data = {}) {
		$('#ws-lab-rows').append(`
			<div class="lab-row">
				<input class="lab-test-name" placeholder="Observation / test name"
					value="${frappe.utils.escape_html(data.lab_test_name || '')}" list="ws-obs-list">
				<button class="btn btn-xs btn-danger" data-action="remove-lab">✕</button>
			</div>
		`);
	}
}

// ── Observation Template datalist (loaded once at page load) ──────────────
(function _load_obs_templates() {
	frappe.call({
		method: 'clinic_flow.api.workspace.get_observation_templates',
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
			opt.value = typeof t === 'string' ? t : t.name;
			dl.appendChild(opt);
		});
	}).catch(() => {});
}());
