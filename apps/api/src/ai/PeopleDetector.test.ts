import { describe, expect, it } from 'vitest';
import { MockProvider } from './MockProvider.js';
import { PeopleDetector } from './PeopleDetector.js';

const photo = { mimeType: 'image/jpeg', data: Buffer.from('jpeg') };
const detect = (fixture: unknown) => new PeopleDetector(new MockProvider({ detect_people: fixture })).detect(photo);

describe('PeopleDetector (LLM contract)', () => {
  it('converts box_2d [ymin,xmin,ymax,xmax]/1000 into normalized {x,y,w,h}', async () => {
    const d = await detect({ people: [{ box_2d: [100, 200, 500, 400] }], confidence: 0.8 });
    expect(d.count).toBe(1);
    expect(d.confidence).toBe(0.8);
    expect(d.boxes[0].x).toBeCloseTo(0.2);
    expect(d.boxes[0].y).toBeCloseTo(0.1);
    expect(d.boxes[0].w).toBeCloseTo(0.2);
    expect(d.boxes[0].h).toBeCloseTo(0.4);
  });

  it('clamps out-of-range values and tolerates swapped corners', async () => {
    const d = await detect({ people: [{ box_2d: [1200, 900, -50, 700] }], confidence: 3 });
    expect(d.boxes[0]).toEqual({ x: 0.7, y: 0, w: expect.closeTo(0.2), h: 1 });
    expect(d.confidence).toBe(1);
  });

  it('drops malformed and degenerate boxes from the count', async () => {
    const d = await detect({
      people: [{ box_2d: [100, 100, 300, 300] }, { box_2d: [1, 2, 3] }, { box_2d: 'x' }, { box_2d: [100, 100, 101, 101] }, {}],
      confidence: 0.5,
    });
    expect(d.count).toBe(1);
  });

  it('rejects output without people[] or confidence', async () => {
    await expect(detect({ confidence: 0.5 })).rejects.toMatchObject({ code: 'LLM_OUTPUT' });
    await expect(detect({ people: [] })).rejects.toMatchObject({ code: 'LLM_OUTPUT' });
  });

  it('sends the photo and a JSON schema to the provider', async () => {
    const llm = new MockProvider();
    await new PeopleDetector(llm).detect(photo);
    expect(llm.calls[0]).toMatchObject({ task: 'detect_people', files: [photo], schema: { required: ['people', 'confidence'] } });
  });
});
