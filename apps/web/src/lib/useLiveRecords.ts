import type { RecordModel } from 'pocketbase';
import { useEffect, useState } from 'react';
import { parseDate } from './device';
import { pb } from './pb';

/**
 * Initial load + realtime subscription for one collection (Observer). PocketBase applies the collection's
 * list rule to every event, so each viewer only ever receives what they may see.
 */
/** `sort` must name a real field of the collection — PocketBase rejects the whole query otherwise. */
export function useLiveRecords<T extends RecordModel>(collection: string, filter: string, sort = '', enabled = true): T[] {
  const [items, setItems] = useState<T[]>([]);

  useEffect(() => {
    setItems([]);
    if (!enabled) return;
    let cancelled = false;
    const col = pb.collection(collection);
    const unsubscribe = col.subscribe<T>(
      '*',
      ({ action, record }) => {
        setItems((prev) => {
          const rest = prev.filter((r) => r.id !== record.id);
          return action === 'delete' ? rest : [...rest, record];
        });
      },
      { filter },
    );
    col
      .getFullList<T>({ filter, sort: sort || undefined })
      .then((list) => {
        if (cancelled) return;
        // Keep events that arrived while the list was loading.
        setItems((prev) => [...list.filter((r) => !prev.some((p) => p.id === r.id)), ...prev]);
      })
      .catch((e) => console.error(`useLiveRecords(${collection})`, e));
    return () => {
      cancelled = true;
      unsubscribe.then((fn) => fn()).catch(() => {});
    };
  }, [collection, filter, sort, enabled]);

  return items;
}

export type PollRecord = RecordModel & {
  question: string;
  options: string[];
  status: 'draft' | 'open' | 'closed';
  source: 'template' | 'manual' | 'ai';
  answer_index: number;
  results: { counts: number[]; total: number; correctIndex: number | null } | null;
  created_at: string;
  opened_at: string;
  closed_at: string;
};

export type PostRecord = RecordModel & {
  display_name: string;
  anonymous: boolean;
  text: string;
  votes: number;
  answered: boolean;
  posted_at: string;
};

/** The poll a screen should show: the open one, else the most recently closed one if it closed within `recentSec`. */
export function currentPoll(polls: PollRecord[], recentSec: number): PollRecord | null {
  const open = polls.find((p) => p.status === 'open');
  if (open) return open;
  const closed = polls.filter((p) => p.status === 'closed' && p.closed_at).sort((a, b) => b.closed_at.localeCompare(a.closed_at))[0];
  return closed && Date.now() - parseDate(closed.closed_at).getTime() < recentSec * 1000 ? closed : null;
}

export const tally = (options: string[], votes: { option_index: number }[]) => {
  const counts = options.map(() => 0);
  for (const v of votes) if (v.option_index < counts.length) counts[v.option_index]++;
  return counts;
};

/** Re-renders every `ms` so time-based views (e.g. "closed within 60 s") expire on their own. */
export function useTick(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}
