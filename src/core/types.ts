export type Origin = "demo" | "jquants" | "csv";
export type Instrument = {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  currency: string;
  lot: number;
  origin: Origin;
  watched: number;
  color: string;
};
export type Bar = {
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: number;
  receivedAt: string;
  availableAt: string;
};
export type Evaluation = {
  id: string;
  instrument_id: string;
  snapshot: string;
  question_version: string;
  model: string;
  origin: string;
  status: string;
  answer: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};
export type Answers = {
  event_type: {
    type: "choice";
    choice: string;
    probabilities: Record<string, number>;
    confidence: number;
  };
  direction: {
    type: "choice";
    choice: string;
    probabilities: Record<string, number>;
    confidence: number;
  };
  importance: { type: "score"; score: number; confidence: number };
  duplicate: { type: "noul"; noul: number };
};
export type Job = {
  id: string;
  kind: string;
  payload: string;
  state: string;
  attempts: number;
  error: string | null;
  created_at: string;
};
export type Alert = {
  id: string;
  instrument_id: string;
  type: string;
  threshold: string;
  active: number;
  triggered: number;
};
export type PaperAccount = {
  id: string;
  name: string;
  initial_cash: string;
  cash: string;
  max_allocation: string;
  stop_loss: string;
  fee_bps: string;
  slippage_bps: string;
  state: string;
  use_jev: number;
  origin: string;
  created_at: string;
};
export type Holding = { instrument_id: string; quantity: string; cost: string };
export type PaperSummary = PaperAccount & {
  holdings: Holding[];
  equity: string;
  pnl: string;
  maxDrawdown: number;
  curve: { date: string; value: number }[];
  fills: Record<string, unknown>[];
};
export type Snapshot = {
  instrument: Pick<Instrument, "id" | "name" | "symbol" | "origin">;
  asOf: string;
  document: string;
  sourceUrl: string | null;
  bars: Bar[];
  indicators: {
    sma20: number | null;
    sma60: number | null;
    change: number | null;
  };
  permission: boolean;
};
export type Bootstrap = {
  instruments: (Instrument & { bars: Bar[] })[];
  evaluations: Evaluation[];
  jobs: Job[];
  alerts: Alert[];
  alertEvents: Record<string, unknown>[];
  accounts: PaperSummary[];
  status: {
    database: string;
    mode: string;
    jev: string;
    market: string;
    lastRun: string | null;
    configured: boolean;
    usage: number;
  };
};
