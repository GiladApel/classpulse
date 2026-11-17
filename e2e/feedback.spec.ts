import { expect, type Page, test } from '@playwright/test';
import { apiAs, checkIn, lecturerPage, makeClass, openTab, phone, qrToken, startSession } from './support';

let klass: Awaited<ReturnType<typeof makeClass>>;
test.beforeAll(async () => {
  klass = await makeClass('fb', ['מור', 'גל', 'רון', 'נטע']);
});
test.afterAll(async () => klass?.cleanup());

test('comments appear on open phones when the lecture ends; a member who missed it comments too; the lecturer sees them anonymously and exports them', async ({ browser }) => {
  const lp = await lecturerPage(browser, klass.lecturer);
  const sessionId = await startSession(lp);
  const [present, absent] = [klass.students.slice(0, 3), klass.students[3]];
  // Netta is on the roster but never comes to class.
  expect((await apiAs(lp, 'POST', `/courses/${klass.courseId}/enrollments`, { studentNumber: absent.student_id, name: absent.name })).status).toBe(201);
  const phones: Page[] = [];
  for (const [i, s] of present.entries()) {
    const p = await phone(browser, s, i);
    await checkIn(p, await qrToken(lp, sessionId));
    phones.push(p);
  }
  await expect(phones[0].getByRole('button', { name: '🤯 הלכתי לאיבוד' })).toBeVisible();

  lp.once('dialog', (d) => d.accept());
  await lp.getByRole('button', { name: 'סיום שיעור' }).click();
  await openTab(lp, 'פורום');

  // No reload: the phones learn about the end through realtime.
  for (const p of phones) {
    await expect(p.getByText('איך היה השיעור?')).toBeVisible({ timeout: 5_000 });
    await expect(p.getByText('המשוב אנונימי')).toBeVisible();
    await expect(p.getByRole('button', { name: '🤯 הלכתי לאיבוד' })).toHaveCount(0);
  }

  const send = async (p: Page, option: string, comment = '') => {
    await p.getByRole('button', { name: option }).click();
    if (comment) await p.getByLabel('פירוט').fill(comment);
    await p.getByRole('button', { name: 'שליחת משוב' }).click();
    await expect(p.getByText('תודה על המשוב!')).toBeVisible();
  };
  await send(phones[0], 'מהיר מדי', 'החלק על Observer היה מהיר');
  await send(phones[1], 'מהיר מדי');

  await lp.reload();
  await expect(lp.getByText('התוצאות יוצגו מ-3 תשובות')).toBeVisible();
  await send(phones[2], 'ברור ובקצב טוב');

  await lp.getByRole('button', { name: 'רענון' }).click();
  await expect(lp.getByText('(3 תשובות · אנונימי)')).toBeVisible();
  await expect(lp.getByText('החלק על Observer היה מהיר')).toBeVisible();
  const card = lp.getByRole('heading', { name: /הערות על השיעור/ }).locator('xpath=../..');
  await expect(card).toContainText('החלק על Observer היה מהיר');
  for (const s of klass.students) await expect(card).not.toContainText(s.name);

  // The member who missed the lecture opens it later and leaves a comment.
  const np = await phone(browser, absent, 3);
  await np.goto(`/lesson/${sessionId}?tab=forum`);
  await expect(np.getByText('איך היה השיעור?')).toBeVisible({ timeout: 10_000 });
  await send(np, 'החומר לא היה ברור', 'צפיתי בהקלטה, חסרה דוגמה');
  await lp.getByRole('button', { name: 'רענון' }).click();
  await expect(lp.getByText('(4 תשובות · אנונימי)')).toBeVisible();

  // Export: an anonymous spreadsheet of the comments.
  const download = lp.waitForEvent('download');
  await lp.getByRole('button', { name: 'CSV' }).last().click();
  const file = await download;
  expect(file.suggestedFilename()).toContain('הערות');
  const text = (await (await file.createReadStream()).toArray()).join('');
  expect(text).toContain('צפיתי בהקלטה, חסרה דוגמה');
  for (const s of klass.students) expect(text).not.toContain(s.name);
});
