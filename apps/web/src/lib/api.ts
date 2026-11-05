import { pb } from './pb';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, method: string, body?: unknown): Promise<Response> {
  const isForm = body instanceof FormData;
  const isBlob = body instanceof Blob;
  const type: Record<string, string> = isForm ? {} : { 'Content-Type': isBlob ? 'application/octet-stream' : 'application/json' };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...type, Authorization: `Bearer ${pb.authStore.token}` },
    body: body === undefined ? undefined : isForm || isBlob ? body : JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new ApiError(res.status, e.code ?? `HTTP_${res.status}`, e.message ?? res.statusText);
  }
  return res;
}

export const api = {
  get: async <T>(path: string) => (await request(path, 'GET')).json() as Promise<T>,
  post: async <T>(path: string, body?: unknown) => (await request(path, 'POST', body ?? {})).json() as Promise<T>,
  put: async <T>(path: string, body: Blob) => (await request(path, 'PUT', body)).json() as Promise<T>,
  del: async <T>(path: string) => (await request(path, 'DELETE')).json() as Promise<T>,
  upload: async <T>(path: string, form: FormData) => (await request(path, 'POST', form)).json() as Promise<T>,
  /** Downloads a file response, or returns the JSON body when the server answers with a link. */
  async download(path: string): Promise<{ url?: string }> {
    const res = await request(path, 'GET');
    if (res.headers.get('content-type')?.includes('application/json')) return res.json();
    const name = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get('content-disposition') ?? '')?.[1];
    const href = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href, download: name ? decodeURIComponent(name) : 'export' });
    a.click();
    URL.revokeObjectURL(href);
    return {};
  },
};

export interface RecordDto {
  id: string;
  sessionId?: string;
  studentNumber: string;
  studentName: string;
  checkedInAt: string;
  method: 'qr' | 'manual';
  distanceM: number | null;
  geoFlag: boolean;
  status: 'present' | 'flagged' | 'removed';
  note: string;
}

export interface SessionDto {
  id: string;
  courseId: string;
  title: string;
  status: 'active' | 'ended';
  startedAt: string;
}
