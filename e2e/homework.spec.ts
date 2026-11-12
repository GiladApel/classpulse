import { expect, test } from '@playwright/test';
import { checkIn, lecturerPage, makeClass, openTab, phone, qrToken, startSession } from './support';

let klass: Awaited<ReturnType<typeof makeClass>>;
test.beforeAll(async () => {
  klass = await makeClass('hw', ['שי לוי']);
});
test.afterAll(async () => klass?.cleanup());

const pdf = (name: string, text: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n% ${text}\n`) });

test('7b · homework: the lecturer publishes a PDF in the lesson; a student checks a solution and gets a per-section report', async ({ browser }) => {
  const [shai] = klass.students;
  const lp = await lecturerPage(browser, klass.lecturer);
  const sessionId = await startSession(lp);

  // Publish in the lesson's homework tab; the (mock) AI turns it into questions and sections.
  await openTab(lp, 'שיעורי בית');
  await lp.getByLabel('כותרת').fill('תרגיל 2 — Strategy');
  await lp.getByLabel('קובץ המטלה').setInputFiles(pdf('hw2.pdf', 'Homework 2'));
  await lp.getByRole('button', { name: 'פרסום' }).click();
  await expect(lp.getByRole('link', { name: /תרגיל 2 — Strategy/ })).toContainText('פתוח לבדיקה');

  // The student checks in, opens the lesson's homework and asks for feedback before handing in.
  const sp = await phone(browser, shai, 0);
  await checkIn(sp, await qrToken(lp, sessionId));
  await openTab(sp, 'שיעורי בית');
  await sp.getByRole('link', { name: /תרגיל 2 — Strategy/ }).click();
  await sp.getByText('מה בודקים בכל סעיף').click();
  await expect(sp.getByText('ציירו דיאגרמת מחלקות')).toBeVisible();
  await expect(sp.getByText('נותרו 3 מתוך 3 בדיקות')).toBeVisible();
  await sp.getByLabel('קובץ הפתרון').setInputFiles(pdf('solution.pdf', 'my solution'));

  await expect(sp.getByText('36', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(sp.getByText('נותרו 2 מתוך 3 בדיקות')).toBeVisible();
  await expect(sp.getByText('סעיפים שלא נענו:')).toBeVisible();
  await expect(sp.getByText('✗ חסרה דוגמה קונקרטית').first()).toBeVisible();
  await expect(sp.getByText('לא נענה')).toBeVisible();
  await expect(sp.getByText(/התרשים של הכיתה יוצג מ-3/)).toBeVisible();

  // The lecturer sees the student's name, checks used and score, and the chart with the name.
  await lp.getByRole('link', { name: /תרגיל 2 — Strategy/ }).click();
  await expect(lp.getByRole('row', { name: new RegExp(shai.name) })).toContainText('1/3');
  await expect(lp.getByRole('row', { name: new RegExp(shai.name) })).toContainText('36');
  await expect(lp.getByRole('list', { name: 'תרשים הכיתה' })).toContainText(shai.name);
});
