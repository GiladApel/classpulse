import { useEffect, useState } from 'react';
import type { MaterialRecord, PracticeRecord, RecordingRecord } from '../../lib/content';
import { pb } from '../../lib/pb';
import { useLiveRecords } from '../../lib/useLiveRecords';
import LectureContentPanel from '../LectureContentPanel';
import RecordingPanel from '../RecordingPanel';
import SummaryView from '../SummaryView';
import { Card } from '../ui';

/** Summary, files and links, review questions. The lecturer manages them; students read them. */
export default function MaterialsTab({ sessionId, lecturer }: { sessionId: string; lecturer: boolean }) {
  if (lecturer)
    return (
      <>
        <RecordingPanel sessionId={sessionId} />
        <LectureContentPanel sessionId={sessionId} />
      </>
    );
  return <StudentMaterials sessionId={sessionId} />;
}

function StudentMaterials({ sessionId }: { sessionId: string }) {
  const bySession = pb.filter('session = {:s}', { s: sessionId });
  const [summary, setSummary] = useState<RecordingRecord | null>(null);
  const materials = useLiveRecords<MaterialRecord>('materials', bySession, 'added_at');
  const practice = useLiveRecords<PracticeRecord>('practice_questions', bySession, 'created_at');

  useEffect(() => {
    pb.collection('recordings')
      .getFirstListItem<RecordingRecord>(pb.filter('session = {:s} && published = true', { s: sessionId }))
      .then(setSummary, () => setSummary(null));
  }, [sessionId]);

  if (!summary?.summary && materials.length === 0 && practice.length === 0) {
    return (
      <Card>
        <p className="text-center text-slate-500">עוד אין חומרים לשיעור הזה. המרצה מוסיף/ה סיכום, קבצים ושאלות לתרגול במהלך השיעור או אחריו.</p>
      </Card>
    );
  }

  return (
    <>
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
          <p className="mb-3 text-xs text-slate-500">שאלות לחזרה על החומר — נסו לענות לעצמכם.</p>
          <ol className="flex list-decimal flex-col gap-2 ps-5">
            {practice.map((q) => (
              <li key={q.id}>{q.question}</li>
            ))}
          </ol>
        </Card>
      )}
    </>
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
