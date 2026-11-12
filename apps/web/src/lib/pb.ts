import PocketBase from 'pocketbase';
import { useEffect, useState } from 'react';

export const pb = new PocketBase(import.meta.env.VITE_PB_URL ?? 'http://127.0.0.1:8090');
pb.autoCancellation(false);

// A role changed by the admin reaches an open app on its next load, not only after signing in again.
if (pb.authStore.isValid) pb.collection('users').authRefresh().catch(() => {});

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  student_id: string;
  role: '' | 'student' | 'lecturer';
}

export const currentUser = (): UserRecord | null =>
  pb.authStore.isValid ? (pb.authStore.record as unknown as UserRecord) : null;

export function useUser(): UserRecord | null {
  const [user, setUser] = useState(currentUser);
  useEffect(() => pb.authStore.onChange(() => setUser(currentUser())), []);
  return user;
}

/** Live session status: the student's page learns the lecture ended the moment the lecturer ends it. */
export function useSessionActive(sessionId: string | undefined): boolean {
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!sessionId) return;
    const col = pb.collection('sessions');
    col.getOne(sessionId).then((s) => setActive(s.status === 'active'), () => {});
    const unsubscribe = col.subscribe(sessionId, ({ record }) => setActive(record.status === 'active'));
    return () => {
      unsubscribe.then((fn) => fn()).catch(() => {});
    };
  }, [sessionId]);
  return active;
}
