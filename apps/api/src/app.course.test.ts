import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { makeTestPorts, USERS } from './test/testContainer.js';

describe('HTTP: course setup (roster and weekly timetable)', () => {
  let app: ReturnType<typeof createApp>;

  const call = async (who: keyof typeof USERS, method: string, path: string, body?: object | FormData) => {
    const form = body instanceof FormData;
    const res = await app.request(path, {
      method,
      headers: { Authorization: `Bearer ${who}`, ...(form || body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  beforeEach(() => {
    app = createApp(makeTestPorts().container);
  });

  it('a lecturer creates a course once per code; students cannot', async () => {
    const created = await call('lect', 'POST', '/courses', { code: 'OOP', name: 'תכנות מונחה עצמים' });
    expect(created).toMatchObject({ status: 201, body: { code: 'OOP', name: 'תכנות מונחה עצמים' } });
    expect((await call('lect', 'POST', '/courses', { code: 'OOP', name: 'x' })).body.code).toBe('COURSE_EXISTS');
    expect((await call('dana', 'POST', '/courses', { code: 'X', name: 'x' })).status).toBe(403);
    const s = await call('lect', 'POST', '/sessions', { courseId: created.body.id, title: 'L1', geofenceMode: 'lenient', geofenceRadiusM: 50 });
    expect(s.status).toBe(201);
  });

  it("roster: the course's lecturer uploads a pasted list or a CSV file; nobody else can", async () => {
    const pasted = await call('lect', 'POST', '/courses/c1/roster', { text: '111111111 דנה כהן\n222222222 אבי\nבלי מספר 7' });
    expect(pasted).toMatchObject({ status: 200, body: { added: 2, updated: 0, skipped: [{ line: 3, reason: 'NO_EMAIL_OR_ID' }] } });

    const form = new FormData();
    form.set('file', new File(['ת.ז.,שם\n444444444,רינה\n111111111,דנה כהן\n'], 'roster.csv', { type: 'text/csv' }));
    expect((await call('lect', 'POST', '/courses/c1/roster', form)).body).toEqual({ added: 1, updated: 0, skipped: [] });

    expect((await call('dana', 'POST', '/courses/c1/roster', { text: '333333333 x' })).status).toBe(403);
    expect((await call('boss', 'POST', '/courses/c1/roster', { text: '333333333 x' })).status).toBe(403);
    expect((await call('lect', 'POST', '/courses/c1/roster', new FormData())).status).toBe(400);
    expect((await call('lect', 'POST', '/courses/c1/roster', { text: 'רק שמות' })).body.code).toBe('EMPTY_ROSTER');
    expect((await call('lect', 'POST', '/courses/nope/roster', { text: '333333333 x' })).status).toBe(404);
  });

  it('one student is added (by email or ID), has their email fixed, and is removed', async () => {
    const added = await call('lect', 'POST', '/courses/c1/enrollments', { email: 'avi@x.com', name: 'אבי' });
    expect(added).toMatchObject({ status: 201, body: { email: 'avi@x.com', studentNumber: '', name: 'אבי' } });
    expect((await call('lect', 'POST', '/courses/c1/enrollments', { studentNumber: '22' })).body.code).toBe('INVALID_STUDENT_NUMBER');
    expect((await call('lect', 'POST', '/courses/c1/enrollments', { email: 'avi@' })).body.code).toBe('INVALID_EMAIL');
    expect((await call('dana', 'POST', '/courses/c1/enrollments', { email: 'x@x.com' })).status).toBe(403);

    // The lecturer fixes the email to the one the student signs in with; that student is linked at once.
    const fixed = await call('lect', 'PUT', `/courses/c1/enrollments/${added.body.id}`, { email: 'new@x.com' });
    expect(fixed).toMatchObject({ status: 200, body: { email: 'new@x.com' } });
    expect(fixed.body.studentNumber).toMatch(/^\d{12}$/);
    expect((await call('dana', 'PUT', `/courses/c1/enrollments/${added.body.id}`, { email: 'd@x.com' })).status).toBe(403);
    expect((await call('lect', 'PUT', `/courses/c1/enrollments/${added.body.id}`, {})).status).toBe(400);

    expect((await call('lect', 'DELETE', `/courses/c1/enrollments/${added.body.id}`)).body).toEqual({ ok: true });
    expect((await call('lect', 'DELETE', `/courses/c1/enrollments/${added.body.id}`)).status).toBe(404);
  });

  it('after sign-in a student is linked to every roster row with their email; a lecturer is not', async () => {
    await call('lect', 'POST', '/courses/c1/enrollments', { email: 'NEW@x.com' });
    const linked = await call('fresh', 'POST', '/me/link');
    expect(linked.status).toBe(200);
    expect(linked.body).toMatchObject({ courses: 1 });
    expect(linked.body.studentNumber).toMatch(/^\d{12}$/);
    expect((await call('fresh', 'POST', '/me/link')).body).toEqual(linked.body);
    expect((await call('dana', 'POST', '/me/link')).body).toEqual({ studentNumber: '111111111', courses: 0 });
    expect((await call('lect', 'POST', '/me/link')).body).toEqual({ studentNumber: '', courses: 0 });
  });

  it('timetable: the lecturer sets the weekly slots and term dates; bad input is refused', async () => {
    const slots = [
      { weekday: 0, starts: '10:00', ends: '12:00', room: '305' },
      { weekday: 3, starts: '08:30', ends: '10:00' },
    ];
    const saved = await call('lect', 'PUT', '/courses/c1/timetable', { slots, termStart: '2026-10-25', termEnd: '2027-01-22' });
    expect(saved.status).toBe(200);
    expect(saved.body.slots.map((s: { weekday: number; starts: string; room: string }) => [s.weekday, s.starts, s.room])).toEqual([
      [0, '10:00', '305'],
      [3, '08:30', ''],
    ]);

    expect((await call('lect', 'PUT', '/courses/c1/timetable', { slots: [{ weekday: 0, starts: '10:00', ends: '11:00' }, { weekday: 0, starts: '10:30', ends: '12:00' }] })).body.code).toBe('TIMETABLE_OVERLAP');
    expect((await call('lect', 'PUT', '/courses/c1/timetable', { slots: [{ weekday: 9, starts: '10:00', ends: '11:00' }] })).status).toBe(400);
    expect((await call('lect', 'PUT', '/courses/c1/timetable', { slots: 'x' })).status).toBe(400);
    expect((await call('lect', 'PUT', '/courses/c1/timetable', { slots: [], termStart: 'not a date' })).status).toBe(400);
    expect((await call('dana', 'PUT', '/courses/c1/timetable', { slots: [] })).status).toBe(403);
  });
});
