import { beforeEach, describe, expect, it } from 'vitest';
import { MockProvider } from '../ai/MockProvider.js';
import { LECTURE_QUESTIONS, PracticeQuestionGenerator } from '../ai/PracticeQuestionGenerator.js';
import { FixedClock } from '../infra/Clock.js';
import { InMemoryMaterialRepository, InMemoryPracticeQuestionRepository } from '../infra/memory/InMemoryContentRepositories.js';
import { DomainError } from '../shared/errors.js';
import { makeSession, T0 } from '../test/fixtures.js';
import { MaterialService, MAX_MATERIAL_BYTES } from './MaterialService.js';
import { PracticeService } from './PracticeService.js';

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.code);

describe('PracticeService', () => {
  const session = makeSession({ status: 'ended' });
  let practice: PracticeService;
  let llm: MockProvider;

  beforeEach(() => {
    llm = new MockProvider();
    practice = new PracticeService(new InMemoryPracticeQuestionRepository(), new PracticeQuestionGenerator(llm), new FixedClock(T0));
  });

  it('an open question is added after the lecture ended, trimmed; an empty one is rejected', async () => {
    expect(await practice.add(session, '  במה שונה State מ-Strategy? ', 'manual')).toMatchObject({ question: 'במה שונה State מ-Strategy?', sessionId: session.id, source: 'manual' });
    expect(await code(practice.add(session, '   ', 'ai'))).toBe('INVALID_QUESTION');
  });

  it('drafts from the deck are not saved; removed questions are gone', async () => {
    const deck = { mimeType: 'application/pdf', data: Buffer.from('%PDF') };
    expect(await practice.draftFromLecture(deck)).toHaveLength(8);
    expect(llm.calls[0]).toMatchObject({ task: 'generate_practice', files: [deck] });
    const q = await practice.add(session, 'q', 'ai');
    await practice.remove(q.id);
    expect(await code(practice.get(q.id))).toBe('NOT_FOUND');
    expect(await code(practice.remove(q.id))).toBe('NOT_FOUND');
  });
});

describe('PracticeQuestionGenerator', () => {
  const deck = { mimeType: 'application/pdf', data: Buffer.from('%PDF') };

  it('keeps up to 8 trimmed, distinct questions and drops empty, too long or non-text ones', async () => {
    const many = ['  q0 ', 'q0', '', 'x'.repeat(301), 7, ...Array.from({ length: 10 }, (_, i) => `q${i + 1}`)];
    const llm = new MockProvider({ generate_practice: { questions: many } });
    const out = await new PracticeQuestionGenerator(llm).fromLecture(deck);
    expect(out).toEqual(['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
    expect(out).toHaveLength(LECTURE_QUESTIONS);
    expect(llm.calls[0].prompt).toContain(`exactly ${LECTURE_QUESTIONS}`);
  });

  it('throws when nothing usable comes back', async () => {
    const llm = new MockProvider({ generate_practice: { questions: [' ', null] } });
    await expect(new PracticeQuestionGenerator(llm).fromLecture(deck)).rejects.toThrow('no valid questions');
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
