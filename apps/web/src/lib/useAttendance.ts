import type { RecordModel } from 'pocketbase';
import { useEffect, useState } from 'react';
import type { RecordDto } from './api';
import { pb } from './pb';

const toDto = (r: RecordModel): RecordDto => ({
  id: r.id,
  studentNumber: r.student_number,
  studentName: r.student_name,
  checkedInAt: r.checked_in_at,
  method: r.method,
  distanceM: r.distance_m < 0 ? null : r.distance_m,
  geoFlag: r.geo_flag,
  status: r.status,
  note: r.note,
});

/** Initial load + PocketBase realtime subscription (Observer); PB applies the list rule per event. */
export function useAttendance(sessionId: string) {
  const [records, setRecords] = useState<RecordDto[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const col = pb.collection('attendance_records');
    const filter = pb.filter('session = {:s}', { s: sessionId });

    const unsubscribe = col.subscribe(
      '*',
      ({ action, record }) => {
        setRecords((prev) => {
          const rest = prev.filter((r) => r.id !== record.id);
          return action === 'delete' ? rest : [...rest, toDto(record)].sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt));
        });
      },
      { filter },
    );

    col.getFullList({ filter, sort: 'checked_in_at' }).then((list) => {
      if (cancelled) return;
      setRecords(list.map(toDto));
      setLoaded(true);
    });

    return () => {
      cancelled = true;
      unsubscribe.then((fn) => fn());
    };
  }, [sessionId]);

  const present = records.filter((r) => r.status !== 'removed').length;
  return { records, present, loaded };
}
