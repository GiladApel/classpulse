import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import AppShell from '../components/AppShell';
import AssignmentManager from '../components/AssignmentManager';
import CourseLessons from '../components/CourseLessons';
import StudentAssignments from '../components/StudentAssignments';
import { ErrorText, type TabItem, Tabs } from '../components/ui';
import { pb, useUser } from '../lib/pb';
import type { CourseRecord } from '../lib/timetable';
import { useTab } from '../lib/useTab';

const TABS = ['lessons', 'homework'] as const;
type Tab = (typeof TABS)[number];

/** One page per course, for the lecturer and the students: its lessons and homework. */
export default function CourseHubPage() {
  const { id = '' } = useParams();
  const user = useUser()!;
  const [course, setCourse] = useState<CourseRecord | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useTab<Tab>(TABS, 'lessons');
  const lecturer = !!course && course.lecturer === user.id;

  useEffect(() => {
    pb.collection('courses').getOne<CourseRecord>(id).then(setCourse, () => setError('הקורס לא נמצא'));
  }, [id]);

  const tabs: TabItem<Tab>[] = [
    { id: 'lessons', label: 'שיעורים' },
    { id: 'homework', label: 'שיעורי בית' },
  ];

  return (
    <AppShell back="/">
      <h1 className="text-2xl font-bold">{course ? `${course.code} · ${course.name}` : '\u00a0'}</h1>
      <ErrorText>{error}</ErrorText>
      {course && (
        <>
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          {tab === 'lessons' && <CourseLessons courseId={id} lecturer={lecturer} />}
          {tab === 'homework' && (lecturer ? <AssignmentManager courseId={id} /> : <StudentAssignments courseId={id} />)}
        </>
      )}
    </AppShell>
  );
}
