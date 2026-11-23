import type { UserRepository } from '../admin/types.js';
import { attendanceTable, type ExportFormat, type ExportOutput, type SpreadsheetExporter } from '../infra/export/SpreadsheetExporter.js';
import { DomainError } from '../shared/errors.js';
import type { AttendanceRepository, CourseRepository } from './repositories.js';
import type { Session } from './types.js';

export class AttendanceExportService {
  constructor(
    private readonly repo: AttendanceRepository,
    private readonly courses: CourseRepository,
    private readonly users: Pick<UserRepository, 'get'>,
    private readonly exporters: Map<ExportFormat, SpreadsheetExporter>,
  ) {}

  formats(): ExportFormat[] {
    return [...this.exporters.keys()];
  }

  async export(session: Session, format: ExportFormat): Promise<ExportOutput> {
    const exporter = this.exporters.get(format);
    if (!exporter) throw new DomainError('EXPORT_UNAVAILABLE', `Export format ${format} is not configured`);
    const [records, course] = await Promise.all([this.repo.listBySession(session.id), this.courses.get(session.courseId)]);
    // Students are known by the email they sign in with, so the sheet lists it next to the name.
    const ids = [...new Set(records.map((r) => r.studentId).filter((id): id is string => !!id))];
    const users = await Promise.all(ids.map((id) => this.users.get(id)));
    const emails = new Map(users.filter((u) => u !== null).map((u) => [u.id, u.email]));
    return exporter.export(attendanceTable(records, emails), { title: session.title, courseName: course?.name ?? '', startedAt: session.startedAt });
  }
}
