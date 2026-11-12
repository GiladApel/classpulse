import type { RecordModel } from 'pocketbase';
import { type FormEvent, useEffect, useState } from 'react';
import { api, ApiError, type RecordDto } from '../../lib/api';
import { formatTime } from '../../lib/device';
import { pb } from '../../lib/pb';
import { useAttendance } from '../../lib/useAttendance';
import { useLiveRecords } from '../../lib/useLiveRecords';
import type { MyRecord } from '../../pages/LessonPage';
import { Button, Card, ErrorText, inputClass } from '../ui';
import VerificationPanel from '../VerificationPanel';

const STATUS_LABEL = { present: 'נוכח', flagged: 'לבדיקה', removed: 'הוסר' } as const;
const METHOD_LABEL = { qr: 'QR', manual: 'ידני' } as const;
const live = (r: RecordDto) => r.status !== 'removed';

interface EnrollmentRow extends RecordModel {
  student_number: string;
}

interface Props {
  sessionId: string;
  courseId: string;
  lecturer: boolean;
  active: boolean;
  record?: MyRecord;
}

export default function AttendanceTab(p: Props) {
  return p.lecturer ? <LecturerAttendance {...p} /> : <StudentAttendance {...p} />;
}

/** Student: my attendance for this lesson, or how to mark it (scan the code in the room). */
function StudentAttendance({ active, record }: Props) {
  if (record) {
    return (
      <Card className="flex flex-col items-center gap-2 py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-4xl text-emerald-600">✓</div>
        <h2 className="text-xl font-bold">הנוכחות נרשמה</h2>
        <p className="text-slate-600">{formatTime(record.checked_in_at)}</p>
        {record.status === 'flagged' && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">המרצה יבדוק את הנוכחות שלך.</p>}
        {record.geo_flag && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">לא הצלחנו לאמת שאתם בכיתה לפי המיקום — המרצה יראה סימון ליד שמכם.</p>}
      </Card>
    );
  }

  if (!active) return <Card className="py-8 text-center text-slate-500">לא נרשמה לך נוכחות בשיעור הזה.</Card>;

  return (
    <Card className="flex flex-col items-center gap-2 py-8 text-center">
      <div className="text-5xl">📷</div>
      <h2 className="text-lg font-semibold">סימון נוכחות</h2>
      <p className="text-slate-600">סרקו עם מצלמת הטלפון את הקוד שמוקרן על הלוח בכיתה.</p>
    </Card>
  );
}

/** Lecturer: who is here, checks, manual approval and export. */
function LecturerAttendance({ sessionId, courseId, active }: Props) {
  const [formats, setFormats] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { records, present } = useAttendance(sessionId);
  const roster = useLiveRecords<EnrollmentRow>('enrollments', pb.filter('course = {:c}', { c: courseId }));
  const enrolled = new Set(roster.map((e) => e.student_number));
  // A course without a roster has nobody "off" it.
  const offRoster = new Set(roster.length === 0 ? [] : records.map((r) => r.studentNumber).filter((n) => !enrolled.has(n)));

  useEffect(() => {
    api.get<{ exportFormats: string[] }>('/config').then((c) => setFormats(c.exportFormats), () => {});
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'שגיאה');
    }
  };

  const exportAs = (format: string) =>
    run(async () => {
      const res = await api.download(`/sessions/${sessionId}/export?format=${format}`);
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

  const enroll = (r: RecordDto) => run(() => api.post(`/courses/${courseId}/enrollments`, { studentNumber: r.studentNumber, name: r.studentName }));

  const approve = (e: FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    e.preventDefault();
    const f = new FormData(form);
    return run(async () => {
      await api.post(`/sessions/${sessionId}/attendance`, {
        studentNumber: f.get('studentNumber'),
        studentName: f.get('studentName'),
        note: f.get('note') || 'אישור ידני',
      });
      form.reset();
    });
  };

  return (
    <>
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

      <VerificationPanel sessionId={sessionId} active={active} presentCount={present} />

      <AttendanceTable
        title={`רשימת נוכחות (${records.filter(live).length})`}
        records={records}
        empty="עדיין אין נרשמים. פתחו את מסך ההקרנה."
        onConfirm={confirmRecord}
        onRemove={remove}
        offRoster={offRoster}
        onEnroll={enroll}
      />

      <Card>
        <h2 className="mb-3 font-semibold">אישור ידני</h2>
        <form onSubmit={approve} className="grid gap-2 md:grid-cols-[1fr_1fr_1.5fr_auto]">
          <input name="studentNumber" required inputMode="numeric" dir="ltr" placeholder="מספר סטודנט" maxLength={20} className={inputClass} />
          <input name="studentName" required placeholder="שם" maxLength={80} className={inputClass} />
          <input name="note" placeholder="הערה (למשל: איחור, טלפון מת)" maxLength={200} className={inputClass} />
          <Button type="submit">אישור</Button>
        </form>
      </Card>
    </>
  );
}

function AttendanceTable({
  title,
  records,
  empty,
  onConfirm,
  onRemove,
  offRoster,
  onEnroll,
}: {
  title: string;
  records: RecordDto[];
  empty: string;
  onConfirm: (r: RecordDto) => void;
  onRemove: (r: RecordDto) => void;
  /** Student numbers that checked in without being on the course roster (empty when the course has no roster). */
  offRoster: Set<string>;
  onEnroll: (r: RecordDto) => void;
}) {
  return (
    <Card className="overflow-x-auto p-0">
      <h2 className="px-3 pt-3 font-semibold">{title}</h2>
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
              <td className="px-3 py-2 font-medium">
                {r.studentName}
                {offRoster.has(r.studentNumber) && (
                  <button onClick={() => onEnroll(r)} className="ms-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-normal text-sky-800 hover:bg-sky-200" title="הוספה לרשימת הקורס">
                    לא ברשימה · הוספה
                  </button>
                )}
              </td>
              <td className="px-3 py-2 tabular-nums" dir="ltr">
                {r.studentNumber}
              </td>
              <td className="px-3 py-2 tabular-nums">{formatTime(r.checkedInAt)}</td>
              <td className="px-3 py-2">{METHOD_LABEL[r.method]}</td>
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
                  <button onClick={() => onConfirm(r)} className="me-3 text-xs text-emerald-700 hover:underline">
                    השאר
                  </button>
                )}
                {r.status !== 'removed' && (
                  <button onClick={() => onRemove(r)} className="text-xs text-red-600 hover:underline">
                    הסרה
                  </button>
                )}
              </td>
            </tr>
          ))}
          {records.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
