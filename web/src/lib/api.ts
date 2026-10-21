export type Status = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface Client {
  id: number; name: string; email: string | null; company: string | null;
  address: string | null; notes: string | null; supports_count?: number;
}
export interface Support {
  id: number; client_id: number; client_name: string; client_phone: string; title: string;
  description: string | null; scheduled_at: string; duration_min: number; status: Status;
  source: 'web' | 'whatsapp';
}
export interface WaStatus { state: 'starting' | 'qr' | 'connected' | 'disconnected' | 'mismatch'; qr: string | null; me: string | null; expected: string; notice: string | null }
export interface Settings { groqApiKeySet: boolean; groqApiKeyHint: string; groqChatModel: string; groqSttModel: string; waPhone: string; allowedPhones: string[]; reminderEnabled: boolean; reminderMinutes: number }
export interface WaActivity { id: number; phone: string; type: string; outcome: string | null; body: string; created_at: string }
export interface MonthSummary { month: string; total: number; completed: number }

const TOKEN_KEY = 'agenda_token';
export const auth = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = auth.get();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && path !== '/auth/login') {
    auth.clear();
    window.location.assign('/login');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error ?? 'Error de red');
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  login: (user: string, password: string) => request<{ token: string }>('POST', '/auth/login', { user, password }),
  clients: (q = '') => request<Client[]>('GET', `/clients?q=${encodeURIComponent(q)}`),
  client: (id: number) => request<Client>('GET', `/clients/${id}`),
  saveClient: (c: { name: string; email?: string | null; company?: string | null; address?: string | null; notes?: string | null }, id?: number) =>
    id ? request<Client>('PUT', `/clients/${id}`, c) : request<Client>('POST', '/clients', c),
  deleteClient: (id: number) => request<void>('DELETE', `/clients/${id}`),
  clientHistory: (id: number, month: string) => request<Support[]>('GET', `/clients/${id}/history?month=${month}`),
  clientMonths: (id: number) => request<MonthSummary[]>('GET', `/clients/${id}/history/months`),
  upcoming: () => request<Support[]>('GET', '/supports/upcoming'),
  supports: (month: string) => request<Support[]>('GET', `/supports?month=${month}`),
  createSupport: (s: { clientId: number; title: string; description?: string; scheduledAt: string; durationMin?: number; status?: 'pending' | 'completed' }) =>
    request<Support>('POST', '/supports', s),
  updateSupport: (id: number, s: { title?: string; description?: string; scheduledAt?: string; durationMin?: number }) =>
    request<Support>('PUT', `/supports/${id}`, s),
  setStatus: (id: number, status: Status) => request<Support>('PATCH', `/supports/${id}/status`, { status }),
  settings: () => request<Settings>('GET', '/settings'),
  saveSettings: (s: Omit<Settings, 'groqApiKeySet' | 'groqApiKeyHint'> & { groqApiKey?: string }) => request<Settings>('PUT', '/settings', s),
  waStatus: () => request<WaStatus>('GET', '/whatsapp/status'),
  waActivity: () => request<WaActivity[]>('GET', '/whatsapp/activity'),
  waLogout: () => request<void>('POST', '/whatsapp/logout'),
  deleteSupport: (id: number) => request<void>('DELETE', `/supports/${id}`),
};
