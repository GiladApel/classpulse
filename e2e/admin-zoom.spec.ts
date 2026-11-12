import { expect, test } from '@playwright/test';
import { checkIn, lecturerPage, makeClass, phone, qrToken, startSession } from './support';

let klass: Awaited<ReturnType<typeof makeClass>>;
test.beforeAll(async () => {
  klass = await makeClass('adm', ['יעל אורן', 'נועה בר', 'עומר גל'], { admin: true });
});
test.afterAll(async () => klass?.cleanup());

const clipboard = (page: import('@playwright/test').Page) => page.evaluate(() => navigator.clipboard.readText());

test('9 · the admin promotes a student, who creates a course; Zoom and classroom attendance are listed apart', async ({ browser }) => {
  const [yael, noa, omer] = klass.students;

  // The admin makes Omer a lecturer.
  const admin = await lecturerPage(browser, klass.lecturer);
  await admin.getByRole('link', { name: 'ניהול משתמשים' }).click();
  await admin.getByLabel('חיפוש משתמש').fill(omer.name);
  await expect(admin.getByRole('listitem')).toHaveCount(1);
  await admin.getByRole('button', { name: 'הפיכה למרצה' }).click();
  await expect(admin.getByRole('listitem').getByText('מרצה', { exact: true })).toBeVisible();

  // Omer signs in, lands on the lecturer home, creates his course and starts a lecture.
  const lp = await lecturerPage(browser, omer);
  await expect(lp.getByText('עוד אין לך קורסים')).toBeVisible();
  await lp.getByLabel('קוד קורס').fill('OOP');
  await lp.getByLabel('שם הקורס').fill('תכנות מונחה עצמים');
  await lp.getByRole('button', { name: 'יצירה' }).click();
  await expect(lp.locator('select[name=courseId]')).toContainText('OOP · תכנות מונחה עצמים');
  const sessionId = await startSession(lp);

  // Yael joins from the Zoom link the lecturer copied; Noa scans the QR in the room.
  await lp.getByRole('button', { name: '📋 העתקת קישור לזום' }).click();
  await expect(lp.getByRole('button', { name: /הועתק/ })).toBeVisible();
  const zoomUrl = new URL(await clipboard(lp));
  expect(zoomUrl.pathname).toMatch(/^\/z\//);

  const yp = await phone(browser, yael, 0);
  await yp.goto(zoomUrl.pathname);
  await expect(yp.getByText('נרשמת כנוכח/ת מזום')).toBeVisible({ timeout: 15_000 });
  const np = await phone(browser, noa, 1);
  await checkIn(np, await qrToken(lp, sessionId));

  await expect(lp.getByRole('heading', { name: 'בכיתה (1)' })).toBeVisible();
  await expect(lp.getByRole('heading', { name: 'מזום (1)' })).toBeVisible();
  await expect(lp.getByText('1 בכיתה · 1 מזום')).toBeVisible();

  // After the lecture the lecturer shares the lecture page; the Zoom-only student opens it.
  lp.once('dialog', (d) => d.accept());
  await lp.getByRole('button', { name: 'סיום שיעור' }).click();
  await expect(lp.getByRole('button', { name: '📋 העתקת קישור לזום' })).toHaveCount(0);
  await lp.getByRole('button', { name: '📋 העתקת קישור לדף השיעור' }).click();
  const lectureUrl = new URL(await clipboard(lp));
  expect(lectureUrl.pathname).toBe(`/lecture/${sessionId}`);
  await lp.getByLabel('שאלה לתרגול').fill('מה ההבדל בין מחלקה לאובייקט?');
  await lp.getByRole('button', { name: 'פרסום שאלה' }).click();
  await yp.goto(lectureUrl.pathname);
  await expect(yp.getByText('מה ההבדל בין מחלקה לאובייקט?')).toBeVisible();
});
