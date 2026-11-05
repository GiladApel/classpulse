import type { RecordModel } from 'pocketbase';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import FeedbackCard from '../components/FeedbackCard';
import PollBars from '../components/PollBars';
import { Feed } from '../components/StudentLivePanel';
import SummaryView from '../components/SummaryView';
import { Card, ErrorText } from '../components/ui';
import { api, ApiError } from '../lib/api';
import type { MaterialRecord, PracticeAnswerRecord, PracticeRecord, RecordingRecord } from '../lib/content';
import { parseDate } from '../lib/device';
import { pb } from '../lib/pb';
import { type PollRecord, useLiveRecords } from '../lib/useLiveRecords';

/**
 * Student: everything about one lecture, open to every course participant (also those who missed it):
 * summary, materials, practice questions, the polls from class with results, and questions with answers.
 */
export default function LecturePage() {
  const { id = '' } = useParams();
  const userId = pb.authStore.record?.id ?? '';
  const bySession = pb.filter('session = {:s}', { s: id });
  const [session, setSession] = useState<RecordModel | null>(null);
  const [summary, setSummary] = useState<RecordingRecord | null>(null);
  const [attended, setAttended] = useState(false);
  const [error, setError] = useState('');
  const materials = useLiveRecords<MaterialRecord>('materials', bySession, 'added_at');
  const practice = useLiveRecords<PracticeRecord>('practice_questions', bySession, 'created_at');
  const polls = useLiveRecords<PollRecord>('polls', pb.filter('session = {:s} && status = "closed"', { s: id }), 'closed_at');

  useEffect(() => {
    pb.collection('sessions').getOne(id, { expand: 'course' }).then(setSession, () => setError('השיעור לא נמצא'));
    pb.collection('recordings')
      .getFirstListItem<RecordingRecord>(pb.filter('session = {:s} && published = true', { s: id }))
      .then(setSummary, () => setSummary(null));
    pb.collection('attendance_records')
      .getFirstListItem(pb.filter('session = {:s} && student = {:u} && status != "removed"', { s: id, u: userId }))
      .then(() => setAttended(true), () => setAttended(false));
  }, [id, userId]);

  const course = session?.expand?.course as RecordModel | undefined;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      {course && (
        <Link to={`/course/${course.id}`} className="text-sm text-indigo-600 hover:underline">
          → {course.code} · {course.name}
        </Link>
      )}
      <div>
        <h1 className="text-2xl font-bold">{session?.title}</h1>
        {session && <p className="text-sm text-slate-500">{parseDate(session.started_at).toLocaleDateString('he-IL', { dateStyle: 'full' })}</p>}
      </div>
      <ErrorText>{error}</ErrorText>

      {attended && session && <FeedbackCard sessionId={id} ended={session.status === 'ended'} />}

      {summary?.summary && (
        <Card>
          <h2 className="mb-3 font-semibold">סיכום ההרצאה</h2>
          <SummaryView summary={summary.summary} />
        </Card>
      )}

      {materials.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">חומרים</h2>
          <ul className="flex flex-col divide-y divide-slate-100">
            {materials.map((m) => (
              <li key={m.id} className="py-2">
                <MaterialLink material={m} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {practice.length > 0 && (
        <Card>
          <h2 className="mb-1 font-semibold">שאלות לתרגול</h2>
          <p className="mb-3 text-xs text-slate-500">ניסיון אחד לכל שאלה — אחריו תראו את התשובה הנכונה.</p>
          <div className="flex flex-col gap-4">
            {practice.map((q) => (
              <PracticeCard key={q.id} question={q} userId={userId} />
            ))}
          </div>
        </Card>
      )}

      {polls.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">סקרים מהשיעור</h2>
          <div className="flex flex-col gap-4">
            {polls.map((p) => (
              <div key={p.id}>
                <p className="mb-2 font-medium">{p.question}</p>
                <PollBars options={p.options} counts={p.results?.counts ?? p.options.map(() => 0)} correctIndex={p.answer_index} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {session && <Feed sessionId={id} canPost={attended} />}
    </main>
  );
}

/**
 * Protected files need a short-lived file token in the URL, so it is fetched on click. The tab is opened first,
 * synchronously, because mobile Safari blocks window.open after an await.
 */
function MaterialLink({ material: m }: { material: MaterialRecord }) {
  const open = async () => {
    const tab = window.open('about:blank', '_blank');
    const token = await pb.files.getToken();
    const url = pb.files.getURL(m, m.file, { token });
    if (tab) tab.location.href = url;
    else location.href = url;
  };
  const icon = m.kind === 'link' ? '🔗' : '📄';
  return m.kind === 'link' ? (
    <a href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-indigo-700 hover:underline">
      {icon} {m.title}
    </a>
  ) : (
    <button onClick={open} className="flex items-center gap-2 text-start text-indigo-700 hover:underline">
      {icon} {m.title}
      {m.filename !== m.title && <span className="text-xs text-slate-400">({m.filename})</span>}
    </button>
  );
}

function PracticeCard({ question: q, userId }: { question: PracticeRecord; userId: string }) {
  const mine = useLiveRecords<PracticeAnswerRecord>('practice_answers', pb.filter('question = {:q} && student = {:u}', { q: q.id, u: userId }))[0];
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const answer = async (i: number) => {
    setError('');
    setBusy(true);
    try {
      await api.post(`/practice/${q.id}/answers`, { optionIndex: i });
    } catch (e) {
      setError(e instanceof ApiError && e.status < 500 ? e.message : 'שגיאת רשת — נסו שוב');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="mb-2 font-medium">{q.question}</p>
      <div className="flex flex-col gap-2">
        {q.options.map((o, i) => {
          const tone = !mine
            ? 'border-slate-200 enabled:hover:border-indigo-400 enabled:hover:bg-indigo-50'
            : i === mine.correct_index
              ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
              : i === mine.option_index
                ? 'border-red-300 bg-red-50 text-red-800'
                : 'border-slate-200 text-slate-400';
          return (
            <button key={i} disabled={!!mine || busy} onClick={() => answer(i)} className={`rounded-lg border px-3 py-2 text-start ${tone}`}>
              {o}
              {mine && i === mine.correct_index && ' ✓'}
            </button>
          );
        })}
      </div>
      {mine && <p className={`mt-2 text-sm font-medium ${mine.correct ? 'text-emerald-700' : 'text-red-700'}`}>{mine.correct ? 'נכון!' : 'לא נכון — התשובה הנכונה מסומנת בירוק.'}</p>}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
