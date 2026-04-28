import { callFrappe } from "$api/client";
import type { ArrivalCandidateResponse, ArrivalCardRecord, ArrivalMarkResult, ArrivalSessionContext } from "$arrival/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSessionContext(value: unknown): value is ArrivalSessionContext {
  return isRecord(value)
    && typeof value.has_active === "boolean"
    && isRecord(value.stats)
    && typeof value.stats.arrived === "number"
    && typeof value.stats.awaiting_arrival === "number"
    && Array.isArray(value.recent_arrivals);
}

function isCardRecord(value: unknown): value is ArrivalCardRecord {
  return isRecord(value)
    && typeof value.queue_entry === "string"
    && typeof value.display_token === "string"
    && typeof value.patient_name === "string"
    && typeof value.queue_session === "string"
    && typeof value.status === "string"
    && typeof value.state_label === "string"
    && typeof value.visit_label === "string"
    && (value.print_context === undefined || (
      isRecord(value.print_context)
      && typeof value.print_context.display_token === "string"
      && typeof value.print_context.patient_name === "string"
      && typeof value.print_context.qr_svg === "string"
    ));
}

function isCandidateResponse(value: unknown): value is ArrivalCandidateResponse {
  return isRecord(value) && Array.isArray(value.candidates) && value.candidates.every(isCardRecord);
}

function isMarkResult(value: unknown): value is ArrivalMarkResult {
  return isRecord(value)
    && typeof value.status === "string"
    && typeof value.already_arrived === "boolean"
    && isCardRecord(value.result_card);
}

export async function getArrivalSessionContext(deptAbbr = "") {
  const response = await callFrappe<unknown>("clinic_flow.api.arrival.get_arrival_session_context", { dept_abbr: deptAbbr });
  if (!isSessionContext(response)) throw new Error("Arrival session context response is invalid");
  return response;
}

export async function lookupArrivalCandidate(input: { qr_code?: string; phone?: string; name_query?: string; dept_abbr?: string }) {
  const response = await callFrappe<unknown>("clinic_flow.api.arrival.lookup_arrival_candidate", input);
  if (!isCandidateResponse(response)) throw new Error("Arrival candidate response is invalid");
  return response;
}

export async function markArrived(queueEntry: string, queueSession = "") {
  const response = await callFrappe<unknown>("clinic_flow.api.arrival.mark_arrived", {
    queue_entry: queueEntry,
    queue_session: queueSession,
  });
  if (!isMarkResult(response)) throw new Error("Arrival mutation response is invalid");
  return response;
}
