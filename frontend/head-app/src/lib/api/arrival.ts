import { callFrappe } from "$api/client";
import type { ArrivalCandidateResponse, ArrivalMarkResult, ArrivalSessionContext } from "$arrival/types";

export function getArrivalSessionContext(deptAbbr = "") {
  return callFrappe<ArrivalSessionContext>("clinic_flow.api.arrival.get_arrival_session_context", { dept_abbr: deptAbbr });
}

export function lookupArrivalCandidate(input: { qr_code?: string; phone?: string; name_query?: string; dept_abbr?: string }) {
  return callFrappe<ArrivalCandidateResponse>("clinic_flow.api.arrival.lookup_arrival_candidate", input);
}

export function markArrived(queueEntry: string, queueSession = "") {
  return callFrappe<ArrivalMarkResult>("clinic_flow.api.arrival.mark_arrived", {
    queue_entry: queueEntry,
    queue_session: queueSession,
  });
}
