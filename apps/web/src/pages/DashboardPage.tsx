import type { RecordModel } from 'pocketbase';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import EngagementPanel from '../components/EngagementPanel';
import { FeedbackResults } from '../components/FeedbackCard';
import LectureContentPanel from '../components/LectureContentPanel';
import RecordingPanel from '../components/RecordingPanel';
import { Button, Card, ErrorText, inputClass } from '../components/ui';
import VerificationPanel from '../components/VerificationPanel';
import { api, ApiError, type RecordDto } from '../lib/api';
import { formatTime } from '../lib/device';
import { pb } from '../lib/pb';
import { useAttendance } from '../lib/useAttendance';

const STATUS_LABEL = { present: 'נוכח', flagged: 'לבדיקה', removed: 'הוסר' } as const;

export default function DashboardPage() {
  const { id = '' } = useParams();
  const [session, setSession] = useState<RecordModel | null>(null);
  const [formats, setFormats] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { records, present } = useAttendance(id);

  useEffect(() => {
    pb.collection('sessions').getOne(id, { expand: 'course' }).then(setSession, () => setError('השיעור לא נמצא'));
    api.get<{ exportFormats: string[] }>('/config').then((c) => setFormats(c.exportFormats));
  }, [id]);

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'שגיאה');
    }
  };

  const end = () =>
    run(async () => {
      if (!confirm('לסיים את השיעור? לא ניתן יהיה לסמן נוכחות נוספת.')) return;
      await api.post(`/sessions/${id}/end`);
      setSession(await pb.collection('sessions').getOne(id, { expand: 'course' }));
    });

  const exportAs = (format: string) =>
    run(async () => {
      const res = await api.download(`/sessions/${id}/export?format=${format}`);
      if (res.url) {
        window.open(res.url, '_blank');
        setNotice('הגיליון עודכן ב-Google Sheets');
      }
    });

  const confirmRecord = (r: RecordDto) => run(() => api.post(`/attendance/${r.id}/confirm`));

  const remove = (r: RecordDto) =>
    run(async () => {
      const reason = prompt(`סיבת הסרה עבור ${r.studentName}:`, 'לא נמצא בכיתה');
      if (reason === null) return;
      await api.del(`/attendance/${r.id}?reason=${encodeURIComponent(reason)}`);
    });

  const approve = (e: FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    e.preventDefault();
    const f = new FormData(form);
    return run(async () => {
      await api.post(`/sessions/${id}/attendance`, {
        studentNumber: f.get('studentNumber'),
        studentName: f.get('studentName'),
        note: f.get('note') || 'אישור ידני',
      });
      form.reset();
    });
  };

  const active = session?.status === 'active';

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/dash" className="text-sm text-indigo-600 hover:underline">
            → כל השיעורים
          </Link>
          <h1 className="text-2xl font-bold">
            {session?.expand?.course?.code} · {session?.title}
          </h1>
          <p className="text-sm text-slate-500">
            {active ? 'פעיל' : 'הסתיים'}
            {session?.geofence_mode && ` · מיקום: ${session.geofence_mode === 'strict' ? 'מחמיר' : 'מקל'} (${session.geo_radius_m} מ׳)`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {active && (
            <>
              <Button onClick={() => window.open(`/projector/${id}`, '_blank')}>מסך הקרנה</Button>
              <Button variant="danger" onClick={end}>
                סיום שיעור
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex flex-col items-center justify-center">
          <span className="text-5xl font-bold tabular-nums text-indigo-700">{present}</span>
          <span className="text-slate-600">נוכחים</span>
        </Card>
        <Card className="md:col-span-2">
          <h2 className="mb-2 font-semibold">ייצוא</h2>
          <div className="flex flex-wrap gap-2">
            {formats.includes('xlsx') && <Button variant="secondary" onClick={() => exportAs('xlsx')}>Excel</Button>}
            {formats.includes('csv') && <Button variant="secondary" onClick={() => exportAs('csv')}>CSV</Button>}
            {formats.includes('sheets') && <Button variant="secondary" onClick={() => exportAs('sheets')}>Google Sheets</Button>}
          </div>
          {notice && <p className="mt-2 text-sm text-emerald-700">{notice}</p>}
        </Card>
      </div>

      <ErrorText>{error}</ErrorText>

      {session && !active && <FeedbackResults sessionId={id} />}

      {session && <EngagementPanel sessionId={id} active={active} />}

      {session && <VerificationPanel sessionId={id} active={active} presentCount={present} />}

      {session && <RecordingPanel sessionId={id} />}

      {session && <LectureContentPanel sessionId={id} />}

      <Card>
        <h2 className="mb-3 font-semibold">אישור ידני</h2>
        <form onSubmit={approve} className="grid gap-2 md:grid-cols-[1fr_1fr_1.5fr_auto]">
          <input name="studentNumber" required inputMode="numeric" dir="ltr" placeholder="מספר סטודנט" maxLength={20} className={inputClass} />
          <input name="studentName" required placeholder="שם" maxLength={80} className={inputClass} />
          <input name="note" placeholder="הערה (למשל: איחור, טלפון מת)" maxLength={200} className={inputClass} />
          <Button type="submit">אישור</Button>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-start text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['#', 'שם', 'מס׳ סטודנט', 'שעה', 'אופן', 'מרחק', 'סטטוס', ''].map((h) => (
                <th key={h} className="px-3 py-2 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((r, i) => (
              <tr key={r.id} className={r.status === 'removed' ? 'text-slate-400 line-through' : r.status === 'flagged' ? 'bg-amber-50' : ''}>
                <td className="px-3 py-2 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2 font-medium">{r.studentName}</td>
                <td className="px-3 py-2 tabular-nums" dir="ltr">
                  {r.studentNumber}
                </td>
                <td className="px-3 py-2 tabular-nums">{formatTime(r.checkedInAt)}</td>
                <td className="px-3 py-2">{r.method === 'qr' ? 'QR' : 'ידני'}</td>
                <td className="px-3 py-2">
                  {r.geoFlag ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800" title={r.note}>
                      {r.distanceM === null ? 'מיקום לא ידוע' : `${r.distanceM} מ׳ ⚠`}
                    </span>
                  ) : r.distanceM !== null ? (
                    `${r.distanceM} מ׳`
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.status === 'flagged' ? (
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-amber-900" title={r.note}>
                      {STATUS_LABEL.flagged}
                    </span>
                  ) : (
                    STATUS_LABEL[r.status]
                  )}
                  {r.status === 'flagged' && r.note && <div className="mt-0.5 text-xs text-amber-800">{r.note}</div>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-end">
                  {r.status === 'flagged' && (
                    <button onClick={() => confirmRecord(r)} className="me-3 text-xs text-emerald-700 hover:underline">
                      השאר
                    </button>
                  )}
                  {r.status !== 'removed' && (
                    <button onClick={() => remove(r)} className="text-xs text-red-600 hover:underline">
                      הסרה
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  עדיין אין נרשמים. פתחו את מסך ההקרנה.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
