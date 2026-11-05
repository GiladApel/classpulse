/// <reference path="../pb_data/types.d.ts" />

// M3 schema: users (extended), courses, sessions, attendance_records.
// All business-rule writes go through the API (superuser), so create/update rules are null on domain collections.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new TextField({ name: "student_id", max: 20, pattern: "^[0-9]*$" }));
    users.fields.add(new SelectField({ name: "role", values: ["student", "lecturer"], maxSelect: 1 }));
    users.indexes.push("CREATE UNIQUE INDEX idx_users_student_id ON users (student_id) WHERE student_id != ''");
    users.listRule = "id = @request.auth.id || @request.auth.role = 'lecturer'";
    users.viewRule = "id = @request.auth.id || @request.auth.role = 'lecturer'";
    // Users may set their own student_id once and never change their role.
    users.updateRule =
      "id = @request.auth.id && (@request.body.role:isset = false || @request.body.role = role) && " +
      "(@request.body.student_id:isset = false || student_id = '' || @request.body.student_id = student_id)";
    app.save(users);

    const courses = new Collection({
      type: "base",
      name: "courses",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      fields: [
        { type: "text", name: "code", required: true, max: 20 },
        { type: "text", name: "name", required: true, max: 120 },
        { type: "relation", name: "lecturer", required: true, collectionId: users.id, maxSelect: 1 },
        { type: "autodate", name: "created", onCreate: true },
      ],
    });
    app.save(courses);

    const sessions = new Collection({
      type: "base",
      name: "sessions",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      fields: [
        { type: "relation", name: "course", required: true, collectionId: courses.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "title", required: true, max: 120 },
        { type: "select", name: "status", required: true, values: ["active", "ended"], maxSelect: 1 },
        { type: "date", name: "started_at", required: true },
        { type: "date", name: "ended_at" },
        { type: "number", name: "geo_lat" },
        { type: "number", name: "geo_lng" },
        { type: "number", name: "geo_radius_m", min: 10, max: 2000 },
        { type: "select", name: "geofence_mode", required: true, values: ["lenient", "strict"], maxSelect: 1 },
        { type: "text", name: "qr_secret", required: true, hidden: true },
      ],
      indexes: ["CREATE INDEX idx_sessions_course ON sessions (course)"],
    });
    app.save(sessions);

    const attendance = new Collection({
      type: "base",
      name: "attendance_records",
      listRule: "student = @request.auth.id || session.course.lecturer = @request.auth.id",
      viewRule: "student = @request.auth.id || session.course.lecturer = @request.auth.id",
      fields: [
        { type: "relation", name: "session", required: true, collectionId: sessions.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "student", collectionId: users.id, maxSelect: 1 },
        { type: "text", name: "student_number", required: true, max: 20 },
        { type: "text", name: "student_name", max: 80 },
        { type: "text", name: "device_id", max: 64 },
        { type: "date", name: "checked_in_at", required: true },
        { type: "select", name: "method", required: true, values: ["qr", "manual"], maxSelect: 1 },
        { type: "number", name: "distance_m" },
        { type: "bool", name: "geo_flag" },
        { type: "select", name: "status", required: true, values: ["present", "flagged", "removed"], maxSelect: 1 },
        { type: "text", name: "note", max: 200 },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_att_session_student ON attendance_records (session, student_number)",
        "CREATE UNIQUE INDEX idx_att_session_device ON attendance_records (session, device_id) WHERE device_id != ''",
      ],
    });
    app.save(attendance);
  },
  (app) => {
    for (const name of ["attendance_records", "sessions", "courses"]) {
      app.delete(app.findCollectionByNameOrId(name));
    }
    const users = app.findCollectionByNameOrId("users");
    users.fields.removeByName("student_id");
    users.fields.removeByName("role");
    users.indexes = users.indexes.filter((i) => !i.includes("idx_users_student_id"));
    app.save(users);
  },
);
