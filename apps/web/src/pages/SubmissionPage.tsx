import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import AppShell from '../components/AppShell';
import HomeworkReport from '../components/HomeworkReport';
import { Card, ErrorText } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { MAX_CHECKS, type SubmissionView } from '../lib/content';

/** Lecturer: one student's latest check of a homework. The solution itself is never stored, only the report. */
export default function SubmissionPage() {
  const { id = '' } = useParams();
  const [view, setView] = useState<SubmissionView | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<SubmissionView>(`/submissions/${id}`).then(setView, (e) => setError(e instanceof ApiError ? e.message : 'הבדיקה לא נמצאה'));
  }, [id]);

  return (
    <AppShell back={view ? `/dash/assignment/${view.submission.assignmentId}` : '/dash'}>
      <ErrorText>{error}</ErrorText>
      {view && (
        <Card>
          <h1 className="text-xl font-bold">{view.submission.studentName}</h1>
          <p className="mb-4 text-sm text-slate-500" dir="auto">
            {view.submission.studentNumber} · {view.submission.checkCount}/{MAX_CHECKS} בדיקות
            {view.submission.late && <span className="ms-2 text-red-600">באיחור</span>}
          </p>
          <HomeworkReport view={view} />
        </Card>
      )}
    </AppShell>
  );
}
