import { type ChangeEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { type RecordingRecord, STATUS_HE, type Timeline, uploadRecording } from '../lib/content';
import { pb } from '../lib/pb';
import { useLiveRecords } from '../lib/useLiveRecords';
import SummaryView from './SummaryView';
import { Button, Card, ErrorText, Field, inputClass } from './ui';

/** Lecturer: upload the lecture recording (or transcript), follow processing live, review the summary, publish it. */
export default function RecordingPanel({ sessionId }: { sessionId: string }) {
  const recordings = useLiveRecords<RecordingRecord>('recordings', pb.filter('session = {:s}', { s: sessionId }), 'created_at');
  const latest = [...recordings].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const [offsetMin, setOffsetMin] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [error, setError] = useState('');

  // The timeline depends on the summary's chapters, so fetch it once the summary exists.
  useEffect(() => {
    setTimeline(null);
    if (latest?.status !== 'done') return;
    api.get<Timeline>(`/recordings/${latest.id}/timeline`).then(setTimeline, () => {});
  }, [latest?.id, latest?.status]);

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setProgress(0);
    try {
      await uploadRecording(sessionId, file, Math.round(offsetMin * 60), setProgress);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההעלאה נכשלה — בדקו את החיבור ונסו שוב');
    } finally {
      setProgress(null);
    }
  };

  const publish = async (published: boolean) => {
    setError('');
    try {
      await api.post(`/recordings/${latest!.id}/publish`, { published });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'שגיאה');
    }
  };

  const busy = progress !== null || (latest && ['uploading', 'queued', 'processing'].includes(latest.status));

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">סיכום ההרצאה</h2>
        {latest?.status === 'done' && (
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs ${latest.published ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
              {latest.published ? 'פורסם לסטודנטים' : 'טיוטה — רק אתם רואים'}
            </span>
            <Button variant={latest.published ? 'secondary' : 'primary'} onClick={() => publish(!latest.published)}>
              {latest.published ? 'ביטול פרסום' : 'פרסום לסטודנטים'}
            </Button>
          </div>
        )}
      </div>

      {!busy && (
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="ההקלטה התחילה אחרי פתיחת השיעור (דקות)">
            <input type="number" step="0.5" min={-60} max={300} value={offsetMin} onChange={(e) => setOffsetMin(Number(e.target.value))} className={`${inputClass} w-32`} />
          </Field>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700">
            🎬 {latest ? 'העלאה מחדש' : 'העלאת הקלטה או תמליל'}
            <input type="file" accept="video/*,audio/*,.vtt,.srt,.txt" className="hidden" onChange={upload} />
          </label>
          <p className="w-full text-xs text-slate-500">וידאו/אודיו עד 2GB, או תמליל vtt/srt/txt. ההקלטה עצמה לא נשמרת — רק הסיכום.</p>
        </div>
      )}

      {progress !== null && (
        <div className="mb-3">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-indigo-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="mt-1 text-sm text-slate-600">מעלה… {Math.round(progress * 100)}%</p>
        </div>
      )}

      {latest && progress === null && latest.status !== 'done' && (
        <p className={`text-sm ${latest.status === 'failed' ? 'text-red-700' : 'text-slate-600'}`}>
          {latest.status !== 'failed' && <span className="me-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 align-middle" />}
          {latest.filename} · {STATUS_HE[latest.status]}
          {latest.error && ` — ${latest.error}`}
        </p>
      )}

      <ErrorText>{error}</ErrorText>
      {latest?.status === 'done' && latest.summary && <SummaryView summary={latest.summary} timeline={timeline} />}
    </Card>
  );
}
