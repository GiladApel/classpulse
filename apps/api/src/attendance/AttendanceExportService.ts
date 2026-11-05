import type { ExportFormat, ExportOutput, SpreadsheetExporter } from '../infra/export/SpreadsheetExporter.js';
import { DomainError } from '../shared/errors.js';
import type { AttendanceRepository, CourseRepository } from './repositories.js';
import type { Session } from './types.js';

export class AttendanceExportService {
  constructor(
    private readonly repo: AttendanceRepository,
    private readonly courses: CourseRepository,
    private readonly exporters: Map<ExportFormat, SpreadsheetExporter>,
  ) {}

  formats(): ExportFormat[] {
    return [...this.exporters.keys()];
  }

  async export(session: Session, format: ExportFormat): Promise<ExportOutput> {
    const exporter = this.exporters.get(format);
    if (!exporter) throw new DomainError('EXPORT_UNAVAILABLE', `Export format ${format} is not configured`);
    const [records, course] = await Promise.all([this.repo.listBySession(session.id), this.courses.get(session.courseId)]);
    return exporter.export(records, { title: session.title, courseName: course?.name ?? '', startedAt: session.startedAt });
  }
}
