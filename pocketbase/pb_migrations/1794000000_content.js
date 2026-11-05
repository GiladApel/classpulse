/// <reference path="../pb_data/types.d.ts" />

// M6: lecture recordings + AI summary, assignments + AI homework review. All writes go through the API.
migrate(
  (app) => {
    const sessions = app.findCollectionByNameOrId("sessions");
    const courses = app.findCollectionByNameOrId("courses");
    const users = app.findCollectionByNameOrId("users");
    // A course participant = attended (and was not removed from) at least one session of the course.
    const participantOf = (courseExpr) =>
      `(@collection.attendance_records.session.course ?= ${courseExpr} && @collection.attendance_records.student ?= @request.auth.id` +
      " && @collection.attendance_records.status ?!= 'removed')";

    // The recording itself is never stored: it lives in a temp file until Gemini has processed it.
    const recordings = new Collection({
      type: "base",
      name: "recordings",
      listRule: `session.course.lecturer = @request.auth.id || (published = true && ${participantOf("session.course")})`,
      viewRule: `session.course.lecturer = @request.auth.id || (published = true && ${participantOf("session.course")})`,
      fields: [
        { type: "relation", name: "session", required: true, collectionId: sessions.id, maxSelect: 1, cascadeDelete: true },
        { type: "select", name: "kind", required: true, values: ["media", "transcript"], maxSelect: 1 },
        { type: "text", name: "filename", required: true, max: 200 },
        { type: "text", name: "mime_type", required: true, max: 100 },
        { type: "number", name: "size_bytes", min: 1 },
        { type: "number", name: "offset_sec" },
        { type: "select", name: "status", required: true, values: ["uploading", "queued", "processing", "done", "failed"], maxSelect: 1 },
        { type: "text", name: "error", max: 500 },
        { type: "json", name: "summary", maxSize: 200000 },
        { type: "bool", name: "published" },
        { type: "date", name: "created_at", required: true },
        { type: "date", name: "processed_at" },
      ],
      indexes: ["CREATE INDEX idx_recordings_session ON recordings (session)"],
    });
    app.save(recordings);

    const assignments = new Collection({
      type: "base",
      name: "assignments",
      listRule: `course.lecturer = @request.auth.id || ${participantOf("course")}`,
      viewRule: `course.lecturer = @request.auth.id || ${participantOf("course")}`,
      fields: [
        { type: "relation", name: "course", required: true, collectionId: courses.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "title", required: true, max: 200 },
        { type: "text", name: "description", max: 5000 },
        { type: "json", name: "rubric", required: true, maxSize: 20000 },
        { type: "date", name: "due_at" },
        { type: "date", name: "created_at", required: true },
      ],
    });
    app.save(assignments);

    // text_extract and fingerprint are API-only: needed for analysis, never shown to anyone.
    const submissions = new Collection({
      type: "base",
      name: "submissions",
      listRule: "student = @request.auth.id || assignment.course.lecturer = @request.auth.id",
      viewRule: "student = @request.auth.id || assignment.course.lecturer = @request.auth.id",
      fields: [
        { type: "relation", name: "assignment", required: true, collectionId: assignments.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "student", collectionId: users.id, maxSelect: 1 },
        { type: "text", name: "student_number", required: true, max: 20 },
        { type: "text", name: "student_name", max: 100 },
        { type: "file", name: "file", maxSelect: 1, maxSize: 10485760, protected: true },
        { type: "text", name: "filename", max: 200 },
        { type: "text", name: "text_extract", hidden: true, max: 200000 },
        { type: "json", name: "fingerprint", hidden: true, maxSize: 20000 },
        { type: "select", name: "status", required: true, values: ["processing", "done", "failed"], maxSelect: 1 },
        { type: "text", name: "error", max: 500 },
        { type: "json", name: "review", maxSize: 50000 },
        { type: "number", name: "total" },
        { type: "bool", name: "late" },
        { type: "date", name: "submitted_at", required: true },
        { type: "date", name: "reviewed_at" },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_submissions_unique ON submissions (assignment, student_number)"],
    });
    app.save(submissions);

    // similar_pairs is hidden: the lecturer gets it through the API, students never.
    const insights = new Collection({
      type: "base",
      name: "assignment_insights",
      listRule: `assignment.course.lecturer = @request.auth.id || ${participantOf("assignment.course")}`,
      viewRule: `assignment.course.lecturer = @request.auth.id || ${participantOf("assignment.course")}`,
      fields: [
        { type: "relation", name: "assignment", required: true, collectionId: assignments.id, maxSelect: 1, cascadeDelete: true },
        { type: "number", name: "submission_count" },
        { type: "json", name: "distribution", maxSize: 20000 },
        { type: "json", name: "common_mistakes", maxSize: 20000 },
        { type: "json", name: "similar_pairs", hidden: true, maxSize: 50000 },
        { type: "date", name: "built_at", required: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_insights_assignment ON assignment_insights (assignment)"],
    });
    app.save(insights);
  },
  (app) => {
    for (const name of ["assignment_insights", "submissions", "assignments", "recordings"]) {
      app.delete(app.findCollectionByNameOrId(name));
    }
  },
);
