import type { UserRepository } from './admin/types.js';
import { UserAdminService } from './admin/UserAdminService.js';
import { FeedClusterer } from './ai/FeedClusterer.js';
import { HomeworkGuideGenerator } from './ai/HomeworkGuideGenerator.js';
import { HomeworkReviewer } from './ai/HomeworkReviewer.js';
import { LectureSummarizer } from './ai/LectureSummarizer.js';
import type { LLMProvider } from './ai/LLMProvider.js';
import { LLMProviderFactory } from './ai/LLMProviderFactory.js';
import { McqGenerator } from './ai/McqGenerator.js';
import { PracticeQuestionGenerator } from './ai/PracticeQuestionGenerator.js';
import { PeopleDetector } from './ai/PeopleDetector.js';
import { AttendanceExportService } from './attendance/AttendanceExportService.js';
import { AttendanceService } from './attendance/AttendanceService.js';
import { CourseService } from './attendance/CourseService.js';
import { DeviceBindingRule } from './attendance/DeviceBindingRule.js';
import { DuplicateStudentRule } from './attendance/DuplicateStudentRule.js';
import { LessonAccess } from './attendance/LessonAccess.js';
import { QrTokenService } from './attendance/QrTokenService.js';
import type { AttendanceRepository, CourseRepository, CourseSlotRepository, EnrollmentRepository, SessionRepository } from './attendance/repositories.js';
import { RosterParser } from './attendance/RosterParser.js';
import { SessionActiveRule } from './attendance/SessionActiveRule.js';
import { SessionService } from './attendance/SessionService.js';
import { TokenRule } from './attendance/TokenRule.js';
import { type ChallengeOptions, ChallengeManager } from './challenge/ChallengeManager.js';
import type { ChallengeRepository, ChallengeResponseRepository, HeadcountRepository } from './challenge/repositories.js';
import type { Config } from './config.js';
import { HomeworkAnalysisService } from './content/HomeworkAnalysisService.js';
import { MaterialService } from './content/MaterialService.js';
import { PracticeService } from './content/PracticeService.js';
import { RecordingPipeline } from './content/RecordingPipeline.js';
import type {
  AssignmentRepository,
  InsightsRepository,
  MaterialRepository,
  PracticeQuestionRepository,
  RecordingRepository,
  SubmissionRepository,
} from './content/repositories.js';
import { TextExtractor } from './content/TextExtractor.js';
import { ConfusionMeter } from './engagement/ConfusionMeter.js';
import { FeedService } from './engagement/FeedService.js';
import { FeedbackService } from './engagement/FeedbackService.js';
import { PollService } from './engagement/PollService.js';
import type {
  FeedPostRepository,
  LessonFeedbackRepository,
  LostSignalRepository,
  PollRepository,
  PollVoteRepository,
  PostVoteRepository,
} from './engagement/repositories.js';
import type { UserResolver } from './http/auth.js';
import { BackgroundQueue } from './infra/BackgroundQueue.js';
import type { Clock } from './infra/Clock.js';
import { SystemClock } from './infra/Clock.js';
import { CsvExporter } from './infra/export/CsvExporter.js';
import { GoogleSheetsExporter } from './infra/export/GoogleSheetsExporter.js';
import type { ExportFormat, SpreadsheetExporter } from './infra/export/SpreadsheetExporter.js';
import { XlsxExporter } from './infra/export/XlsxExporter.js';
import { type ImageProcessor, SharpImageProcessor } from './infra/ImageProcessor.js';
import { PbAttendanceRepository } from './infra/pb/PbAttendanceRepository.js';
import { PbChallengeRepository, PbChallengeResponseRepository, PbHeadcountRepository } from './infra/pb/PbChallengeRepositories.js';
import { createSuperuserClient, resolveUser } from './infra/pb/pbClient.js';
import {
  PbAssignmentRepository,
  PbInsightsRepository,
  PbMaterialRepository,
  PbPracticeQuestionRepository,
  PbRecordingRepository,
  PbSubmissionRepository,
} from './infra/pb/PbContentRepositories.js';
import { PbCourseRepository } from './infra/pb/PbCourseRepository.js';
import { PbCourseSlotRepository, PbEnrollmentRepository } from './infra/pb/PbEnrollmentRepositories.js';
import {
  PbFeedPostRepository,
  PbLessonFeedbackRepository,
  PbLostSignalRepository,
  PbPollRepository,
  PbPollVoteRepository,
  PbPostVoteRepository,
} from './infra/pb/PbEngagementRepositories.js';
import { PbSessionRepository } from './infra/pb/PbSessionRepository.js';
import { PbUserRepository } from './infra/pb/PbUserRepository.js';
import { UploadStore } from './infra/UploadStore.js';

