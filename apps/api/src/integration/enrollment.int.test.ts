import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Course } from '../attendance/types.js';
import { createHarness, type Harness, type TestUser } from './harness.js';

describe('Integration: roster and timetable access against real PocketBase', () => {
  let h: Harness;
  let course: Course;
  let other: RecordModel; // a second course of the same lecturer
  let s1: string;
  let enrolled: TestUser; // on the roster, never attended
  let otherCourseOnly: TestUser; // on the other course's roster
  let outsider: TestUser;

  beforeAll(async () => {
    h = await createHarness();
    course = await h.container.sessions.getCourse(h.course.id);
    other = await h.admin.collection('courses').create({ code: `INT2${h.run}`, name: 'Other', lecturer: h.lecturer.record.id });
    [enrolled, otherCourseOnly, outsider] = [
      await h.makeUser('student', h.studentNo()),
      await h.makeUser('student', h.studentNo()),
      await h.makeUser('student', h.studentNo()),
    ];
    await h.container.courses.importRoster(course, { text: `${enrolled.record.student_id} רשום\n999999998 עוד מישהו` });
    await h.container.courses.enroll(await h.container.sessions.getCourse(other.id), otherCourseOnly.record.student_id, 'אחר');
    await h.container.courses.setTimetable(course, [{ weekday: 0, starts: '10:00', ends: '12:00', room: '305' }]);

    s1 = (await h.startSession()).id;
    await h.call(h.lecturer, 'POST', `/sessions/${s1}/practice`, { question: 'למה Observer?' });
    await h.call(h.lecturer, 'POST', `/sessions/${s1}/materials`, { title: 'שקפים', url: 'https://example.com/slides' });
    const poll = (await h.call(h.lecturer, 'POST', `/sessions/${s1}/polls`, { question: 'Q', options: ['a', 'b'], open: true })).body;
    await h.call(h.lecturer, 'POST', `/polls/${poll.id}/close`);
  });

  afterAll(async () => {
    await h?.admin.collection('courses').delete(other.id).catch(() => {});
    await h?.cleanup();
  });

  const list = (u: TestUser, collection: string, filter: string) => u.pb.collection(collection).getFullList({ filter });

  it('an enrolled student who never attended reads the lecture content; others in or out of the course do not', async () => {
    const bySession = `session = "${s1}"`;
    for (const name of ['practice_questions', 'materials', 'polls']) {
      expect(await list(enrolled, name, bySession)).toHaveLength(1);
      expect(await list(otherCourseOnly, name, bySession)).toEqual([]);
      expect(await list(outsider, name, bySession)).toEqual([]);
    }
  });

  it('a student sees only their own roster row; the lecturer sees the whole roster', async () => {
    const mine = await list(enrolled, 'enrollments', `course = "${course.id}"`);
    expect(mine.map((e) => e.student_number)).toEqual([enrolled.record.student_id]);
    expect(await list(outsider, 'enrollments', `course = "${course.id}"`)).toEqual([]);
    expect(await list(h.lecturer, 'enrollments', `course = "${course.id}"`)).toHaveLength(2);
  });

  it('the timetable is visible to members and the lecturer only', async () => {
    const byCourse = `course = "${course.id}"`;
    expect((await list(enrolled, 'course_slots', byCourse)).map((s) => [s.weekday, s.starts, s.ends, s.room])).toEqual([[0, '10:00', '12:00', '305']]);
    expect(await list(h.lecturer, 'course_slots', byCourse)).toHaveLength(1);
    expect(await list(otherCourseOnly, 'course_slots', byCourse)).toEqual([]);
    expect(await list(outsider, 'course_slots', byCourse)).toEqual([]);
  });

  it('roster and timetable are written only through the API', async () => {
    await expect(
      outsider.pb.collection('enrollments').create({ course: course.id, student_number: outsider.record.student_id, added_at: new Date().toISOString() }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(h.lecturer.pb.collection('course_slots').create({ course: course.id, weekday: 1, starts: '08:00', ends: '09:00' })).rejects.toMatchObject({
      status: 403,
    });
  });
});
