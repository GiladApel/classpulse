import type { RecordModel } from 'pocketbase';
import { useEffect, useMemo, useState } from 'react';
import { pb, type UserRecord } from './pb';
import { useLiveRecords } from './useLiveRecords';

export const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;
export const DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const;

export interface CourseRecord extends RecordModel {
  code: string;
  name: string;
  lecturer: string;
  term_start: string;
  term_end: string;
}

export interface SlotRecord extends RecordModel {
  course: string;
  weekday: number;
  starts: string;
  ends: string;
  room: string;
}

export interface SessionRecord extends RecordModel {
  course: string;
  title: string;
  status: 'active' | 'ended';
  started_at: string;
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The slot running now, counting from 15 minutes before it starts (when the lecturer opens the lesson). */
export function slotNow(slots: SlotRecord[], now: Date): SlotRecord | undefined {
  const m = now.getHours() * 60 + now.getMinutes();
  return slots.find((s) => s.weekday === now.getDay() && m >= minutes(s.starts) - 15 && m < minutes(s.ends));
}

/** The next slot to start within the coming week. */
export function nextSlot(slots: SlotRecord[], now: Date): SlotRecord | undefined {
  const m = now.getDay() * 1440 + now.getHours() * 60 + now.getMinutes();
  const week = 7 * 1440;
  const until = (s: SlotRecord) => (s.weekday * 1440 + minutes(s.starts) - m + week) % week;
  return [...slots].sort((a, b) => until(a) - until(b))[0];
}

/** Courses on the home screen: a lecturer's own; a student's from the roster plus any course they attended. */
export function useMyCourses(user: UserRecord) {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async (): Promise<CourseRecord[]> => {
      if (user.role === 'lecturer') {
        return pb.collection('courses').getFullList<CourseRecord>({ filter: pb.filter('lecturer = {:u}', { u: user.id }), sort: 'code' });
      }
      const [enrolled, attended] = await Promise.all([
        pb.collection('enrollments').getFullList({ expand: 'course' }),
        pb.collection('attendance_records').getFullList({ filter: pb.filter("student = {:u} && status != 'removed'", { u: user.id }), expand: 'session.course' }),
      ]);
      const byId = new Map<string, CourseRecord>();
      for (const e of enrolled) if (e.expand?.course) byId.set(e.course, e.expand.course as CourseRecord);
      for (const r of attended) {
        const c = r.expand?.session?.expand?.course as CourseRecord | undefined;
        if (c) byId.set(c.id, c);
      }
      return [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
    };
    load()
      .then(setCourses, () => setCourses([]))
      .finally(() => setLoaded(true));
  }, [user.id, user.role]);

  const ids = courses.map((c) => c.id);
  const byCourse = ids.length ? ids.map((id) => pb.filter('course = {:c}', { c: id })).join(' || ') : 'id = ""';
  const slots = useLiveRecords<SlotRecord>('course_slots', byCourse, '', ids.length > 0);
  const live = useLiveRecords<SessionRecord>('sessions', `status = "active" && (${byCourse})`, '', ids.length > 0);
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  return { courses, courseById, slots, live, loaded };
}
