import { useMemo } from 'react';
import type { AssignmentRecord, SubmissionRecord } from './content';
import { parseDate } from './device';
import { pb } from './pb';
import { useLiveRecords } from './useLiveRecords';

export interface LessonHomework {
  /** Every homework of the lesson was handed in (always false for the lecturer). */
  handedIn: boolean;
  /** The earliest due date among the homework still to hand in. */
  dueAt?: Date;
}

/** Homework published in each lesson of a course, and whether this student handed it in: lesson id → status. */
export function useLessonHomework(courseId: string, lecturer: boolean): Map<string, LessonHomework> {
  const userId = pb.authStore.record?.id ?? '';
  const assignments = useLiveRecords<AssignmentRecord>('assignments', pb.filter('course = {:c} && session != ""', { c: courseId }));
  const mine = useLiveRecords<SubmissionRecord>(
    'submissions',
    pb.filter('assignment.course = {:c} && student = {:u}', { c: courseId, u: userId }),
    '',
    !lecturer && !!userId,
  );

  return useMemo(() => {
    const handed = new Set(mine.filter((s) => s.handed_in_at).map((s) => s.assignment as string));
    const bySession = new Map<string, LessonHomework>();
    for (const a of assignments) {
      const done = !lecturer && handed.has(a.id);
      const entry = bySession.get(a.session) ?? { handedIn: true };
      entry.handedIn &&= done;
      if (!done && a.due_at) {
        const due = parseDate(a.due_at);
        if (!entry.dueAt || due < entry.dueAt) entry.dueAt = due;
      }
      bySession.set(a.session, entry);
    }
    return bySession;
  }, [assignments, mine, lecturer]);
}
