import { beforeEach, describe, expect, it } from 'vitest';
import type { ManagedUser } from '../admin/types.js';
import { FixedClock } from '../infra/Clock.js';
import { InMemoryRepository } from '../infra/InMemoryRepository.js';
import { InMemoryAttendanceRepository } from '../infra/memory/InMemoryAttendanceRepository.js';
import { InMemoryCourseRepository } from '../infra/memory/InMemoryCourseRepository.js';
import { InMemoryCourseSlotRepository, InMemoryEnrollmentRepository } from '../infra/memory/InMemoryEnrollmentRepositories.js';
import { InMemoryUserRepository } from '../infra/memory/InMemoryUserRepository.js';
import { makeSession, T0 } from '../test/fixtures.js';
import { CourseService, MAX_SLOTS } from './CourseService.js';
import { RosterParser } from './RosterParser.js';
import { StudentLinker } from './StudentLinker.js';
import type { Course, Session } from './types.js';

describe('CourseService', () => {
  let courses: InMemoryCourseRepository;
  let attendance: InMemoryAttendanceRepository;
  let slots: InMemoryCourseSlotRepository;
  let people: ManagedUser[];
  let service: CourseService;
  let course: Course;
  let sessionId: string;

  const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => e.code);

  beforeEach(async () => {
    courses = new InMemoryCourseRepository();
    const sessions = new InMemoryRepository<Session>();
    attendance = new InMemoryAttendanceRepository(sessions);
    slots = new InMemoryCourseSlotRepository();
    people = [];
    const enrollments = new InMemoryEnrollmentRepository();
    const linker = new StudentLinker(enrollments, new InMemoryUserRepository(people), () => '000000000777');
    service = new CourseService(courses, enrollments, slots, attendance, new RosterParser(), linker, new FixedClock(T0));
    course = await service.create('lect1', 'I2SE', 'הנדסת תוכנה');
    sessionId = (await sessions.create(makeSession({ courseId: course.id }))).id;
  });

  it('creates a course once per code and lecturer', async () => {
    expect(await code(service.create('lect1', 'I2SE', 'x'))).toBe('COURSE_EXISTS');
    expect((await service.create('lect2', 'I2SE', 'x')).lecturerId).toBe('lect2');
  });

  it('imports a roster: adds new students, updates changed names, keeps the rest, reports skipped rows', async () => {
    expect(await service.importRoster(course, { text: '123456789 דנה כהן\n222222222 אבי' })).toEqual({ added: 2, updated: 0, skipped: [] });
    const again = await service.importRoster(course, { text: '123456789 דנה כהן-לוי\n222222222\n333333333 רינה\nבלי מספר 1' });
    expect(again).toMatchObject({ added: 1, updated: 1, skipped: [{ line: 4, reason: 'NO_EMAIL_OR_ID' }] });
    expect((await service.roster(course.id)).map((e) => [e.studentNumber, e.name])).toEqual([
      ['222222222', 'אבי'],
      ['123456789', 'דנה כהן-לוי'],
      ['333333333', 'רינה'],
    ]);
    expect(await code(service.importRoster(course, { text: 'רק שמות\nבלי מספרים' }))).toBe('EMPTY_ROSTER');
  });

  it('enrolls one student idempotently by email or by key, rejects bad input, and removes a student', async () => {
    const first = await service.enroll(course, { email: ' Noa@X.com ', name: ' נועה ' });
    expect(first).toMatchObject({ email: 'noa@x.com', studentNumber: '', name: 'נועה', addedAt: T0 });
    expect((await service.enroll(course, { email: 'noa@x.com' })).id).toBe(first.id);
    // "Add" next to a check-in passes the student's key: a 9-digit ID or a generated 12-digit key.
    expect((await service.enroll(course, { studentNumber: '000000000123', name: 'גיל' })).studentNumber).toBe('000000000123');
    expect(await code(service.enroll(course, { studentNumber: '4444' }))).toBe('INVALID_STUDENT_NUMBER');
    expect(await code(service.enroll(course, { email: 'noa@' }))).toBe('INVALID_EMAIL');
    expect(await code(service.enroll(course, {}))).toBe('INVALID_EMAIL');
    await service.unenroll(course, first.id);
    expect((await service.roster(course.id)).map((e) => e.name)).toEqual(['גיל']);
    expect(await code(service.unenroll(course, first.id))).toBe('NOT_FOUND');
  });

  it('an imported email row is linked at once when that student has already signed in; the others wait', async () => {
    people.push({ id: 'u1', name: 'דנה', email: 'dana@x.com', studentNumber: '', role: 'student' });
    expect(await service.importRoster(course, { text: 'מייל שם\ndana@x.com דנה\navi@x.com אבי' })).toMatchObject({ added: 2, updated: 0 });
    expect((await service.roster(course.id)).map((e) => [e.email, e.studentNumber])).toEqual([
      ['avi@x.com', ''],
      ['dana@x.com', '000000000777'],
    ]);
    expect(await service.isMember(course.id, '000000000777')).toBe(true);
    // A later file that adds emails to an ID-only row fills them in.
    await service.importRoster(course, { text: '123456789 רון' });
    expect(await service.importRoster(course, { text: '123456789 ron@x.com רון' })).toMatchObject({ added: 0, updated: 1 });
  });

  it('fixing a mistyped email links the row to the student who signed in with the right one', async () => {
    people.push({ id: 'u1', name: 'דנה', email: 'dana@x.com', studentNumber: '987654321', role: 'student' });
    const row = await service.enroll(course, { email: 'dnaa@x.com', name: 'דנה' });
    expect(row.studentNumber).toBe('');
    expect(await service.updateEmail(course, row.id, 'Dana@x.com')).toMatchObject({ email: 'dana@x.com', studentNumber: '987654321' });
    await service.enroll(course, { email: 'avi@x.com' });
    expect(await code(service.updateEmail(course, row.id, 'avi@x.com'))).toBe('EMAIL_IN_ROSTER');
    expect(await code(service.updateEmail(course, row.id, 'not-an-email'))).toBe('INVALID_EMAIL');
    expect(await code(service.updateEmail(course, 'nope', 'x@x.com'))).toBe('NOT_FOUND');
  });

  it('moving a row to another email drops the link to the first student', async () => {
    people.push({ id: 'u1', name: 'דנה', email: 'dana@x.com', studentNumber: '987654321', role: 'student' });
    const row = await service.enroll(course, { email: 'dana@x.com' });
    expect(row.studentNumber).toBe('987654321');
    expect((await service.updateEmail(course, row.id, 'other@x.com')).studentNumber).toBe('');
  });

  it('a member is enrolled or attended; a removed attendance does not count', async () => {
    await service.enroll(course, { studentNumber: '111111111', name: 'דנה' });
    await attendance.create({
      sessionId, studentNumber: '222222222', studentName: 'אבי', deviceId: 'd', checkedInAt: T0, method: 'qr', geoFlag: false, status: 'present', note: '',
    });
    await attendance.create({
      sessionId, studentNumber: '333333333', studentName: 'רינה', deviceId: 'e', checkedInAt: T0, method: 'qr', geoFlag: false, status: 'removed', note: '',
    });
    expect(await service.isMember(course.id, '111111111')).toBe(true);
    expect(await service.isMember(course.id, '222222222')).toBe(true);
    expect(await service.isMember(course.id, '333333333')).toBe(false);
    expect(await service.isMember(course.id, '')).toBe(false);
    expect(await code(service.requireMember(course.id, '999999999'))).toBe('NOT_IN_COURSE');
  });

  it('sets the weekly timetable and term dates, replacing the previous one', async () => {
    const set = await service.setTimetable(
      course,
      [
        { weekday: 0, starts: '10:00', ends: '12:00', room: ' 305 ' },
        { weekday: 0, starts: '12:00', ends: '13:00' },
        { weekday: 3, starts: '08:30', ends: '10:00' },
      ],
      { start: new Date('2026-10-25'), end: new Date('2027-01-22') },
    );
    expect(set.map((s) => [s.weekday, s.starts, s.ends, s.room])).toEqual([
      [0, '10:00', '12:00', '305'],
      [0, '12:00', '13:00', ''],
      [3, '08:30', '10:00', ''],
    ]);
    expect((await courses.get(course.id))?.termStart).toEqual(new Date('2026-10-25'));
    await service.setTimetable(course, [{ weekday: 1, starts: '14:00', ends: '16:00' }]);
    expect(await slots.listByCourse(course.id)).toHaveLength(1);
    expect((await courses.get(course.id))?.termStart).toBeUndefined();
  });

  it('rejects bad days and times, end before start, overlaps, too many slots and a reversed term', async () => {
    const bad = (s: object[], term = {}) => code(service.setTimetable(course, s as never, term));
    expect(await bad([{ weekday: 7, starts: '10:00', ends: '11:00' }])).toBe('INVALID_TIMETABLE');
    expect(await bad([{ weekday: 1, starts: '9:00', ends: '11:00' }])).toBe('INVALID_TIMETABLE');
    expect(await bad([{ weekday: 1, starts: '24:00', ends: '24:30' }])).toBe('INVALID_TIMETABLE');
    expect(await bad([{ weekday: 1, starts: '11:00', ends: '11:00' }])).toBe('INVALID_TIMETABLE');
    expect(await bad([{ weekday: 1, starts: '10:00', ends: '12:00' }, { weekday: 1, starts: '11:30', ends: '13:00' }])).toBe('TIMETABLE_OVERLAP');
    expect(await bad(Array.from({ length: MAX_SLOTS + 1 }, (_, i) => ({ weekday: i % 7, starts: '08:00', ends: '08:30' })))).toBe('INVALID_TIMETABLE');
    expect(await bad([], { start: new Date('2027-01-01'), end: new Date('2026-10-01') })).toBe('INVALID_TERM');
  });
});
