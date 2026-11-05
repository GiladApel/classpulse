import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { checkIn, lecturerPage, makeClass, metersNorth, phone, qrToken, startSession } from './support';

const XLSX = createRequire(new URL('../apps/api/package.json', import.meta.url))('xlsx');

let klass: Awaited<ReturnType<typeof makeClass>>;
test.beforeAll(async () => {
  klass = await makeClass('att', ['דנה כהן', 'אבי לוי', 'רוני מזרחי', 'טל אברהם']);
});
test.afterAll(async () => klass?.cleanup());

test('1 · happy check-in appears on the dashboard within 1 s, then 6 · export', async ({ browser }) => {
  const lp = await lecturerPage(browser, klass.lecturer);
  const sessionId = await startSession(lp);
  await expect(lp.getByText('עדיין אין נרשמים')).toBeVisible();

  const [dana] = klass.students;
  const sp = await phone(browser, dana, 0);
  await checkIn(sp, await qrToken(lp, sessionId));
  await expect(lp.getByRole('cell', { name: dana.name })).toBeVisible({ timeout: 1_000 });

  // 6 · the Excel export lists every present student.
  const download = lp.waitForEvent('download');
  await lp.getByRole('button', { name: 'Excel' }).click();
  const file = await (await download).path();
  const sheet = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(sheet.Sheets[sheet.SheetNames[0]], { header: 1 }) as unknown[][];
  expect(rows.flat()).toContain(dana.name);
});

test('2 · an expired token is rejected with a clear message', async ({ browser }) => {
  const lp = await lecturerPage(browser, klass.lecturer);
  const sessionId = await startSession(lp);
  const token = await qrToken(lp, sessionId);
  await lp.waitForTimeout(7_000); // QR_WINDOW_SEC=3 → accepted for at most 6 s

  const sp = await phone(browser, klass.students[1], 1);
  await sp.goto(`/c/${token}`);
  await expect(sp.getByText('הנוכחות לא נרשמה')).toBeVisible({ timeout: 15_000 });
  await expect(sp.getByText('הקוד פג תוקף')).toBeVisible();

  await sp.goto('/c/not-a-real-token');
  await expect(sp.getByText('קוד לא תקין')).toBeVisible({ timeout: 15_000 });
});

test('3 · strict geofence rejects 300 m away; lenient accepts and flags', async ({ browser }) => {
  const lp = await lecturerPage(browser, klass.lecturer);
  const strictId = await startSession(lp, 'strict');
  const far = await phone(browser, klass.students[2], 0, metersNorth(300));
  await far.goto(`/c/${await qrToken(lp, strictId)}`);
  await expect(far.getByText(/נראה שאתם במרחק \d+ מטר מהכיתה/)).toBeVisible({ timeout: 15_000 });

  await lp.goto('/dash');
  const lenientId = await startSession(lp, 'lenient');
  const far2 = await phone(browser, klass.students[3], 1, metersNorth(300));
  await checkIn(far2, await qrToken(lp, lenientId));
  await expect(far2.getByText('לא הצלחנו לאמת שאתם בכיתה לפי המיקום')).toBeVisible();
  await expect(lp.getByRole('row', { name: new RegExp(klass.students[3].name) })).toContainText(/\d+ מ׳ ⚠/);
});
