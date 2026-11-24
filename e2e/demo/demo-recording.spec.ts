import { expect, type Page, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { checkIn, lecturerPage, makeClass, openTab, phone, qrToken, startSession } from '../support';

// The backup demo video (docs/10-demo-plan.md §4): the demo timeline played by a lecturer window and two phones on the
// mock AI. Run with `npm run demo:video`; one .webm per window lands in demo-video/ (not committed).
const sharp = createRequire(new URL('../../apps/api/package.json', import.meta.url))('sharp');
const pause = (p: Page, ms = 1500) => p.waitForTimeout(ms);

let klass: Awaited<ReturnType<typeof makeClass>>;
test.beforeAll(async () => {
  klass = await makeClass('demo', ['דנה כהן', 'אבי לוי']);
});
test.afterAll(async () => klass?.cleanup());

async function tapSeat(student: Page, fx: number, fy: number) {
  const img = student.getByAltText('תמונת הכיתה (מטושטשת)');
  await expect(img).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const box = (await img.boundingBox())!;
  await student.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await expect(student.getByText('התקבל ✓')).toBeVisible({ timeout: 8_000 });
}

test('demo: check-in, anti-fraud, I am lost, a poll from a slide, the end of the lecture', async ({ browser }) => {
  test.setTimeout(5 * 60_000);

  // 1. Check in: the lecturer starts the lesson; two phones scan the QR and the list fills live.
  const lp = await lecturerPage(browser, klass.lecturer);
  const sessionId = await startSession(lp);
  await pause(lp);
  const [dana, avi] = [await phone(browser, klass.students[0], 0), await phone(browser, klass.students[1], 1)];
  await checkIn(dana, await qrToken(lp, sessionId));
  await checkIn(avi, await qrToken(lp, sessionId));
  await expect(lp.getByRole('heading', { name: 'רשימת נוכחות (2)' })).toBeVisible({ timeout: 15_000 });
  await pause(lp, 2500);

  // 2. Anti-fraud: a class photo, then a Visual Ping; Avi taps an empty spot and is flagged.
  const photo = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#d9d2c3' } }).jpeg().toBuffer();
  await lp.getByLabel('📷 צילום כיתה').setInputFiles({ name: 'class.jpg', mimeType: 'image/jpeg', buffer: photo });
  await expect(lp.getByAltText('תמונת הכיתה', { exact: true })).toBeVisible({ timeout: 20_000 });
  await pause(lp);
  await lp.getByText('בדיקה ויזואלית (45 ש׳)').click();
  await tapSeat(dana, 0.19, 0.55);
  await tapSeat(avi, 0.5, 0.15);
  await pause(lp, 2500);
  await lp.getByText('סיום עכשיו').click();
  await expect(lp.locator('tr.bg-amber-50')).toHaveCount(1, { timeout: 10_000 });
  await pause(lp, 3000);

  // 3. I'm lost, with an anonymous note that lands in the forum.
  await dana.getByRole('button', { name: '🤯 הלכתי לאיבוד' }).click();
  await dana.getByLabel('רוצים לכתוב מה לא ברור?').fill('לא הבנתי את ההבדל בין Strategy ל-State');
  await dana.getByRole('button', { name: 'שליחה כשאלה אנונימית' }).click();
  await openTab(lp, 'פורום');
  await expect(lp.getByText('לא הבנתי את ההבדל בין Strategy ל-State')).toBeVisible({ timeout: 10_000 });
  await pause(lp, 2500);

  // 4. A poll from a slide: the AI drafts, the lecturer opens one with the 2-minute timer, the phones vote, then reveal.
  await lp.getByLabel('🖼️ העלאת תמונה').setInputFiles({ name: 'slide.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71]) });
  await lp.getByRole('button', { name: /איזה תבנית עיצוב/ }).click();
  await pause(lp);
  await lp.getByRole('button', { name: 'פתיחת הסקר' }).click();
  for (const p of [dana, avi]) await expect(p.getByText('איזה תבנית עיצוב מפרידה בין יצירת אובייקט לשימוש בו?')).toBeVisible({ timeout: 10_000 });
  await dana.getByRole('button', { name: 'Factory' }).click();
  await avi.getByRole('button', { name: 'Observer' }).click();
  await pause(lp, 2500);
  await lp.getByRole('button', { name: 'סגירה וחשיפת התשובה' }).click();
  await pause(lp, 3000);

  // 5. End of the lecture: the phones offer the anonymous comment.
  lp.once('dialog', (d) => d.accept());
  await lp.getByRole('button', { name: 'סיום שיעור' }).click();
  await expect(dana.getByText('איך היה השיעור?')).toBeVisible({ timeout: 10_000 });
  await pause(dana, 3000);
});
