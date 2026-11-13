import { expect, test } from '@playwright/test';
import { checkIn, lecturerPage, lessonId, makeClass, openTab, phone, qrToken } from './support';

let klass: Awaited<ReturnType<typeof makeClass>>;
test.beforeAll(async () => {
  klass = await makeClass('enr', ['יעל אורן', 'נועה בר', 'עומר גל'], { admin: true });
});
test.afterAll(async () => klass?.cleanup());

test('10 · a new lecturer sets up a course; an enrolled student finds the live lesson at home and checks in', async ({ browser }) => {
  const [yael, noa, omer] = klass.students;

  // The admin makes Omer a lecturer.
  const admin = await lecturerPage(browser, klass.lecturer);
  await admin.getByRole('link', { name: 'ניהול משתמשים' }).click();
  await admin.getByLabel('חיפוש משתמש').fill(omer.name);
  await expect(admin.getByRole('listitem')).toHaveCount(1);
  await admin.getByRole('button', { name: 'הפיכה למרצה' }).click();
  await expect(admin.getByRole('listitem').getByText('מרצה', { exact: true })).toBeVisible();

  // Omer creates his course, uploads the roster (Yael only) and sets a meeting for today.
  const lp = await lecturerPage(browser, omer);
  await expect(lp.getByText('עוד אין לך קורסים')).toBeVisible();
  await lp.getByLabel('קוד קורס').fill('OOP');
  await lp.getByLabel('שם הקורס').fill('תכנות מונחה עצמים');
  await lp.getByRole('button', { name: 'קורס חדש' }).click();
  await expect(lp.getByRole('tab', { name: 'סטודנטים' })).toHaveAttribute('aria-selected', 'true');
  await lp.getByLabel('קובץ רשימה').setInputFiles({ name: 'roster.csv', mimeType: 'text/csv', buffer: Buffer.from(`ת.ז.,שם\n${yael.student_id},${yael.name}\n`) });
  await expect(lp.getByText('נוספו 1, עודכנו 0')).toBeVisible();
  await expect(lp.getByRole('row', { name: new RegExp(yael.student_id) })).toContainText(`✓ ${yael.name}`);

  await openTab(lp, 'מערכת שעות');
  await lp.getByRole('button', { name: '+ מפגש שבועי' }).click();
  await lp.getByLabel('יום', { exact: true }).selectOption(String(new Date().getDay()));
  await lp.getByLabel('משעה').fill('00:00');
  await lp.getByLabel('עד שעה').fill('23:59');
  await lp.getByLabel('חדר', { exact: true }).fill('305');
  await lp.getByRole('button', { name: 'שמירת מערכת השעות' }).click();
  await expect(lp.getByRole('button', { name: '✓ נשמר' })).toBeVisible();

  // Yael signs in once and finds the course and its timetable at home.
  const yp = await phone(browser, yael, 0);
  await expect(yp.getByRole('link', { name: /OOP · תכנות מונחה עצמים/ })).toBeVisible();
  await expect(yp.getByText('חדר 305').first()).toBeVisible(); // the phone layout comes first

  // The lecturer starts the lesson from the "now" card on his home screen.
  await lp.goto('/');
  await lp.getByRole('button', { name: 'התחלת השיעור עכשיו' }).click();
  await lp.waitForURL(/\/lesson\/\w+/);
  const sessionId = lessonId(lp);

  // Yael's home shows the live lesson; it opens on the forum, where she can ask and vote even before checking in.
  await expect(yp.getByText('שיעור פעיל עכשיו')).toBeVisible({ timeout: 10_000 });
  await yp.getByRole('link', { name: /כניסה לשיעור/ }).click();
  await expect(yp.getByText('אפשר לשאול ולהצביע גם מהבית', { exact: false })).toBeVisible();
  await expect(yp.getByRole('button', { name: '🤯 הלכתי לאיבוד' })).toBeVisible();
  await yp.getByPlaceholder('שאלה, הערה או הצעה למרצה…').fill('שאלה מהבית');
  await yp.getByRole('button', { name: 'שליחה', exact: true }).click();
  await expect(yp.getByText('שאלה מהבית', { exact: true })).toBeVisible({ timeout: 10_000 });
  await checkIn(yp, await qrToken(lp, sessionId));
  await expect(yp.getByRole('button', { name: '🤯 הלכתי לאיבוד' })).toBeVisible();

  // Noa is in the room but not on the roster: she checks in, and the lecturer adds her with one tap.
  const np = await phone(browser, noa, 1);
  await checkIn(np, await qrToken(lp, sessionId));
  await expect(lp.getByRole('heading', { name: 'רשימת נוכחות (2)' })).toBeVisible();
  await lp.getByRole('button', { name: 'לא ברשימה · הוספה' }).click();
  await expect(lp.getByRole('button', { name: 'לא ברשימה · הוספה' })).toHaveCount(0);

  // After the lesson the lecturer adds a review question; Yael reads it in the materials tab.
  lp.once('dialog', (d) => d.accept());
  await lp.getByRole('button', { name: 'סיום שיעור' }).click();
  await openTab(lp, 'חומרים');
  await lp.getByLabel('שאלה לתרגול').fill('מה ההבדל בין מחלקה לאובייקט?');
  await lp.getByRole('button', { name: 'פרסום שאלה' }).click();
  await openTab(yp, 'חומרים');
  await expect(yp.getByText('מה ההבדל בין מחלקה לאובייקט?')).toBeVisible();
});
