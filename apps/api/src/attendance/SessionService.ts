import { randomBytes } from 'node:crypto';
import type { HeadcountRepository } from '../challenge/repositories.js';
import type { Clock } from '../infra/Clock.js';
import { DomainError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import type { QrTokenService } from './QrTokenService.js';
import type { CourseRepository, SessionRepository } from './repositories.js';
import type { Course, GeofenceMode, GeoPoint, Session } from './types.js';

export interface StartSessionInput {
  courseId: string;
  title: string;
  location?: GeoPoint;
  geofenceMode: GeofenceMode;
  geofenceRadiusM: number;
}

export interface QrTicket {
  token: string;
  refreshInMs: number;
}

export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly courses: CourseRepository,
    private readonly tokens: QrTokenService,
    private readonly clock: Clock,
    private readonly headcounts: Pick<HeadcountRepository, 'purgeClearPhotos'>,
  ) {}

  async start(lecturerId: string, input: StartSessionInput): Promise<Session> {
    const course = await this.courses.get(input.courseId);
    if (!course) throw new NotFoundError('Course');
    if (course.lecturerId !== lecturerId) throw new ForbiddenError('Not your course');
    return this.sessions.create({
      courseId: course.id,
      lecturerId,
      title: input.title,
      status: 'active',
      startedAt: this.clock.now(),
      location: input.location,
      geofenceMode: input.geofenceMode,
      geofenceRadiusM: input.geofenceRadiusM,
      qrSecret: randomBytes(32).toString('base64url'),
    });
  }

  async end(session: Session): Promise<Session> {
    if (session.status === 'ended') return session;
    const ended = await this.sessions.update(session.id, { status: 'ended', endedAt: this.clock.now() });
    await this.headcounts.purgeClearPhotos(session.id);
    return ended;
  }

  currentQrToken(session: Session): QrTicket {
    if (session.status !== 'active') throw new DomainError('SESSION_ENDED', 'Session has ended');
    return { token: this.tokens.issue(session.id, session.qrSecret), refreshInMs: this.tokens.msUntilNextWindow() };
  }

  async get(sessionId: string): Promise<Session> {
    const session = await this.sessions.get(sessionId);
    if (!session) throw new NotFoundError('Session');
    return session;
  }

  async getCourse(courseId: string): Promise<Course> {
    const course = await this.courses.get(courseId);
    if (!course) throw new NotFoundError('Course');
    return course;
  }

  async getOwnedCourse(courseId: string, lecturerId: string): Promise<Course> {
    const course = await this.getCourse(courseId);
    if (course.lecturerId !== lecturerId) throw new ForbiddenError('Not your course');
    return course;
  }

  async getOwned(sessionId: string, lecturerId: string): Promise<Session> {
    const session = await this.get(sessionId);
    if (session.lecturerId !== lecturerId) throw new ForbiddenError('Not your session');
    return session;
  }
}
