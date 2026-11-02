const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const request = async (token?: string) => {
    const headers = new Headers(init?.headers);
    if (init?.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  };
  let response = await request(sessionStorage.getItem('accessToken') ?? undefined);
  if (response.status === 401 && sessionStorage.getItem('refreshToken') &&
      !['/auth/login', '/auth/register', '/auth/refresh'].includes(path)) {
    const refreshed = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: sessionStorage.getItem('refreshToken') })
    });
    if (refreshed.ok) {
      const tokens = await refreshed.json() as { accessToken: string; refreshToken: string };
      sessionStorage.setItem('accessToken', tokens.accessToken);
      sessionStorage.setItem('refreshToken', tokens.refreshToken);
      response = await request(tokens.accessToken);
    } else {
      sessionStorage.clear();
    }
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; details?: Record<string, string[]> } | null;
    throw new Error(body?.error ?? `Falha na solicitação (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function uploadRegistrationFile(file: File, uploadType: 'studentPhoto' | 'signedFormPdf', registrationId?: string) {
  const presign = await apiRequest<{ uploadUrl: string; key: string; registrationId: string }>('/uploads/registration-presign', {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size, uploadType, registrationId })
  });
  const uploadResponse = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file
  });
  if (!uploadResponse.ok) throw new Error(`Não foi possível enviar ${file.name}.`);
  return presign;
}

export { apiBaseUrl };
