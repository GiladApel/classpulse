import { expect, test } from '@playwright/test';
import { checkIn, lecturerPage, makeClass, phone, qrToken, startSession } from './support';

let klass: Awaited<ReturnType<typeof makeClass>>;
test.beforeAll(async () => {
  klass = await makeClass('lect', ['שירן', 'עידו']);
});
test.afterAll(async () => klass?.cleanup());

test('lecture page: after the lecture ends, a student who missed it sees the answer, materials and practice', async ({ browser }) => {
  const [shiran, ido] = klass.students;
  const lp = await lecturerPage(browser, klass.lecturer);

  // Ido attends an earlier lecture only, so he is in the course but misses the next one.
  const earlier = await startSession(lp);
  await checkIn(await phone(browser, ido, 1), await qrToken(lp, earlier));
  await lp.goto('/dash');
  const sessionId = await startSession(lp);
  const sp = await phone(browser, shiran, 0);
  await checkIn(sp, await qrToken(lp, sessionId));
  await sp.getByPlaceholder('שאלה, הערה או הצעה למרצה…').fill('מה ההבדל בין Strategy ל-State?');
  await sp.getByRole('button', { name: 'שליחה', exact: true }).click();

  // Live poll: only from a slide (camera or gallery); the AI drafts 3 and the lecturer opens one.
  await lp.getByLabel('🖼️ העלאת תמונה').setInputFiles({ name: 'slide.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71]) });
  await lp.getByRole('button', { name: /איזה תבנית עיצוב/ }).click();
  await lp.getByRole('button', { name: 'פתיחת הסקר' }).click();
  await expect(lp.getByText('פתוח · 0 הצבעות')).toBeVisible();
  await expect(sp.getByText('איזה תבנית עיצוב מפרידה בין יצירת אובייקט לשימוש בו?')).toBeVisible();

  lp.once('dialog', (d) => d.accept());
  await lp.getByRole('button', { name: 'סיום שיעור' }).click();
  await expect(lp.getByText('הסתיים')).toBeVisible();

  // After the end: a written answer, a practice question and a link.
  await lp.getByRole('button', { name: 'כתיבת תשובה' }).click();
  await lp.getByLabel('תשובה', { exact: true }).fill('Strategy בוחר אלגוריתם; State משנה התנהגות לפי מצב.');
  await lp.getByRole('button', { name: 'שמירת תשובה' }).click();
  await lp.getByLabel('שאלה לתרגול').fill('איזו תבנית מתאימה להחלפת אלגוריתם בזמן ריצה?');
  await lp.getByPlaceholder('תשובה 1', { exact: true }).fill('Strategy');
  await lp.getByPlaceholder('תשובה 2', { exact: true }).fill('Singleton');
  await lp.getByLabel('תשובה 1 נכונה').check();
  await lp.getByRole('button', { name: 'הוספת שאלה' }).click();
  await expect(lp.getByText('✓Strategy · Singleton')).toBeVisible();
  // Practice drafts from the slide deck: 8 come back checked; drop one and add the rest.
  await lp.getByLabel('קובץ ההרצאה').setInputFiles({ name: 'lecture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await expect(lp.getByRole('checkbox')).toHaveCount(8);
  await lp.getByRole('checkbox').first().uncheck();
  await lp.getByRole('button', { name: 'הוספת המסומנות (7)' }).click();
  await expect(lp.getByRole('button', { name: 'מחיקה' })).toHaveCount(8); // 1 manual + 7 from the deck
  await expect(lp.getByText('מה תפקידו של ה-Subject בתבנית Observer?')).toHaveCount(0);
  await lp.getByLabel('קישור').fill('https://refactoring.guru/design-patterns/strategy');
  await lp.getByRole('button', { name: 'הוספת קישור' }).click();

  // Ido finds the lecture from his course page.
  const ip = await phone(browser, ido, 1);
  await ip.goto(`/course/${klass.courseId}`);
  await ip.getByRole('link', { name: /E2E · הרצאה|הרצאה/ }).first().click();
  await expect(ip).toHaveURL(new RegExp(`/lecture/${sessionId}$`));
  await expect(ip.getByText('Strategy בוחר אלגוריתם; State משנה התנהגות לפי מצב.')).toBeVisible();
  await expect(ip.getByRole('link', { name: /refactoring\.guru/ })).toBeVisible();
  await expect(ip.getByPlaceholder('שאלה, הערה או הצעה למרצה…')).toHaveCount(0); // he missed it: read-only

  await ip.getByRole('button', { name: 'Singleton' }).click();
  await expect(ip.getByText('לא נכון — התשובה הנכונה מסומנת בירוק.')).toBeVisible();
  await expect(ip.getByRole('button', { name: 'Strategy ✓' })).toBeDisabled();
});
