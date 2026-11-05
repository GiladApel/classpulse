import { MockProvider } from '../ai/MockProvider.js';
import type { Session } from '../attendance/types.js';
import { buildContainer, type Ports } from '../container.js';
import type { UserIdentity } from '../infra/pb/pbClient.js';
import { FixedClock } from '../infra/Clock.js';
import { CsvExporter } from '../infra/export/CsvExporter.js';
import type { ImageProcessor } from '../infra/ImageProcessor.js';
import { InMemoryRepository } from '../infra/InMemoryRepository.js';
import { InMemoryAttendanceRepository } from '../infra/memory/InMemoryAttendanceRepository.js';
import {
  InMemoryChallengeRepository,
  InMemoryChallengeResponseRepository,
  InMemoryHeadcountRepository,
} from '../infra/memory/InMemoryChallengeRepositories.js';
import { InMemoryCourseRepository } from '../infra/memory/InMemoryCourseRepository.js';
import { T0 } from './fixtures.js';

/** Records calls; returns tagged buffers so tests can tell clear from blurred. */
export class FakeImageProcessor implements ImageProcessor {
  readonly blurCalls: number[] = [];
  async normalize(img: Buffer) {
    return img;
  }
  async blur(img: Buffer, sigma: number) {
    this.blurCalls.push(sigma);
    return Buffer.concat([Buffer.from('BLUR:'), img]);
  }
}

export const USERS: Record<string, UserIdentity> = {
  lect: { id: 'lect1', name: 'ד״ר לוי', email: 'l@x', role: 'lecturer', studentNumber: '' },
  dana: { id: 'u1', name: 'דנה כהן', email: 'd@x', role: 'student', studentNumber: '111111111' },
  avi: { id: 'u2', name: 'אבי', email: 'a@x', role: 'student', studentNumber: '222222222' },
  rina: { id: 'u4', name: 'רינה', email: 'r@x', role: 'student', studentNumber: '444444444' },
  fresh: { id: 'u3', name: 'חדש', email: 'n@x', role: 'student', studentNumber: '' },
};

export function makeTestPorts(over: Partial<Ports> = {}) {
  const clock = new FixedClock(T0);
  const ports: Ports = {
    clock,
    attendanceRepo: new InMemoryAttendanceRepository(),
    sessionRepo: new InMemoryRepository<Session>(),
    courseRepo: new InMemoryCourseRepository([{ id: 'c1', code: 'I2SE', name: 'הנדסת תוכנה', lecturerId: 'lect1' }]),
    headcountRepo: new InMemoryHeadcountRepository(),
    challengeRepo: new InMemoryChallengeRepository(),
    responseRepo: new InMemoryChallengeResponseRepository(),
    exporters: new Map([['csv' as const, new CsvExporter()]]),
    llm: new MockProvider(),
    images: new FakeImageProcessor(),
    resolveUser: async (t: string) => USERS[t] ?? null,
    qrWindowSec: 10,
    ...over,
  };
  return { ports, clock, container: buildContainer(ports) };
}
