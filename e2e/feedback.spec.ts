import { expect, type Page, test } from '@playwright/test';
import { checkIn, lecturerPage, makeClass, phone, qrToken, startSession } from './support';

let klass: Awaited<ReturnType<typeof makeClass>>;
test.beforeAll(async () => {
  klass = await makeClass('fb', ['מור', 'גל', 'רון']);
});
test.afterAll(async () => klass?.cleanup());

test('feedback appears on open phones when the lecture ends; the lecturer sees it anonymously from 3 answers', async ({ browser }) => {
  const lp = await lecturerPage(browser, klass.lecturer);
  const sessionId = await startSession(lp);
  const phones: Page[] = [];
  for (const [i, s] of klass.students.entries()) {
    const p = await phone(browser, s, i);
    await checkIn(p, await qrToken(lp, sessionId));
    phones.push(p);
  }
  await expect(phones[0].getByRole('button', { name: '🤯 הלכתי לאיבוד' })).toBeVisible();

  lp.once('dialog', (d) => d.accept());
  await lp.getByRole('button', { name: 'סיום שיעור' }).click();

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
  const card = lp.getByRole('heading', { name: /משוב על השיעור/ }).locator('xpath=../..');
  await expect(card).toContainText('החלק על Observer היה מהיר');
  for (const s of klass.students) await expect(card).not.toContainText(s.name);
});
