import { expect, test } from '@playwright/test';
import { checkIn, lecturerPage, makeClass, openTab, phone, qrToken, startSession } from './support';

let klass: Awaited<ReturnType<typeof makeClass>>;
test.beforeAll(async () => {
  klass = await makeClass('hw', ['שי לוי']);
});
test.afterAll(async () => klass?.cleanup());

const pdf = (name: string, text: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n% ${text}\n`) });

test('7b · homework: the lecturer publishes a PDF with notes; a student gets feedback twice, hands in, and the lecturer sees the AI grade', async ({ browser }) => {
  const [shai] = klass.students;
  const lp = await lecturerPage(browser, klass.lecturer);
  const sessionId = await startSession(lp);

  // Publish in the lesson's homework tab; the (mock) AI builds the rubric, which only the lecturer sees.
  await openTab(lp, 'שיעורי בית');
  await lp.getByLabel('כותרת').fill('תרגיל 2 — Strategy');
  await lp.getByLabel('קובץ המטלה').setInputFiles(pdf('hw2.pdf', 'Homework 2'));
  await lp.getByLabel(/הנחיות ל-AI למחוון/).fill('להחמיר על דיאגרמת המחלקות');
  await lp.getByRole('button', { name: 'פרסום' }).click();
  await expect(lp.getByRole('link', { name: /תרגיל 2 — Strategy/ })).toContainText('פתוח להגשה');
  await lp.getByRole('link', { name: /תרגיל 2 — Strategy/ }).click();
  await expect(lp.getByText('ממשק Strategy · שתי מימושים · Context')).toBeVisible();
  await lp.getByText('תשובה מצופה').nth(1).click();
  await expect(lp.getByText('Context מחזיק הפניה לממשק')).toBeVisible();
  await expect(lp.getByLabel('הנחיות ל-AI למחוון')).toHaveValue('להחמיר על דיאגרמת המחלקות');

  // The student sees the homework PDF, not the rubric, and gets feedback twice.
  const sp = await phone(browser, shai, 0);
  await checkIn(sp, await qrToken(lp, sessionId));
  await openTab(sp, 'שיעורי בית');
  await sp.getByRole('link', { name: /תרגיל 2 — Strategy/ }).click();
  await expect(sp.getByText('נותרו 2 מתוך 2 בדיקות', { exact: false })).toBeVisible();
  await expect(sp.getByText('ממשק Strategy')).toHaveCount(0);
  await sp.getByLabel('קובץ הפתרון').setInputFiles(pdf('solution.pdf', 'my solution'));

  await expect(sp.getByText('36', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(sp.getByText('נותרו 1 מתוך 2 בדיקות', { exact: false })).toBeVisible();
  await expect(sp.getByText('סעיפים שלא נענו:')).toBeVisible();
  await expect(sp.getByText('✗ חסרה דוגמה קונקרטית').first()).toBeVisible();
  await expect(sp.getByText('ציירו דיאגרמת מחלקות')).toBeVisible();
  await expect(sp.getByText('Context מחזיק')).toHaveCount(0);

  await sp.getByLabel('קובץ הפתרון').setInputFiles(pdf('solution2.pdf', 'my better solution'));
  await expect(sp.getByText('נותרו 0 מתוך 2 בדיקות', { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(sp.getByText('ניצלתם את הבדיקות')).toBeVisible();

  // The final hand-in, after a confirmation.
  sp.once('dialog', (d) => d.accept());
  await sp.getByLabel('קובץ ההגשה').setInputFiles(pdf('final.pdf', 'my final solution'));
  await expect(sp.getByText(/✓ הוגש ב-/)).toBeVisible({ timeout: 15_000 });
  await expect(sp.getByText('המטלה הוגשה — אין עוד בדיקות.', { exact: false })).toBeVisible();
  await expect(sp.getByRole('button', { name: '📎 קובץ 1' })).toBeVisible();

  // The lecturer sees the hand-in, the AI grade, the chart with the name, and the rubric is now locked.
  await lp.reload();
  const row = lp.getByRole('row', { name: new RegExp(shai.name) });
  await expect(row).toContainText('2/2');
  await expect(row).toContainText('36', { timeout: 15_000 });
  await expect(lp.getByRole('list', { name: 'תרשים הכיתה' })).toContainText(shai.name);
  await expect(lp.getByText('המחוון נעול', { exact: false })).toBeVisible();
  await row.getByRole('link', { name: shai.name }).click();
  await expect(lp.getByText('הערכת ה-AI להגשה')).toBeVisible();
  await expect(lp.getByRole('button', { name: '📎 קובץ 1' })).toBeVisible();
});