export interface Container {
  clock: Clock;
  tokens: QrTokenService;
  sessions: SessionService;
  courses: CourseService;
  attendance: AttendanceService;
  exports: AttendanceExportService;
  challenges: ChallengeManager;
  confusion: ConfusionMeter;
  feed: FeedService;
  feedback: FeedbackService;
  polls: PollService;
  recordings: RecordingPipeline;
  homework: HomeworkAnalysisService;
  practice: PracticeService;
  materials: MaterialService;
  admins: UserAdminService;
  /** Background AI jobs (summaries, reviews); tests await queue.idle(). */
  queue: BackgroundQueue;
  resolveUser: UserResolver;
}

export interface Ports {
  clock: Clock;
  attendanceRepo: AttendanceRepository;
  sessionRepo: SessionRepository;
  courseRepo: CourseRepository;
  enrollmentRepo: EnrollmentRepository;
  slotRepo: CourseSlotRepository;
  userRepo: UserRepository;
  adminEmails: string[];
  headcountRepo: HeadcountRepository;
  challengeRepo: ChallengeRepository;
  responseRepo: ChallengeResponseRepository;
  lostRepo: LostSignalRepository;
  postRepo: FeedPostRepository;
  postVoteRepo: PostVoteRepository;
  feedbackRepo: LessonFeedbackRepository;
  pollRepo: PollRepository;
  pollVoteRepo: PollVoteRepository;
  recordingRepo: RecordingRepository;
  assignmentRepo: AssignmentRepository;
  submissionRepo: SubmissionRepository;
  insightsRepo: InsightsRepository;
  practiceRepo: PracticeQuestionRepository;
  materialRepo: MaterialRepository;
  uploads: UploadStore;
  exporters: Map<ExportFormat, SpreadsheetExporter>;
  llm: LLMProvider;
  images: ImageProcessor;
  resolveUser: UserResolver;
  qrWindowSec: number;
  challengeOptions?: Partial<ChallengeOptions>;
}

