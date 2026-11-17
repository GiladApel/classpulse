/// <reference path="../pb_data/types.d.ts" />

// The lecture report for the lecturer is a hidden field (students may read a published recording, never its report).
// A poll may close itself at closes_at; a lesson may hold students' questions until after class.
migrate(
  (app) => {
    const recordings = app.findCollectionByNameOrId("recordings");
    recordings.fields.add(new JSONField({ name: "coaching", maxSize: 100000, hidden: true }));
    recordings.fields.add(new TextField({ name: "coaching_error", max: 500 }));
    app.save(recordings);

    const polls = app.findCollectionByNameOrId("polls");
    polls.fields.add(new DateField({ name: "closes_at" }));
    app.save(polls);

    const sessions = app.findCollectionByNameOrId("sessions");
    sessions.fields.add(new BoolField({ name: "questions_paused" }));
    app.save(sessions);
  },
  (app) => {
    const recordings = app.findCollectionByNameOrId("recordings");
    recordings.fields.removeByName("coaching");
    recordings.fields.removeByName("coaching_error");
    app.save(recordings);

    const polls = app.findCollectionByNameOrId("polls");
    polls.fields.removeByName("closes_at");
    app.save(polls);

    const sessions = app.findCollectionByNameOrId("sessions");
    sessions.fields.removeByName("questions_paused");
    app.save(sessions);
  },
);
