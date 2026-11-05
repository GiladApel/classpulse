// Creates (or reuses) a lecturer account and a course. Usage:
//   npm run seed -w apps/api -- <lecturer-email> <lecturer-password> "<lecturer name>" <course-code> "<course name>"
import type { RecordModel } from 'pocketbase';
import { createSuperuserClient } from '../src/infra/pb/pbClient.js';

try {
  process.loadEnvFile('../../.env');
} catch {
  // env from shell
}

const [email, password, name, code, courseName] = process.argv.slice(2);
if (!email || !password || !name || !code || !courseName) {
  console.error('Usage: seed <email> <password> "<name>" <course-code> "<course name>"');
  process.exit(1);
}

const pb = await createSuperuserClient(
  process.env.PB_URL ?? 'http://127.0.0.1:8090',
  process.env.PB_SUPERUSER_EMAIL ?? '',
  process.env.PB_SUPERUSER_PASSWORD ?? '',
);

const users = pb.collection('users');
const existing = await users.getFirstListItem(pb.filter('email = {:e}', { e: email })).catch(() => null);
const lecturer = existing
  ? await users.update(existing.id, { role: 'lecturer', name })
  : await users.create({ email, password, passwordConfirm: password, name, role: 'lecturer', verified: true });

const courses = pb.collection('courses');
const existingCourse = await courses
  .getFirstListItem(pb.filter('code = {:c} && lecturer = {:l}', { c: code, l: lecturer.id }))
  .catch(() => null);
const course = existingCourse ?? (await courses.create<RecordModel>({ code, name: courseName, lecturer: lecturer.id }));

console.log(`Lecturer ${lecturer.email} (${lecturer.id}) → course ${course.code} (${course.id})`);
