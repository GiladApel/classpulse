import { beforeEach, describe, expect, it } from 'vitest';
import { McqGenerator } from '../ai/McqGenerator.js';
import { MockProvider } from '../ai/MockProvider.js';
import type { Participant } from '../engagement/types.js';
import { FixedClock } from '../infra/Clock.js';
import { InMemoryMaterialRepository, InMemoryPracticeAnswerRepository, InMemoryPracticeQuestionRepository } from '../infra/memory/InMemoryContentRepositories.js';
import { DomainError } from '../shared/errors.js';
import { makeSession, T0 } from '../test/fixtures.js';
import { MaterialService, MAX_MATERIAL_BYTES } from './MaterialService.js';
import { PracticeService } from './PracticeService.js';

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.code);
const dana: Participant = { id: 'u1', studentNumber: '111', name: 'דנה' };
const missed: Participant = { id: 'u2', studentNumber: '222', name: 'אבי' }; // in the course, missed this lecture
const outsider: Participant = { id: 'u9', studentNumber: '999', name: 'זר' };

/** 111 and 222 attended some session of course1; 999 never did. */
const attendance = {
  async requireCourseParticipant(courseId: string, studentNumber: string) {
    if (courseId !== 'course1' || !['111', '222'].includes(studentNumber)) throw new DomainError('NOT_IN_COURSE', 'not in course');
  },
};

describe('PracticeService', () => {
  const session = makeSession({ status: 'ended' });
  let practice: PracticeService;

  beforeEach(() => {
    practice = new PracticeService(new InMemoryPracticeQuestionRepository(), new InMemoryPracticeAnswerRepository(), attendance, new McqGenerator(new MockProvider()), new FixedClock(T0));
  });

  const add = () => practice.add(session, { question: ' מה מבטיח LSP? ', options: ['SRP', ' החלפה בתת-מחלקה ', 'DIP'], correctIndex: 1 }, 'manual');

  it('is added after the lecture ended, trimmed, and needs a correct answer', async () => {
    expect(await add()).toMatchObject({ question: 'מה מבטיח LSP?', options: ['SRP', 'החלפה בתת-מחלקה', 'DIP'], correctIndex: 1, sessionId: session.id });
    expect(await code(practice.add(session, { question: 'q', options: ['a', 'b'], correctIndex: null }, 'ai'))).toBe('INVALID_POLL');
    expect(await code(practice.add(session, { question: 'q', options: ['a'], correctIndex: 0 }, 'manual'))).toBe('INVALID_POLL');
  });

  it('any course participant answers once and then learns the correct answer; outsiders cannot', async () => {
    const q = await add();
    expect(await practice.answer(session, q.id, missed, 0)).toMatchObject({ correct: false, correctIndex: 1, optionIndex: 0 });
    expect(await practice.answer(session, q.id, dana, 1)).toMatchObject({ correct: true, correctIndex: 1 });
    expect(await code(practice.answer(session, q.id, dana, 0))).toBe('ALREADY_ANSWERED');
    expect(await code(practice.answer(session, q.id, outsider, 1))).toBe('NOT_IN_COURSE');
    expect(await code(practice.answer(session, q.id, { ...dana, studentNumber: '222' }, 7))).toBe('INVALID_OPTION');
  });

  it('concurrent duplicate answers from one student count once', async () => {
    const q = await add();
    const results = await Promise.allSettled([practice.answer(session, q.id, dana, 1), practice.answer(session, q.id, dana, 0)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('a question from another lecture is not found; removed questions are gone', async () => {
    const q = await add();
    expect(await code(practice.answer(makeSession({ id: 'other' }), q.id, dana, 1))).toBe('NOT_FOUND');
    await practice.remove(q.id);
    expect(await code(practice.get(q.id))).toBe('NOT_FOUND');
  });
});

describe('MaterialService', () => {
  const session = makeSession({ status: 'ended' });
  let repo: InMemoryMaterialRepository;
  let materials: MaterialService;

  beforeEach(() => {
    repo = new InMemoryMaterialRepository();
    materials = new MaterialService(repo, new FixedClock(T0));
  });

  it('links: http(s) only, title defaults to the host', async () => {
    expect(await materials.addLink(session, '', 'https://refactoring.guru/design-patterns/observer')).toMatchObject({
      kind: 'link',
      title: 'refactoring.guru',
      url: 'https://refactoring.guru/design-patterns/observer',
      addedAt: T0,
    });
    expect(await code(materials.addLink(session, 'x', 'javascript:alert(1)'))).toBe('INVALID_LINK');
    expect(await code(materials.addLink(session, 'x', 'not a url'))).toBe('INVALID_LINK');
  });

  it('files: stored with the record, title defaults to the file name, empty and oversized rejected', async () => {
    const m = await materials.addFile(session, '', { data: Buffer.from('%PDF'), filename: 'slides-5.pdf', mimeType: 'application/pdf' });
    expect(m).toMatchObject({ kind: 'file', title: 'slides-5.pdf', filename: 'slides-5.pdf', url: '' });
    expect(repo.files.get(m.id)?.filename).toBe('slides-5.pdf');
    expect(await code(materials.addFile(session, 'x', { data: Buffer.alloc(0), filename: 'e.txt', mimeType: '' }))).toBe('EMPTY_FILE');
    expect(await code(materials.addFile(session, 'x', { data: Buffer.alloc(MAX_MATERIAL_BYTES + 1), filename: 'big.zip', mimeType: '' }))).toBe('FILE_TOO_LARGE');
    await materials.remove(m.id);
    expect(repo.files.has(m.id)).toBe(false);
    expect(await code(materials.get(m.id))).toBe('NOT_FOUND');
  });
});
