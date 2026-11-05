import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import ReviewView from '../components/ReviewView';
import { Card, ErrorText } from '../components/ui';
import { api, ApiError } from '../lib/api';
import type { AssignmentRecord, SubmissionView } from '../lib/content';
import { pb } from '../lib/pb';

/** One submission with its review, for the lecturer (any student in their course) or its owner. */
export default function SubmissionPage() {
  const { id = '' } = useParams();
  const [view, setView] = useState<SubmissionView | null>(null);
  const [assignment, setAssignment] = useState<AssignmentRecord | null>(null);
  const [fileUrl, setFileUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const v = await api.get<SubmissionView>(`/submissions/${id}`);
        setView(v);
        setAssignment(await pb.collection('assignments').getOne<AssignmentRecord>(v.submission.assignmentId));
        const rec = await pb.collection('submissions').getOne(id);
        if (rec.file) setFileUrl(pb.files.getURL(rec, rec.file, { token: await pb.files.getToken() }));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'ההגשה לא נמצאה');
      }
    })();
  }, [id]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <button onClick={() => history.back()} className="self-start text-sm text-indigo-600 hover:underline">
        → חזרה
      </button>
      <ErrorText>{error}</ErrorText>
      {view && assignment && (
        <Card>
          <h1 className="text-xl font-bold">{view.submission.studentName}</h1>
          <p className="mb-4 text-sm text-slate-500">
            {assignment.title} · {view.submission.filename}
            {fileUrl && (
              <a href={fileUrl} target="_blank" rel="noreferrer" className="ms-2 text-indigo-600 hover:underline">
                הורדת הקובץ
              </a>
            )}
          </p>
          <ReviewView view={view} rubric={assignment.rubric} />
        </Card>
      )}
    </main>
  );
}
