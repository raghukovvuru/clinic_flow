export type SearchMode = "qr_code" | "phone" | "name_query";
export type ResultState = "idle" | "loading" | "no-match" | "multiple" | "pre-confirm" | "already-arrived" | "success" | "error";

export interface ArrivalCardRecord {
  name: string;
  queue_entry: string;
  display_token: string;
  patient_name: string;
  queue_session: string;
  status: string;
  state_label: string;
  visit_label: string;
  print_context: {
    queue_entry: string;
    display_token: string;
    patient_name: string;
    qr_svg: string;
  };
}

export interface ArrivalSessionContext {
  has_active: boolean;
  stats: { arrived: number; awaiting_arrival: number };
  current_session: null | { name: string; session_name: string; status: string; start_time: string };
  next_session: null | { name: string; session_name: string; status: string; start_time: string };
  recent_arrivals: Array<{ queue_entry: string; display_token: string; patient_name: string; arrived_at: string; status: string }>;
}

export interface ArrivalCandidateResponse {
  candidates: ArrivalCardRecord[];
  error?: string;
}

export interface ArrivalMarkResult {
  status: string;
  already_arrived: boolean;
  result_card: ArrivalCardRecord;
}
