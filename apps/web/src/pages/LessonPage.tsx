import type { RecordModel } from 'pocketbase';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import AppShell from '../components/AppShell';
import AssignmentManager from '../components/AssignmentManager';
import ChallengeOverlay from '../components/ChallengeOverlay';
import AttendanceTab from '../components/lesson/AttendanceTab';
import ForumTab from '../components/lesson/ForumTab';
import MaterialsTab from '../components/lesson/MaterialsTab';
import StudentAssignments from '../components/StudentAssignments';
import { Button, ErrorText, type TabItem, Tabs } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatTime, parseDate } from '../lib/device';
import { pb, useSessionActive, useUser } from '../lib/pb';
import type { CourseRecord, SessionRecord } from '../lib/timetable';
import { useLiveRecords } from '../lib/useLiveRecords';
import { useTab } from '../lib/useTab';

const TABS = ['attendance', 'forum', 'materials', 'homework'] as const;
export type LessonTab = (typeof TABS)[number];

/** Passed by the QR check-in page so the lesson opens with a confirmation. */
export interface CheckInBanner {
  already: boolean;
  at: string;
  geoFlag: boolean;
}

export interface MyRecord extends RecordModel {
  method: 'qr' | 'manual';
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
  const [banner, setBanner] = useState<CheckInBanner | undefined>((useLocation().state as { checkIn?: CheckInBanner } | null)?.checkIn);
  const active = useSessionActive(id);
  const course = session?.expand?.course as CourseRecord | undefined;
  const lecturer = !!course && course.lecturer === user.id;
  const mine = useLiveRecords<MyRecord>('attendance_records', pb.filter('session = {:s} && student = {:u}', { s: id, u: user.id }), '', !lecturer && !!session);
  const record = mine.find((r) => r.status !== 'removed');

  const fallback: LessonTab = lecturer ? 'attendance' : active && session?.status === 'active' ? 'forum' : 'materials';
  const [tab, setTab] = useTab<LessonTab>(TABS, fallback);

  useEffect(() => {
    pb.collection('sessions').getOne<SessionRecord>(id, { expand: 'course' }).then(setSession, () => setError('השיעור לא נמצא'));
  }, [id]);

  const live = active && session?.status === 'active';

  const end = async () => {
    if (!confirm('לסיים את השיעור? לא ניתן יהיה לסמן נוכחות נוספת.')) return;
    setError('');
    try {
      await api.post(`/sessions/${id}/end`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'שגיאה');
    }
  };
  const tabs: TabItem<LessonTab>[] = [
    { id: 'attendance', label: 'נוכחות' },
    { id: 'forum', label: 'פורום', badge: live ? <span className="h-2 w-2 rounded-full bg-emerald-500" aria-label="פעיל" /> : undefined },
    { id: 'materials', label: 'חומרים' },
    { id: 'homework', label: 'שיעורי בית' },
  ];

  const panels: Record<LessonTab, ReactNode> = {
    attendance: course && (
      <AttendanceTab sessionId={id} courseId={course.id} lecturer={lecturer} active={!!live} record={record} />
    ),
    forum: course && <ForumTab sessionId={id} courseId={course.id} lecturer={lecturer} live={!!live} attended={!!record} goToAttendance={() => setTab('attendance')} />,
    materials: <MaterialsTab sessionId={id} lecturer={lecturer} />,
    homework: course && (lecturer ? <AssignmentManager courseId={course.id} sessionId={id} /> : <StudentAssignments courseId={course.id} sessionId={id} />),
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
        {lecturer && live && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={() => window.open(`/projector/${id}`, '_blank')}>מסך הקרנה</Button>
            <Button variant="danger" onClick={end}>
              סיום שיעור
            </Button>
          </div>
        )}
      </header>
      <ErrorText>{error}</ErrorText>
      {banner && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-2xl bg-emerald-50 p-3 text-emerald-900 ring-1 ring-emerald-200">
          <span>
            <b>{banner.already ? '✓ כבר נרשמת' : '✓ הנוכחות נרשמה'}</b> · {formatTime(banner.at)}
            {banner.geoFlag && <span className="block text-sm text-amber-800">לא הצלחנו לאמת שאתם בכיתה לפי המיקום — המרצה יראה סימון ליד שמכם.</span>}
          </span>
          <button onClick={() => setBanner(undefined)} aria-label="סגירה" className="px-1 text-emerald-700">
            ✕
          </button>
        </div>
      )}
      {session && (
        <>
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          {panels[tab]}
        </>
      )}
      {/* Challenges pop up over any tab. */}
      {!lecturer && live && record && <ChallengeOverlay sessionId={id} />}
    </AppShell>
  );
}
