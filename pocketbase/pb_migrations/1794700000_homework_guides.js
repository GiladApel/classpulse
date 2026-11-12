/// <reference path="../pb_data/types.d.ts" />

// Homework is published as a PDF; the AI turns it into a review guide (questions, sections, requirements) used
// unchanged for every check. The guide holds the expected answers, so it is hidden; students see the outline only.
// A student's solution is never stored: a submission keeps the scores, the report and a text fingerprint.
// Assignments from the rubric format have no PDF and cannot be checked, so they are removed.
migrate(
  (app) => {
    for (const r of app.findRecordsByFilter("assignments", "id != ''")) app.delete(r);

    const sessions = app.findCollectionByNameOrId("sessions");
    const assignments = app.findCollectionByNameOrId("assignments");
    assignments.fields.removeByName("rubric");
    assignments.fields.removeByName("description");
    assignments.fields.add(new RelationField({ name: "session", collectionId: sessions.id, maxSelect: 1, cascadeDelete: false }));
    assignments.fields.add(new FileField({ name: "file", maxSelect: 1, maxSize: 20971520, mimeTypes: ["application/pdf"], protected: true }));
    assignments.fields.add(new JSONField({ name: "outline", maxSize: 100000 }));
    assignments.fields.add(new JSONField({ name: "guide", maxSize: 300000, hidden: true }));
    assignments.fields.add(new SelectField({ name: "guide_status", required: true, values: ["generating", "ready", "failed"], maxSelect: 1 }));
    assignments.fields.add(new TextField({ name: "guide_error", max: 500 }));
    app.save(assignments);

    const submissions = app.findCollectionByNameOrId("submissions");
    for (const name of ["file", "filename", "text_extract", "review"]) submissions.fields.removeByName(name);
    submissions.fields.add(new NumberField({ name: "check_count", min: 0, onlyInt: true }));
    submissions.fields.add(new JSONField({ name: "report", maxSize: 200000 }));
    app.save(submissions);

    const insights = app.findCollectionByNameOrId("assignment_insights");
    insights.fields.removeByName("distribution");
    app.save(insights);
  },
  (app) => {
    for (const r of app.findRecordsByFilter("assignments", "id != ''")) app.delete(r);

    const assignments = app.findCollectionByNameOrId("assignments");
    for (const name of ["session", "file", "outline", "guide", "guide_status", "guide_error"]) assignments.fields.removeByName(name);
    assignments.fields.add(new TextField({ name: "description", max: 5000 }));
    assignments.fields.add(new JSONField({ name: "rubric", required: true, maxSize: 20000 }));
    app.save(assignments);

    const submissions = app.findCollectionByNameOrId("submissions");
    submissions.fields.removeByName("check_count");
    submissions.fields.removeByName("report");
    submissions.fields.add(new FileField({ name: "file", maxSelect: 1, maxSize: 10485760, protected: true }));
    submissions.fields.add(new TextField({ name: "filename", max: 200 }));
    submissions.fields.add(new TextField({ name: "text_extract", hidden: true, max: 200000 }));
    submissions.fields.add(new JSONField({ name: "review", maxSize: 50000 }));
    app.save(submissions);

    const insights = app.findCollectionByNameOrId("assignment_insights");
    insights.fields.add(new JSONField({ name: "distribution", maxSize: 20000 }));
    app.save(insights);
  },
);
