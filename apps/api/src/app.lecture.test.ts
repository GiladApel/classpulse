import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { makeTestPorts, USERS } from './test/testContainer.js';

describe('HTTP: lecture page content after the lecture', () => {
  let app: ReturnType<typeof createApp>;

  const request = async (who: keyof typeof USERS, method: string, path: string, body?: FormData | object) => {
    const form = body instanceof FormData;
    const res = await app.request(path, {
      method,
      headers: { Authorization: `Bearer ${who}`, ...(form || body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  const lecture = async (...present: (keyof typeof USERS)[]) => {
    const id = (await request('lect', 'POST', '/sessions', { courseId: 'c1', title: 'L', geofenceMode: 'lenient', geofenceRadiusM: 50 })).body.id;
    for (const who of present) {
      const { token } = (await request('lect', 'GET', `/sessions/${id}/qr`)).body;
      await request(who, 'POST', '/checkins', { token, deviceId: `dev-${who}-${id}` });
    }
    await request('lect', 'POST', `/sessions/${id}/end`);
    return id as string;
  };

  beforeEach(() => {
    app = createApp(makeTestPorts().container);
  });

  it('practice: lecturer adds after the end; a participant who missed it answers once; an outsider cannot', async () => {
    const s1 = await lecture('dana');
    await lecture('avi'); // avi is in the course but missed s1; rina never attended

    expect((await request('dana', 'POST', `/sessions/${s1}/practice`, { question: 'q', options: ['a', 'b'], correctIndex: 0 })).status).toBe(403);
    const q = await request('lect', 'POST', `/sessions/${s1}/practice`, { question: 'מה מבטיח DIP?', options: ['תלות בממשקים', 'ירושה'], correctIndex: 0, source: 'ai' });
    expect(q.status).toBe(201);
    expect(q.body).toMatchObject({ correctIndex: 0, source: 'ai' });

    expect(await request('avi', 'POST', `/practice/${q.body.id}/answers`, { optionIndex: 1 })).toEqual({ status: 201, body: { correct: false, correctIndex: 0 } });
    expect((await request('avi', 'POST', `/practice/${q.body.id}/answers`, { optionIndex: 0 })).body.code).toBe('ALREADY_ANSWERED');
    expect((await request('rina', 'POST', `/practice/${q.body.id}/answers`, { optionIndex: 0 })).body.code).toBe('NOT_IN_COURSE');

    expect((await request('lect', 'GET', `/sessions/${s1}/practice`)).body.questions).toEqual([q.body]);
    expect((await request('avi', 'GET', `/sessions/${s1}/practice`)).status).toBe(403);
    expect((await request('lect', 'DELETE', `/practice/${q.body.id}`)).status).toBe(200);
    expect((await request('avi', 'POST', `/practice/${q.body.id}/answers`, { optionIndex: 0 })).status).toBe(404);
  });

  it('practice drafts from the slide deck: PDF or image only, lecturer of the session only', async () => {
    const s1 = await lecture('dana');
    const deck = (file: File) => {
      const form = new FormData();
      form.set('deck', file);
      return form;
    };
    const pdf = deck(new File(['%PDF-1.4'], 'lecture.pdf', { type: 'application/pdf' }));
    const drafts = await request('lect', 'POST', `/sessions/${s1}/practice/drafts`, pdf);
    expect(drafts.status).toBe(200);
    expect(drafts.body.drafts).toHaveLength(8);
    expect((await request('lect', 'GET', `/sessions/${s1}/practice`)).body.questions).toEqual([]);
    expect((await request('dana', 'POST', `/sessions/${s1}/practice/drafts`, pdf)).status).toBe(403);
    expect((await request('lect', 'POST', `/sessions/${s1}/practice/drafts`, new FormData())).status).toBe(400);
    const pptx = deck(new File(['x'], 'l.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }));
    expect((await request('lect', 'POST', `/sessions/${s1}/practice/drafts`, pptx)).status).toBe(400);
  });

  it('materials: a link and a file after the end; students cannot add or delete', async () => {
    const s1 = await lecture('dana');
    const link = await request('lect', 'POST', `/sessions/${s1}/materials`, { title: 'Observer', url: 'https://refactoring.guru/design-patterns/observer' });
    expect(link).toMatchObject({ status: 201, body: { kind: 'link', title: 'Observer' } });
    expect((await request('lect', 'POST', `/sessions/${s1}/materials`, { url: 'ftp://x' })).body.code).toBe('INVALID_LINK');

    const form = new FormData();
    form.set('file', new File(['%PDF-1.4'], 'slides.pdf', { type: 'application/pdf' }));
    form.set('title', 'שקפים');
    expect(await request('lect', 'POST', `/sessions/${s1}/materials`, form)).toMatchObject({ status: 201, body: { kind: 'file', title: 'שקפים', filename: 'slides.pdf' } });

    expect((await request('dana', 'POST', `/sessions/${s1}/materials`, { url: 'https://x.y' })).status).toBe(403);
    expect((await request('dana', 'DELETE', `/materials/${link.body.id}`)).status).toBe(403);
    expect((await request('lect', 'DELETE', `/materials/${link.body.id}`)).status).toBe(200);
  });

  it('the lecturer answers a question in writing after the lecture', async () => {
    const id = (await request('lect', 'POST', '/sessions', { courseId: 'c1', title: 'L', geofenceMode: 'lenient', geofenceRadiusM: 50 })).body.id;
    const { token } = (await request('lect', 'GET', `/sessions/${id}/qr`)).body;
    await request('dana', 'POST', '/checkins', { token, deviceId: 'dev-d' });
    const post = (await request('dana', 'POST', `/sessions/${id}/posts`, { text: 'למה Observer?', anonymous: true })).body;
    await request('lect', 'POST', `/sessions/${id}/end`);

    expect((await request('dana', 'POST', `/posts/${post.id}/answer`, { text: 'x' })).status).toBe(403);
    expect((await request('lect', 'POST', `/posts/${post.id}/answer`, { text: 'כדי שהלקוחות יתעדכנו בלי polling.' })).body).toMatchObject({
      answer: 'כדי שהלקוחות יתעדכנו בלי polling.',
      answered: true,
      displayName: null,
    });
  });

  it('feedback: only after the end, only for those present; the lecturer gets the aggregate from 3 answers', async () => {
    const id = (await request('lect', 'POST', '/sessions', { courseId: 'c1', title: 'L', geofenceMode: 'lenient', geofenceRadiusM: 50 })).body.id;
    for (const who of ['dana', 'avi', 'rina'] as const) {
      const { token } = (await request('lect', 'GET', `/sessions/${id}/qr`)).body;
      await request(who, 'POST', '/checkins', { token, deviceId: `dev-${who}` });
    }
    expect((await request('dana', 'POST', `/sessions/${id}/feedback`, { rating: 'clear' })).body.code).toBe('FEEDBACK_NOT_OPEN');
    await request('lect', 'POST', `/sessions/${id}/end`);

    expect((await request('dana', 'GET', `/sessions/${id}/feedback/status`)).body).toMatchObject({ open: true, submitted: false });
    expect((await request('dana', 'POST', `/sessions/${id}/feedback`, { rating: 'meh' })).status).toBe(400);
    expect((await request('dana', 'POST', `/sessions/${id}/feedback`, { rating: 'too_fast', comment: 'מהר מדי בסוף' })).status).toBe(201);
    expect((await request('avi', 'POST', `/sessions/${id}/feedback`, { rating: 'clear' })).status).toBe(201);
    expect((await request('lect', 'GET', `/sessions/${id}/feedback`)).body).toEqual({ responses: 2, visible: false, counts: null, comments: [] });
    expect((await request('dana', 'GET', `/sessions/${id}/feedback`)).status).toBe(403);

    expect((await request('rina', 'POST', `/sessions/${id}/feedback`, { rating: 'too_fast' })).status).toBe(201);
    expect((await request('lect', 'GET', `/sessions/${id}/feedback`)).body).toMatchObject({
      responses: 3,
      visible: true,
      counts: { clear: 1, too_fast: 2, too_slow: 0, unclear: 0 },
      comments: [{ rating: 'too_fast', text: 'מהר מדי בסוף' }],
    });
  });
});
