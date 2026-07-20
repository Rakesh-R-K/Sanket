export type Risk = 'alert' | 'warning' | 'watch' | 'healthy'

export interface EnterpriseRow {
  id: number; name: string; sector: string; village: string; block: string
  district: string; members: number; risk: Risk; reason_count: number
  top_reason: { text_en: string; text_hi: string } | null
}

export interface EnterpriseInput { name: string; sector: string; village: string; block: string; district: string; members: number }

export interface Reason { code: string; text_en: string; text_hi: string }
export interface Suggestion { id: number; text_en: string; text_hi: string; action_status: string }
export interface Flag {
  id: number; level: Risk; opened_at: string; status: string
  reasons: Reason[]; suggestions: Suggestion[]
}
export interface MonthPoint { month: string; income: number; expense: number; savings: number; repayment: number; net: number }
export interface ForecastPoint { month: string; net: number; income: number; expense: number }
export interface Profile extends Omit<EnterpriseRow, 'risk' | 'reason_count' | 'top_reason'> {
  history: MonthPoint[]
  forecast: { points: ForecastPoint[]; band: { month: string; lo: number; hi: number }[]; model_tag: string } | null
  loan: { principal: number; outstanding: number; emi: number; lender: string } | null
  flags: Flag[]
  recent_transactions: { type: string; amount: number; note: string; entered_at: string; source: string }[]
  interventions: { officer_note: string; logged_at: string; outcome: string }[]
  action_history: { id: number; text_en: string; text_hi: string; action_status: string; opened_at: string }[]
}
export interface Bulletin {
  sector: string; driver: string; z: number
  exposed_units: number; stressed_units: number; text: string
}
export interface DistrictRisk {
  district: string
  blocks: Record<string, { levels: Record<string, number>; sectors: Record<string, Record<string, number>> }>
  signals: { commodity: string; kind: string; magnitude_z: number; detected_at: string }[]
  kpis: { total: number; alerts: number; warnings: number }
  bulletins: Bulletin[]
}
export interface LeadTime {
  flags_with_projected_distress: number
  median_lead_days: number | null
  min_lead_days: number | null
  max_lead_days: number | null
  target_days: number
}

export interface TxnInput {
  client_id: string
  enterprise_id: number
  type: 'income' | 'expense' | 'savings' | 'loan_repayment'
  amount: number
  note: string
  entered_at: string
  source: 'manual'
}

export interface DistrictSummary { district: string; total: number; alerts: number; flagged: number }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch('/api' + path, { ...init, signal: AbortSignal.timeout(20000) })
  } catch {
    throw new Error('Could not reach the local server. Try again when it is running.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = typeof data?.detail === 'string' ? data.detail : `Request failed (${res.status}). Check the entered values.`
    throw new Error(msg)
  }
  if (data === null) throw new Error('The server returned an unreadable response.')
  return data as T
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) })
}

export const api = {
  createEnterprise: (data: EnterpriseInput) => post<{ id: number }>('/enterprises', data),
  districts: () => request<DistrictSummary[]>('/districts'),
  enterprises: (district = 'Wardha') => request<EnterpriseRow[]>(`/enterprises?district=${encodeURIComponent(district)}`),
  profile: (id: number) => request<Profile>(`/enterprises/${id}`),
  district: (district = 'Wardha') => request<DistrictRisk>(`/risk/district/${encodeURIComponent(district)}`),
  leadtime: () => request<LeadTime>('/validation/leadtime'),
  saakh: (id: number) => request<Profile & { discipline: Record<string, number | string>; generated_at: string; disclaimer_en: string }>(`/saakh/${id}`),
  shock: (key: string) => post<{ shock: string; signals: { commodity: string; kind: string; magnitude_z: number }[]; enterprises: number; flagged: number; by_level: Record<string, number>; by_sector: Record<string, number> }>(`/simulate/shock/${key}`),
  reset: () => post<{ enterprises: number }>('/admin/reset'),
  intervene: (body: { enterprise_id: number; flag_id?: number; officer_note: string; outcome?: string; resolve?: boolean }) => post('/interventions', body),
  suggestionDone: (id: number) => post(`/suggestions/${id}/done`),
  syncTxns: (txns: TxnInput[]) => post<{ synced: number; inserted: number; accepted_ids: string[] }>('/transactions/batch', txns),
}
