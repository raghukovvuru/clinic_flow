# Admission And Queue Model Design Outline

Date: 2026-05-01

## Purpose

This outline captures the current design direction for Clinic Flow's outpatient pediatrics admission and queue operations model. It is a working design outline, not an implementation plan.

The goal is to replace the manual register's chaotic behavior with a controlled operational model while preserving the practical value of patient-facing tokens.

## Core Direction

The design direction is a state-first, token-backed model.

Queue Entry state and operational rules are the authority. Token numbers remain stable patient-facing admission/reference identifiers and default ordering references, but they are not an unconditional doctor-order promise.

```text
Queue Entry state + operational rules = operational authority
Token number = stable patient-facing identity and default order reference
```

## Admission Lifecycle

Both phone and walk-in admissions are treated as advance admissions.

```text
Booked -> Arrived -> Called -> Ready Near Doctor -> With Doctor -> Completed
```

State meanings:

| State | Meaning |
|---|---|
| Booked | Admission granted, token/slip/QR issued, patient not physically present |
| Arrived | Patient physically returned and was marked at the arrival counter |
| Called | Reception called patient to the desk |
| Ready Near Doctor | Reception, payment, and weight handling are complete; doctor can call |
| With Doctor | Consultation is active |
| Completed | Consultation is done |

Arrival records physical presence only. It does not make the patient doctor-eligible. Reception completion remains the only active path to Ready Near Doctor.

## Channels

Initial channels:

```text
phone
walkin
```

Future channel:

```text
web
```

Web should be modeled as a separate channel from the start of the design, even if implementation comes later. Strategy profiles may group phone and web into remote capacity where appropriate.

Current channel assumptions:

| Channel | Behavior |
|---|---|
| Phone | Opens before the session date and does not book same-day |
| Walk-in | Opens early on the session date; patients physically come to book, leave, then return during their report window |
| Web | Future self-service channel with separate policy needs |

## Token Model

Tokens remain important, but they are not the whole queue model.

Decisions:

| Question | Direction |
|---|---|
| Fixed token board | No |
| Token generation | Dynamic |
| Token sequence | Sequential `max(token_number) + 1` |
| Token reuse | Never reuse issued token numbers |
| Token meaning | Admission/reference identity plus default order reference |
| Token guarantee | Conditional order, not absolute doctor order |

Token numbers should not be treated as fixed slots or as an unconditional promise that a lower token will always see the doctor before every higher token.

Recommended patient-facing meaning:

```text
Your token is your admission/reference number. Queue order depends on arrival, reception completion, emergencies, and clinic flow.
```

## Capacity Model

The primary bottleneck is doctor time, not token count.

Healthcare schedule `maximum_appointments` should be treated as a baseline planning input, not as a fixed token count.

Capacity layers:

| Layer | Role |
|---|---|
| Healthcare schedule maximum | Baseline planning input |
| Weighted doctor-time horizon | Primary normal admission stop rule |
| Session end plus allowed overrun | Defines normal service horizon |
| High hard safety ceiling | Prevents runaway booking caused by bad defaults or pressure |
| Special overflow | Audited exception |
| Emergency | Bypasses normal capacity |

Normal admissions should stop when the next booking would push the expected doctor window beyond the configured service horizon. A high hard ceiling should still exist as a safety guardrail.

## Report Windows

The system should become window-aware while keeping Queue Session as the primary booking container.

```text
Queue Session
  -> report windows
      -> Queue Entries
```

Report windows do not need to be standalone DocTypes initially. They should be stored as snapshots on Queue Entry.

Recommended Queue Entry fields:

```text
report_window_start
report_window_end
```

Decisions:

| Question | Direction |
|---|---|
| Store report window | Yes, on Queue Entry |
| Mutability | Stable unless explicit reschedule/re-notification |
| Window size | Fixed configurable intervals, such as 15 or 30 minutes |
| Patient display | Show report window prominently |
| `report_by_time` | Keep mostly internal for planning and late-risk rules |
| Doctor ETA | Broad secondary estimate only |

Report windows are patient-facing commitments. Live ETA recalculation should not silently change them. A deliberate reschedule/re-notification action should be required to change a patient's report window.

## ETA Contract

The design separates booking forecast from live operational ETA.

| ETA Type | Purpose |
|---|---|
| Booking forecast | Initial patient guidance and report window assignment |
| Live ETA | Internal operational recalculation as the session progresses |

Patient-facing communication should prioritize the report window.

Example:

```text
Token: PD-042
Report window: 10:00-10:30
Expected doctor window: around 10:45-11:15
Note: Queue order may change based on arrival, reception completion, emergencies, and clinic flow.
```

The expected doctor window should be broad and clearly approximate. It should not be phrased as an exact promise.

## Ready Near Doctor Buffer

The existing Ready Near Doctor status is an operational buffer between reception completion and doctor call.

The new report-window model should feed this buffer, not replace it.

Decisions:

| Question | Direction |
|---|---|
| Report window purpose | Feed Ready Near Doctor buffer |
| Buffer target | Actively maintain target during live operations |
| Buffer metric | Weighted expected doctor minutes, not simple patient count |
| Config | Separate patient report safety from Ready Near Doctor staging target |
| Reception call order | Earliest eligible `queue_position` first |
| Early arrivals | Process opportunistically only if the buffer needs it |

The backend should recommend reception calls to keep enough completed work staged near the doctor. It should not automatically move patients without staff action.

