import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { formatSec, type LectureCoaching } from '../lib/content';
import { Button, Card, ErrorText } from './ui';

const SCORE_LABELS: [keyof LectureCoaching['scores'], string][] = [
  ['clarity', 'בהירות'],
  ['pace', 'קצב'],
  ['engagement', 'מעורבות הכיתה'],
];

/** Lecturer only: a short report on how to improve this lecture, built from the recording and what the class did. */
export default function CoachingReport({ recordingId, refreshKey }: { recordingId: string; refreshKey?: unknown }) {
  const [coaching, setCoaching] = useState<LectureCoaching | null>(null);
  const [failed, setFailed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const apply = (r: { coaching: LectureCoaching | null; error: string }) => {
    setCoaching(r.coaching);
    setFailed(r.error);
  };

  useEffect(() => {
    api.get<{ coaching: LectureCoaching | null; error: string }>(`/recordings/${recordingId}/coaching`).then(apply, () => {});
  }, [recordingId, refreshKey]);

  const retry = async () => {
    setBusy(true);
    setError('');
    try {
      apply(await api.post(`/recordings/${recordingId}/coaching/retry`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  };

  if (!coaching && !failed) return null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">דוח למרצה</h2>
        <span className="text-xs text-slate-500">רק אתם רואים את הדוח הזה</span>
      </div>
      {failed && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-red-700">{failed}</p>
          <Button variant="secondary" onClick={retry} disabled={busy}>
            {busy ? 'מכין…' : 'הכנת הדוח מחדש'}
          </Button>
        </div>
      )}
      <ErrorText>{error}</ErrorText>

      {coaching && (
        <>
          {coaching.verdict && <p className="text-lg text-slate-800">{coaching.verdict}</p>}
          <dl className="grid grid-cols-3 gap-3">
            {SCORE_LABELS.map(([key, label]) => (
              <div key={key} className="rounded-xl bg-slate-50 p-3 text-center">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="text-2xl font-bold tabular-nums text-slate-900">
                  {coaching.scores[key]}
                  <span className="text-sm font-normal text-slate-400">/5</span>
                </dd>
              </div>
            ))}
          </dl>

          <ol className="flex flex-col gap-3" aria-label="טיפים לשיפור">
            {coaching.tips.map((t, i) => (
              <li key={i} className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium">
                  {t.atSec !== null && <span className="me-2 rounded bg-indigo-50 px-1.5 py-0.5 text-xs tabular-nums text-indigo-800" dir="ltr">{formatSec(t.atSec)}</span>}
                  {t.title}
                </p>
                {t.evidence && <p className="text-sm text-slate-600">{t.evidence}</p>}
                <p className="text-sm text-indigo-900">→ {t.suggestion}</p>
              </li>
            ))}
          </ol>

          {(coaching.promises.length > 0 || coaching.language.length > 0 || coaching.audio) && (
            <div className="grid gap-3 md:grid-cols-3">
              {coaching.promises.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">הבטחות שלא קוימו</h3>
                  <ul className="ms-4 list-disc text-sm text-slate-700">
                    {coaching.promises.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {coaching.language.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">שפה</h3>
                  <ul className="ms-4 list-disc text-sm text-slate-700">
                    {coaching.language.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}
              {coaching.audio && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">סאונד</h3>
                  <p className="text-sm text-slate-700">{coaching.audio}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
