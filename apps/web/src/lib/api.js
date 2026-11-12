const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiRequest(path, { method = 'GET', body, signal, headers = {} } = {}) {
  let response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch {
    throw new ApiError('Cannot reach the BalanceVault API. Check that the backend is running.', 0, 'API_UNREACHABLE');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('The API returned an unreadable response.', response.status, 'INVALID_RESPONSE');
  }

  if (!response.ok || payload.success !== true) {
    throw new ApiError(
      payload.error?.message ?? 'The request could not be completed.',
      response.status,
      payload.error?.code,
      payload.error?.details,
    );
  }

  return payload.data;
}

export const authApi = {
  register: (body) => apiRequest('/api/auth/register', { method: 'POST', body }),
  login: (body) => apiRequest('/api/auth/login', { method: 'POST', body }),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),
  me: () => apiRequest('/api/auth/me'),
};

export const onboardingApi = {
  submit: (body) => apiRequest('/api/onboarding', { method: 'POST', body }),
  mine: () => apiRequest('/api/onboarding/me'),
  mineById: (requestId) => apiRequest(`/api/onboarding/${encodeURIComponent(requestId)}`),
  adminList: (status) => apiRequest(`/api/admin/onboarding${status ? `?status=${status}` : ''}`),
  adminGet: (requestId) => apiRequest(`/api/admin/onboarding/${encodeURIComponent(requestId)}`),
  review: (requestId, body) => apiRequest(`/api/admin/onboarding/${encodeURIComponent(requestId)}/review`, {
    method: 'PUT',
    body,
  }),
};

function queryString(values) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== '' && value !== undefined && value !== null) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const dashboardApi = {
  user: () => apiRequest('/api/dashboard/me'),
  admin: () => apiRequest('/api/admin/dashboard'),
};

export const usersApi = {
  me: () => apiRequest('/api/users/me'),
  updateMe: (body) => apiRequest('/api/users/me', { method: 'PUT', body }),
  adminList: (params) => apiRequest(`/api/admin/users${queryString(params)}`),
  adminGet: (userId) => apiRequest(`/api/admin/users/${encodeURIComponent(userId)}`),
  adminUpdate: (userId, body) => apiRequest(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'PUT', body }),
};

export const accountsApi = {
  mine: () => apiRequest('/api/accounts'),
  mineById: (accountId) => apiRequest(`/api/accounts/${encodeURIComponent(accountId)}`),
  mineTransactions: (accountId) => apiRequest(`/api/accounts/${encodeURIComponent(accountId)}/transactions`),
  transfer: (accountId, body, idempotencyKey) => apiRequest(`/api/accounts/${encodeURIComponent(accountId)}/transfers`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  }),
  adminList: (params) => apiRequest(`/api/admin/accounts${queryString(params)}`),
  adminGet: (accountId) => apiRequest(`/api/admin/accounts/${encodeURIComponent(accountId)}`),
  adminCreateForUser: (userId, body) => apiRequest(`/api/admin/users/${encodeURIComponent(userId)}/accounts`, { method: 'POST', body }),
  adminUpdateStatus: (accountId, body) => apiRequest(`/api/admin/accounts/${encodeURIComponent(accountId)}/status`, { method: 'PUT', body }),
  adminDeposit: (accountId, body, idempotencyKey) => apiRequest(`/api/admin/accounts/${encodeURIComponent(accountId)}/deposits`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  }),
};

export const auditApi = {
  adminList: (params) => apiRequest(`/api/admin/audit-logs${queryString(params)}`),
};

export const transactionApi = {
  adminList: (params) => apiRequest(`/api/admin/transactions${queryString(params)}`),
};