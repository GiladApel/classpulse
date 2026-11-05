import PocketBase from 'pocketbase';
import { useEffect, useState } from 'react';

export const pb = new PocketBase(import.meta.env.VITE_PB_URL ?? 'http://127.0.0.1:8090');
pb.autoCancellation(false);

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
