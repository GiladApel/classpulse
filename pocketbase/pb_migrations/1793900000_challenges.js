/// <reference path="../pb_data/types.d.ts" />

// M4: headcounts (class photo + AI detection), challenges, challenge_responses.
// Files are protected: downloading needs a file token AND passing the collection's view rule.
migrate(
  (app) => {
    const sessions = app.findCollectionByNameOrId("sessions");
    const users = app.findCollectionByNameOrId("users");
    const lecturerOf = "session.course.lecturer = @request.auth.id";

    const headcounts = new Collection({
      type: "base",
      name: "headcounts",
      listRule: lecturerOf,
      viewRule: lecturerOf,
      fields: [
        { type: "relation", name: "session", required: true, collectionId: sessions.id, maxSelect: 1, cascadeDelete: true },
        { type: "file", name: "photo", maxSelect: 1, maxSize: 15728640, mimeTypes: ["image/jpeg"], protected: true },
        { type: "file", name: "blurred_photo", maxSelect: 1, maxSize: 5242880, mimeTypes: ["image/jpeg"], protected: true },
        { type: "number", name: "people_count" },
        { type: "number", name: "confidence" },
        { type: "json", name: "boxes", maxSize: 200000 },
        { type: "number", name: "checkins_at_snap" },
        { type: "autodate", name: "created", onCreate: true },
      ],
    });
    app.save(headcounts);

    // Only the lecturer and students currently checked in to this session (not removed) see a challenge —
    // and therefore only they receive its realtime event.
    const checkedIn =
      "(@collection.attendance_records.session ?= session && @collection.attendance_records.student ?= @request.auth.id" +
      " && @collection.attendance_records.status ?!= 'removed')";
    const challenges = new Collection({
      type: "base",
      name: "challenges",
      listRule: `${lecturerOf} || ${checkedIn}`,
      viewRule: `${lecturerOf} || ${checkedIn}`,
      fields: [
        { type: "relation", name: "session", required: true, collectionId: sessions.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "headcount", collectionId: headcounts.id, maxSelect: 1 },
        { type: "select", name: "type", required: true, values: ["rollcall", "visual_ping"], maxSelect: 1 },
        { type: "select", name: "status", required: true, values: ["pending", "active", "closed"], maxSelect: 1 },
        { type: "date", name: "started_at", required: true },
        { type: "date", name: "expires_at", required: true },
        { type: "text", name: "secret", required: true, hidden: true },
        { type: "file", name: "image", maxSelect: 1, maxSize: 5242880, mimeTypes: ["image/jpeg"], protected: true },
      ],
      indexes: ["CREATE INDEX idx_challenges_session ON challenges (session, status)"],
    });
    app.save(challenges);

    const responses = new Collection({
      type: "base",
      name: "challenge_responses",
      listRule: "student = @request.auth.id || challenge.session.course.lecturer = @request.auth.id",
      viewRule: "student = @request.auth.id || challenge.session.course.lecturer = @request.auth.id",
      fields: [
        { type: "relation", name: "challenge", required: true, collectionId: challenges.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "student", collectionId: users.id, maxSelect: 1 },
        { type: "text", name: "student_number", required: true, max: 20 },
        { type: "number", name: "x" },
        { type: "number", name: "y" },
        { type: "date", name: "responded_at", required: true },
        { type: "select", name: "verdict", required: true, values: ["pending", "ok", "empty_seat", "collision", "no_response"], maxSelect: 1 },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_resp_challenge_student ON challenge_responses (challenge, student_number)"],
    });
    app.save(responses);
  },
  (app) => {
    for (const name of ["challenge_responses", "challenges", "headcounts"]) {
      app.delete(app.findCollectionByNameOrId(name));
    }
  },
);
