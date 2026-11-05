import { expect, test } from '@playwright/test';
import { checkIn, lecturerPage, makeClass, phone, qrToken, startSession } from './support';

let klass: Awaited<ReturnType<typeof makeClass>>;
test.beforeAll(async () => {
  klass = await makeClass('lost', ['יעל']);
});
test.afterAll(async () => klass?.cleanup());

test('5b · "I\'m lost" with an optional note: the note lands in the feed anonymously', async ({ browser }) => {
  const lp = await lecturerPage(browser, klass.lecturer);
  const sessionId = await startSession(lp);
  const sp = await phone(browser, klass.students[0], 0);
  await checkIn(sp, await qrToken(lp, sessionId));

  await sp.getByRole('button', { name: '🤯 הלכתי לאיבוד' }).click();
  await expect(sp.getByText('המרצה קיבל/ה את זה ✓')).toBeVisible();
  const note = 'לא הבנתי למה Observer ולא polling';
  await sp.getByLabel('רוצים לכתוב מה לא ברור?').fill(note);
  await sp.getByRole('button', { name: 'שליחה כשאלה אנונימית' }).click();
  await expect(sp.getByText('נוסף לשאלות ✓')).toBeVisible();
  await expect(sp.getByLabel('רוצים לכתוב מה לא ברור?')).toBeHidden();

  // The lecturer sees the note in the feed, and nothing in it names the student.
  const post = lp.locator('li', { hasText: note });
  await expect(post).toBeVisible({ timeout: 5_000 });
  await expect(post).not.toContainText(klass.students[0].name);
});
