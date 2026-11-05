import { AttendanceExportService } from './attendance/AttendanceExportService.js';
import { AttendanceService } from './attendance/AttendanceService.js';
import { DeviceBindingRule } from './attendance/DeviceBindingRule.js';
import { DuplicateStudentRule } from './attendance/DuplicateStudentRule.js';
import { QrTokenService } from './attendance/QrTokenService.js';
import type { AttendanceRepository, CourseRepository, SessionRepository } from './attendance/repositories.js';
import { SessionActiveRule } from './attendance/SessionActiveRule.js';
import { SessionService } from './attendance/SessionService.js';
import { TokenRule } from './attendance/TokenRule.js';
import type { Config } from './config.js';
import type { UserResolver } from './http/auth.js';
import type { Clock } from './infra/Clock.js';
import { SystemClock } from './infra/Clock.js';
import { CsvExporter } from './infra/export/CsvExporter.js';
import { GoogleSheetsExporter } from './infra/export/GoogleSheetsExporter.js';
import type { ExportFormat, SpreadsheetExporter } from './infra/export/SpreadsheetExporter.js';
import { XlsxExporter } from './infra/export/XlsxExporter.js';
import { PbAttendanceRepository } from './infra/pb/PbAttendanceRepository.js';
import { createSuperuserClient, resolveUser } from './infra/pb/pbClient.js';
import { PbCourseRepository } from './infra/pb/PbCourseRepository.js';
import { PbSessionRepository } from './infra/pb/PbSessionRepository.js';

export interface Container {
  clock: Clock;
  tokens: QrTokenService;
  sessions: SessionService;
  attendance: AttendanceService;
  exports: AttendanceExportService;
  resolveUser: UserResolver;
}

export interface Ports {
  clock: Clock;
  attendanceRepo: AttendanceRepository;
  sessionRepo: SessionRepository;
  courseRepo: CourseRepository;
  exporters: Map<ExportFormat, SpreadsheetExporter>;
  resolveUser: UserResolver;
  qrWindowSec: number;
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
  return {
    clock: p.clock,
    tokens,
    sessions: new SessionService(p.sessionRepo, p.courseRepo, tokens, p.clock),
    attendance: new AttendanceService(rules, p.attendanceRepo, p.clock),
    exports: new AttendanceExportService(p.attendanceRepo, p.courseRepo, p.exporters),
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
    exporters,
    resolveUser: (token) => resolveUser(cfg.pbUrl, token),
    qrWindowSec: cfg.qrWindowSec,
  });
}
