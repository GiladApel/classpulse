import { useEffect, useState } from 'react';
import { api } from './api';

/** Admins are configured on the server (ADMIN_EMAILS); the page only asks whether to show the admin link. */
export function useIsAdmin(): boolean {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    api.get<{ admin: boolean }>('/me').then((r) => setAdmin(r.admin), () => {});
  }, []);
  return admin;
}
