import PocketBase from 'pocketbase';

export interface UserIdentity {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'lecturer';
  studentNumber: string;
}

export async function createSuperuserClient(url: string, email: string, password: string): Promise<PocketBase> {
  const pb = new PocketBase(url);
  // The SDK cancels concurrent duplicate requests by default — fatal for a server handling many students at once.
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(email, password, { autoRefreshThreshold: 30 * 60 });
  return pb;
}

/** Resolves a client's PB auth token to a user by asking PB to refresh it (validates signature + expiry). */
export async function resolveUser(url: string, token: string): Promise<UserIdentity | null> {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  pb.authStore.save(token);
  try {
    const { record } = await pb.collection('users').authRefresh();
    return {
      id: record.id,
      name: record.name ?? '',
      email: record.email ?? '',
      role: record.role === 'lecturer' ? 'lecturer' : 'student',
      studentNumber: record.student_id ?? '',
    };
  } catch {
    return null;
  }
}
