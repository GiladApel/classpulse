import { expect, test } from '@playwright/test';
import { checkIn, lecturerPage, makeClass, openTab, phone, qrToken, startSession } from './support';

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
  await openTab(lp, 'פורום');
  await lp.getByLabel('🖼️ העלאת תמונה').setInputFiles({ name: 'slide.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71]) });
  await lp.getByRole('button', { name: /איזה תבנית עיצוב/ }).click();
  await lp.getByRole('button', { name: 'פתיחת הסקר' }).click();
  await expect(lp.getByText('פתוח · 0 הצבעות')).toBeVisible();
  await expect(sp.getByText('איזה תבנית עיצוב מפרידה בין יצירת אובייקט לשימוש בו?')).toBeVisible();

  lp.once('dialog', (d) => d.accept());
  await lp.getByRole('button', { name: 'סיום שיעור' }).click();
  await expect(lp.getByText('הסתיים', { exact: true })).toBeVisible();

  // After the end: a written answer, a practice question and a link.
  await lp.getByRole('button', { name: 'כתיבת תשובה' }).click();
  await lp.getByLabel('תשובה', { exact: true }).fill('Strategy בוחר אלגוריתם; State משנה התנהגות לפי מצב.');
  await lp.getByRole('button', { name: 'שמירת תשובה' }).click();
  await openTab(lp, 'חומרים');
  await lp.getByLabel('שאלה לתרגול').fill('מתי נעדיף Strategy על פני if/else?');
  await lp.getByRole('button', { name: 'פרסום שאלה' }).click();
  await expect(lp.getByText('1. מתי נעדיף Strategy על פני if/else?')).toBeVisible();
  // Open questions drafted from the slide deck: 8 come back checked; drop one and publish the rest.
  await lp.getByLabel('קובץ ההרצאה').setInputFiles({ name: 'lecture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await expect(lp.getByRole('checkbox')).toHaveCount(8);
  await lp.getByRole('checkbox').first().uncheck();
  await lp.getByRole('button', { name: 'פרסום המסומנות (7)' }).click();
  await expect(lp.getByRole('checkbox')).toHaveCount(0);
  // One button opens the file picker and uploads right away, titled by the file name.
  await lp.getByLabel('קובץ', { exact: true }).setInputFiles({ name: 'slides.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await expect(lp.getByText('📄 slides.pdf')).toBeVisible();
  await lp.getByLabel('קישור').fill('https://refactoring.guru/design-patterns/strategy');
  await lp.getByRole('button', { name: 'הוספת קישור' }).click();

  // Ido finds the lecture from his course page.
  const ip = await phone(browser, ido, 1);
  await ip.goto(`/course/${klass.courseId}`);
  // The earlier lesson is still running, so it is listed first; Ido opens the one he missed.
  await ip.getByRole('link', { name: /הרצאה 2/ }).click();
  await expect(ip).toHaveURL(new RegExp(`/lesson/${sessionId}`));
  // A past lesson opens on its materials.
  await expect(ip.getByRole('link', { name: /refactoring\.guru/ })).toBeVisible();
  await expect(ip.getByRole('listitem').filter({ hasText: 'מתי נעדיף Strategy על פני if/else?' })).toBeVisible();
  await expect(ip.getByText('במה שונה State מ-Strategy, למרות שהמבנה שלהן כמעט זהה?')).toBeVisible();
  await expect(ip.getByText('הסבירו מה תפקידו של ה-Subject בתבנית Observer')).toHaveCount(0); // unticked
  await expect(ip.getByRole('button', { name: /slides\.pdf/ })).toBeVisible();

  await openTab(ip, 'פורום');
  await expect(ip.getByText('Strategy בוחר אלגוריתם; State משנה התנהגות לפי מצב.')).toBeVisible();
  await expect(ip.getByPlaceholder('שאלה, הערה או הצעה למרצה…')).toHaveCount(0); // he missed it: read-only
});
