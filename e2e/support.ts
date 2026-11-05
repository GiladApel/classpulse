import { type Browser, type BrowserContext, devices, expect, type Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import PocketBase from 'pocketbase';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => l.split(/=(.*)/s).slice(0, 2).map((s) => s.trim())),
);

export const PB_URL = 'http://127.0.0.1:8090';
export const CLASSROOM = { latitude: 32.1048, longitude: 35.2073, accuracy: 15 };
export const metersNorth = (m: number) => ({ ...CLASSROOM, latitude: CLASSROOM.latitude + m / 111_320 });
const PASSWORD = 'e2e-pass-1234';
const PHONES = [devices['iPhone 13'], devices['Pixel 7']];

// Every phone and lecturer window keeps live connections open; close them after each test so tests don't starve each other.
const opened: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((c) => c.close()));
});

export interface Person {
  id: string;
  email: string;
  name: string;
}

/** Throwaway lecturer, course and students for one spec file; `cleanup()` deletes them (records cascade with the course). */
export async function makeClass(tag: string, studentNames: string[]) {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);
  const run = `${tag}-${Date.now().toString(36)}`;
  const create = (email: string, data: Record<string, unknown>) =>
    pb.collection('users').create<Person>({ email, password: PASSWORD, passwordConfirm: PASSWORD, verified: true, ...data });

  const lecturer = await create(`lect-${run}@classpulse.test`, { name: `מרצה ${tag}`, role: 'lecturer' });
  const course = await pb.collection('courses').create({ code: 'E2E', name: `E2E ${tag}`, lecturer: lecturer.id });
  const students: Person[] = [];
  for (const [i, name] of studentNames.entries()) {
    const sid = `6${String(Date.now()).slice(-6)}${String(i).padStart(2, '0')}`;
    students.push(await create(`s${i}-${run}@classpulse.test`, { name, role: 'student', student_id: sid }));
  }

  return {
    lecturer,
    students,
    courseId: course.id,
    async cleanup() {
      await pb.collection('courses').delete(course.id).catch(() => {});
      for (const u of [lecturer, ...students]) await pb.collection('users').delete(u.id).catch(() => {});
    },
  };
}

async function login(context: BrowserContext, email: string): Promise<Page> {
  opened.push(context);
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByText('כניסת מרצה עם סיסמה').click();
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(PASSWORD);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  return page;
}

export async function lecturerPage(browser: Browser, who: Person): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, geolocation: CLASSROOM, permissions: ['geolocation'] });
  return login(context, who.email);
}

export async function phone(browser: Browser, who: Person, i: number, geolocation = metersNorth(20)): Promise<Page> {
  const context = await browser.newContext({ ...PHONES[i % PHONES.length], geolocation, permissions: ['geolocation'] });
  return login(context, who.email);
}

/** Starts a session from the lecturer home form and returns its id (the page ends on the dashboard). */
export async function startSession(page: Page, mode: 'lenient' | 'strict' = 'lenient'): Promise<string> {
  await page.locator('select[name=geofenceMode]').selectOption(mode);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(/\/dash\/\w+$/);
  return page.url().split('/').pop()!;
}

/** The token the projector would show right now. */
export const qrToken = (lecturer: Page, sessionId: string): Promise<string> =>
  lecturer.evaluate(async (id) => {
    const { token } = JSON.parse(localStorage.getItem('pocketbase_auth')!);
    return (await (await fetch(`/api/sessions/${id}/qr`, { headers: { Authorization: `Bearer ${token}` } })).json()).token;
  }, sessionId);

export async function checkIn(student: Page, token: string) {
  await student.goto(`/c/${token}`);
  await expect(student.getByText('הנוכחות נרשמה')).toBeVisible({ timeout: 15_000 });
}