/** Composition root: the only place that knows concrete classes. */
export function buildContainer(p: Ports): Container {
  const tokens = new QrTokenService(p.clock, p.qrWindowSec);
  // Duplicate first: a student already present who reopens a stale link should see their record, not "expired".
  const rules = [
    new DuplicateStudentRule(p.attendanceRepo),
    new TokenRule(tokens),
    new SessionActiveRule(),
    new DeviceBindingRule(p.attendanceRepo),
  ];
  const attendance = new AttendanceService(rules, p.attendanceRepo, p.clock);
  const courses = new CourseService(p.courseRepo, p.enrollmentRepo, p.slotRepo, p.attendanceRepo, new RosterParser(), p.clock);
  // The forum, polls and "I'm lost" are open to the whole course; attendance and challenges stay with those in the room.
  const lesson = new LessonAccess(attendance, p.sessionRepo, courses);
  const confusion = new ConfusionMeter(p.lostRepo, { requireParticipant: (s, n) => lesson.requireParticipant(s, n), presentCount: (s) => attendance.presentCount(s) }, p.clock);
  const queue = new BackgroundQueue();
  return {
    clock: p.clock,
    tokens,
    sessions: new SessionService(p.sessionRepo, p.courseRepo, tokens, p.clock, p.headcountRepo),
    courses,
    attendance,
    exports: new AttendanceExportService(p.attendanceRepo, p.courseRepo, p.exporters),
    challenges: new ChallengeManager(
      new PeopleDetector(p.llm),
      p.images,
      p.headcountRepo,
      p.challengeRepo,
      p.responseRepo,
      attendance,
      tokens,
      p.clock,
      p.challengeOptions,
    ),
    confusion,
    feed: new FeedService(p.postRepo, p.postVoteRepo, lesson, new FeedClusterer(p.llm), p.clock),
    feedback: new FeedbackService(p.feedbackRepo, attendance, p.clock),
    polls: new PollService(p.pollRepo, p.pollVoteRepo, lesson, new McqGenerator(p.llm), p.clock),
    recordings: new RecordingPipeline(p.recordingRepo, p.uploads, new LectureSummarizer(p.llm), confusion, attendance, queue, p.clock),
    homework: new HomeworkAnalysisService(
      p.assignmentRepo,
      p.submissionRepo,
      p.insightsRepo,
      new TextExtractor(),
      new HomeworkGuideGenerator(p.llm),
      new HomeworkReviewer(p.llm),
      courses,
      queue,
      p.clock,
    ),
    practice: new PracticeService(p.practiceRepo, new PracticeQuestionGenerator(p.llm), p.clock),
    materials: new MaterialService(p.materialRepo, p.clock),
    admins: new UserAdminService(p.userRepo, p.adminEmails),
    queue,
    resolveUser: p.resolveUser,
  };
}

export async function buildProductionContainer(cfg: Config): Promise<Container> {
  const pb = await createSuperuserClient(cfg.pbUrl, cfg.pbSuperuserEmail, cfg.pbSuperuserPassword);
  const exporters = new Map<ExportFormat, SpreadsheetExporter>([
    ['xlsx', new XlsxExporter()],
    ['csv', new CsvExporter()],
  ]);
  if (cfg.googleServiceAccountFile && cfg.googleSheetsId) {
    exporters.set('sheets', new GoogleSheetsExporter(cfg.googleServiceAccountFile, cfg.googleSheetsId));
  }
  return buildContainer({
    clock: new SystemClock(),
    attendanceRepo: new PbAttendanceRepository(pb),
    sessionRepo: new PbSessionRepository(pb),
    courseRepo: new PbCourseRepository(pb),
    enrollmentRepo: new PbEnrollmentRepository(pb),
    slotRepo: new PbCourseSlotRepository(pb),
    userRepo: new PbUserRepository(pb),
    adminEmails: cfg.adminEmails,
    headcountRepo: new PbHeadcountRepository(pb),
    challengeRepo: new PbChallengeRepository(pb),
    responseRepo: new PbChallengeResponseRepository(pb),
    lostRepo: new PbLostSignalRepository(pb),
    postRepo: new PbFeedPostRepository(pb),
    postVoteRepo: new PbPostVoteRepository(pb),
    feedbackRepo: new PbLessonFeedbackRepository(pb),
    pollRepo: new PbPollRepository(pb),
    pollVoteRepo: new PbPollVoteRepository(pb),
    recordingRepo: new PbRecordingRepository(pb),
    assignmentRepo: new PbAssignmentRepository(pb),
    submissionRepo: new PbSubmissionRepository(pb),
    insightsRepo: new PbInsightsRepository(pb),
    practiceRepo: new PbPracticeQuestionRepository(pb),
    materialRepo: new PbMaterialRepository(pb),
    uploads: new UploadStore(),
    exporters,
    llm: LLMProviderFactory.create(cfg.ai),
    images: new SharpImageProcessor(),
    resolveUser: (token) => resolveUser(cfg.pbUrl, token),
    qrWindowSec: cfg.qrWindowSec,
  });
}