## Reception And Arrival Load

Booking-time report-window assignment and live reception processing are separate concerns.

| Stage | Question | Control |
|---|---|---|
| Booking/report assignment | How many families should be invited to a window? | Report-window assignment limits |
| Live reception | Which arrived patient should be called next? | Arrived-only reception queue |

Reception should process only arrived patients. Non-arrivals should not block reception.

However, report-window assignment should avoid inviting too many patients into the same window. Non-arrivals are expected, so the model may eventually support overbooking factors.

Potential future metrics:

```text
target_arrivals_per_window
max_assigned_per_window
```

## Patient-Type Smoothing

Patient type and load class should improve predictability without creating hard public queues.

Relevant concepts:

```text
patient_type: new / review
load_class: non_review_load / review_load
```

Decision: use patient type as backend smoothing, not as hard blocks.

| Model | Direction |
|---|---|
| Hard review/new blocks | Not recommended |
| Mixed dynamic queue | Good baseline |
| Soft patient-type smoothing | Recommended |

Smoothing should only choose among already acceptable windows. It should not push a patient later only to perfect the mix.

Recommended ranking hierarchy:

```text
1. Channel strategy
2. Doctor-time horizon
3. Report-window crowding
4. Earliest acceptable report window
5. Patient-type smoothing as tie-breaker
```

Receptionists may see neutral window health labels such as Balanced, Heavy, Light, or Prefer Review. They should not see rigid labels such as Review Block or New Patient Block.

## Channel Strategy Profiles

The clinic wants to gradually shift demand from morning walk-in toward phone and later web. Channel allocation, report-window behavior, and messaging must therefore be configurable.

Recommended scope:

```text
Global default strategy profile
+ optional Queue Session override
```

Possible profiles:

| Profile | Purpose |
|---|---|
| walkin_protected | Early behavior favors same-day walk-ins |
| balanced | More even channel distribution |
| phone_preferred | Encourages phone bookings |
| web_first | Future self-service-heavy model |

Profiles should control:

| Area | Examples |
|---|---|
| Channel allocation | Phone/walk-in/web shares |
| Report-window behavior | Early/mid/late channel bias |
| Release rules | When protected capacity becomes shared |
| Cutoffs | Phone end time, walk-in start/end time |
| Messaging | Patient-facing disclaimers and wording |

## Emergency Model

Emergency remains a first-class bypass.

| Rule | Direction |
|---|---|
| Token | Same session sequence and Service Point prefix |
| Capacity | Bypasses normal capacity |
| State | Immediately doctor-eligible |
| Queue | Automatic priority before normal patients |
| Prefix | No separate `EMR` prefix |

Emergency urgency is conveyed by status and UX, not token prefix.

## Special Model

Special is not emergency.

| Rule | Direction |
|---|---|
| Admission | Normal booking unless overflow is explicitly authorized |
| Public display | Do not expose special status |
| Reception | Backend may recommend expedited handling within guardrails |
| Doctor | Explicit Call Next Special override |
| Audit | Required for special and overflow actions |

Special handling must remain auditable and must not silently become emergency behavior.

## Learning From Data

Data learning is useful but should be treated as a later branch.

Decision: learning should recommend configuration changes, not silently alter policy.

Initial learning dimensions:

```text
channel + time-of-day window
```

Recommended learning scope:

| Question | Direction |
|---|---|
| Scope | Service Point-level with clinic-wide fallback |
| Threshold | 100 bookings or 10 comparable session-days |
| UX | Admin report first |
| Applying recommendations | Apply to draft strategy profile, not directly live |

## Later Gap Review Outline

Use this sequence for the detailed design review:

1. Terminology: confirm exact meaning of token number, queue position, report window, report-by time, predicted doctor time, and Ready Near Doctor.
2. Admission rules: define when phone, walk-in, and web can book, and what each booking creates.
3. Token semantics: validate dynamic sequential tokens, no reuse, cancellations, no-shows, and patient communication.
4. Capacity rules: define doctor-time horizon, allowed overrun, hard safety ceiling, special overflow, and emergency bypass.
5. Report-window assignment: define window generation, channel strategy influence, and patient-type smoothing.
6. ETA contract: separate stable patient-facing report windows from live operational ETA.
7. Arrival and late rules: define early arrival, on-time arrival, late arrival, no-arrival, grace, and queue-position consequences.
8. Reception buffer: define backend recommendations for maintaining the weighted Ready Near Doctor buffer.
9. Doctor queue: reconfirm emergency first, then Ready Near Doctor by queue position, with special explicit override.
10. Special handling: ensure special does not leak to public display or bypass emergency/reception rules unless explicitly designed.
11. Data learning: review recommendations, confidence, admin approval, and draft profile application.
12. Edge cases: review paused doctor, late doctor start, emergency burst, payment failure, no-response, pushed-to-end return, duplicate booking, fee-validity expiry, and review-to-new conversion.

## Open Questions For Later

- Should `queue_position` diverge from `token_number` only after explicit events, or may report-window assignment set them differently at booking time?
- What exact fields should be added for report windows, reschedule audit, and channel strategy selection?
- Should strategy profiles be a new DocType or initially live inside Slot Partition Config?
- How should same-day walk-in release and phone cutoff rules be represented once web is introduced?
- How should patient-facing print/SMS templates differ by strategy profile and channel?
- What is the minimal first implementation slice that improves operations without overbuilding the learning/reporting branch?
