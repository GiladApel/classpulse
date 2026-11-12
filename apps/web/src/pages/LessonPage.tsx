import type { RecordModel } from 'pocketbase';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import AppShell from '../components/AppShell';
import AssignmentManager from '../components/AssignmentManager';
import ForumTab from '../components/lesson/ForumTab';
import MaterialsTab from '../components/lesson/MaterialsTab';
import StudentAssignments from '../components/StudentAssignments';
import { ErrorText, type TabItem, Tabs } from '../components/ui';
import { parseDate } from '../lib/device';
import { pb, useSessionActive, useUser } from '../lib/pb';
import type { CourseRecord, SessionRecord } from '../lib/timetable';
import { useLiveRecords } from '../lib/useLiveRecords';
import { useTab } from '../lib/useTab';

const TABS = ['attendance', 'forum', 'materials', 'homework'] as const;
export type LessonTab = (typeof TABS)[number];

export interface MyRecord extends RecordModel {
  method: 'qr' | 'manual' | 'zoom';
  status: 'present' | 'flagged' | 'removed';
  checked_in_at: string;
  geo_flag: boolean;
}

/**
 * Everything about one lesson, live or past, for the lecturer and the students, in tabs:
 * attendance, forum (questions and polls), materials and homework.
 */
export default function LessonPage() {
  const { id = '' } = useParams();
  const user = useUser()!;
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [error, setError] = useState('');
  const active = useSessionActive(id);
  const course = session?.expand?.course as CourseRecord | undefined;
  const lecturer = !!course && course.lecturer === user.id;
  const mine = useLiveRecords<MyRecord>('attendance_records', pb.filter('session = {:s} && student = {:u}', { s: id, u: user.id }), '', !lecturer && !!session);
  const record = mine.find((r) => r.status !== 'removed');

  const fallback: LessonTab = lecturer ? 'attendance' : active && session?.status === 'active' ? (record ? 'forum' : 'attendance') : 'materials';
  const [tab, setTab] = useTab<LessonTab>(TABS, fallback);

  useEffect(() => {
    pb.collection('sessions').getOne<SessionRecord>(id, { expand: 'course' }).then(setSession, () => setError('השיעור לא נמצא'));
  }, [id]);

  const live = active && session?.status === 'active';
  const tabs: TabItem<LessonTab>[] = [
    { id: 'attendance', label: 'נוכחות' },
    { id: 'forum', label: 'פורום', badge: live ? <span className="h-2 w-2 rounded-full bg-emerald-500" aria-label="פעיל" /> : undefined },
    { id: 'materials', label: 'חומרים' },
    { id: 'homework', label: 'שיעורי בית' },
  ];

  const panels: Record<LessonTab, ReactNode> = {
    attendance: null,
    forum: <ForumTab sessionId={id} lecturer={lecturer} live={!!live} attended={!!record} goToAttendance={() => setTab('attendance')} />,
    materials: <MaterialsTab sessionId={id} lecturer={lecturer} />,
    homework: course && (lecturer ? <AssignmentManager courseId={course.id} /> : <StudentAssignments courseId={course.id} />),
  };

  return (
    <AppShell back={course ? `/course/${course.id}` : '/'} wide={lecturer}>
      <header className="flex flex-col gap-1">
        {course && (
          <Link to={`/course/${course.id}`} className="text-sm text-indigo-600 hover:underline">
            {course.code} · {course.name}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{session?.title ?? ' '}</h1>
          {session && (
            <span className={`rounded-full px-2.5 py-0.5 text-sm ${live ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{live ? '● פעיל עכשיו' : 'הסתיים'}</span>
          )}
        </div>
        {session && <p className="text-sm text-slate-500">{parseDate(session.started_at).toLocaleDateString('he-IL', { dateStyle: 'full' })}</p>}
      </header>
      <ErrorText>{error}</ErrorText>
      {session && (
        <>
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          {panels[tab]}
        </>
      )}
    </AppShell>
  );
}
