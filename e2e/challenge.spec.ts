import { expect, type Page, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { checkIn, lecturerPage, makeClass, phone, qrToken, startSession } from './support';

const sharp = createRequire(new URL('../apps/api/package.json', import.meta.url))('sharp');

let klass: Awaited<ReturnType<typeof makeClass>>;
test.beforeAll(async () => {
  klass = await makeClass('ping', ['נועה', 'איתי', 'מאיה']);
});
test.afterAll(async () => klass?.cleanup());

async function tap(student: Page, fx: number, fy: number) {
  const img = student.getByAltText('תמונת הכיתה (מטושטשת)');
  await expect(img).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const box = (await img.boundingBox())!;
  await student.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await expect(student.getByText('התקבל ✓')).toBeVisible({ timeout: 8_000 });
}

test('4c · after-class check: the lecturer starts it after the lesson ended; a student taps their seat from home', async ({ browser }) => {
  const lp = await lecturerPage(browser, klass.lecturer);
  const sessionId = await startSession(lp);
  const sp = await phone(browser, klass.students[0], 0);
  await checkIn(sp, await qrToken(lp, sessionId));

  const photo = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#d9d2c3' } }).jpeg().toBuffer();
  await lp.getByLabel('📷 צילום כיתה').setInputFiles({ name: 'class.jpg', mimeType: 'image/jpeg', buffer: photo });
  await expect(lp.getByAltText('תמונת הכיתה', { exact: true })).toBeVisible({ timeout: 20_000 });
  lp.once('dialog', (d) => d.accept());
  await lp.getByRole('button', { name: 'סיום שיעור' }).click();
  await expect(lp.getByText('הסתיים', { exact: true })).toBeVisible({ timeout: 10_000 });

  await lp.getByRole('button', { name: 'בדיקה אחרי השיעור (24 שעות)' }).click();
  await expect(lp.getByText(/בדיקה אחרי השיעור פתוחה עד/)).toBeVisible({ timeout: 8_000 });

  // Later, at home: the student's home page points to the check, and one tap on the lesson page answers it.
  await sp.goto('/');
  await sp.getByRole('link', { name: /בדיקת נוכחות/ }).click();
  await expect(sp.getByText('בדיקת נוכחות לשיעור הזה')).toBeVisible({ timeout: 10_000 });
  await tap(sp, 0.19, 0.55);
  await expect(lp.getByText(/1 תגובות/)).toBeVisible({ timeout: 8_000 });
});

test('4 · Visual Ping: a tap on an empty spot is flagged empty_seat, taps on people are not', async ({ browser }) => {
  const lp = await lecturerPage(browser, klass.lecturer);
  const sessionId = await startSession(lp);
  const phones: Page[] = [];
  for (const [i, s] of klass.students.entries()) {
    const p = await phone(browser, s, i);
    await checkIn(p, await qrToken(lp, sessionId));
    phones.push(p);
  }

  // MockProvider sees three people at x ≈ 0.19 / 0.50 / 0.81, y 0.35–0.75.
  const photo = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#d9d2c3' } }).jpeg().toBuffer();
  await lp.getByLabel('📷 צילום כיתה').setInputFiles({ name: 'class.jpg', mimeType: 'image/jpeg', buffer: photo });
  await expect(lp.getByAltText('תמונת הכיתה', { exact: true })).toBeVisible({ timeout: 20_000 });

  await lp.getByText('בדיקה ויזואלית (45 ש׳)').click();
  await tap(phones[0], 0.19, 0.55);
  await tap(phones[1], 0.5, 0.55);
  await tap(phones[2], 0.5, 0.15); // above everyone's head
  await expect(lp.getByText(/3 תגובות/)).toBeVisible({ timeout: 8_000 });

  await lp.getByText('סיום עכשיו').click();
  await expect(lp.getByText('תוצאות הבדיקה האחרונה')).toBeVisible({ timeout: 10_000 });
  const flagged = lp.locator('tr.bg-amber-50');
  await expect(flagged).toHaveCount(1);
  await expect(flagged).toContainText(klass.students[2].name);
});
