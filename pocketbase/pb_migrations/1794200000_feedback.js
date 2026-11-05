/// <reference path="../pb_data/types.d.ts" />

// M9: anonymous end-of-lecture feedback. No list/view rules at all: nobody, not even the lecturer, reads single
// answers through PocketBase. The API returns only the aggregate, and only from 3 responses (FeedbackService).
migrate(
  (app) => {
    const sessions = app.findCollectionByNameOrId("sessions");
    const users = app.findCollectionByNameOrId("users");
    app.save(
      new Collection({
        type: "base",
        name: "lesson_feedback",
        fields: [
          { type: "relation", name: "session", required: true, collectionId: sessions.id, maxSelect: 1, cascadeDelete: true },
          { type: "relation", name: "student", collectionId: users.id, maxSelect: 1, hidden: true },
          { type: "text", name: "student_number", required: true, max: 20, hidden: true },
          { type: "select", name: "rating", required: true, values: ["clear", "too_fast", "too_slow", "unclear"], maxSelect: 1 },
          { type: "text", name: "comment", max: 1000 },
          { type: "date", name: "submitted_at", required: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_feedback_unique ON lesson_feedback (session, student_number)"],
      }),
    );
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("lesson_feedback"));
  },
);
