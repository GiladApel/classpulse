/// <reference path="../pb_data/types.d.ts" />

// The rubric is the lecturer's: its outline (requirements) and the lecturer's notes to the AI are hidden; students see
// only the homework PDF and the feedback on their own checks. After the practice checks a student hands in once: the
// files are kept for the lecturer, and the AI's grade of them is hidden from the student.
migrate(
  (app) => {
    const assignments = app.findCollectionByNameOrId("assignments");
    assignments.fields.add(new TextField({ name: "rubric_notes", max: 3000, hidden: true }));
    assignments.fields.getByName("outline").hidden = true;
    app.save(assignments);

    const submissions = app.findCollectionByNameOrId("submissions");
    submissions.fields.add(new DateField({ name: "handed_in_at" }));
    submissions.fields.add(
      new FileField({
        name: "files",
        maxSelect: 10,
        maxSize: 20971520,
        mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
        protected: true,
      }),
    );
    submissions.fields.add(new SelectField({ name: "final_status", values: ["processing", "done", "failed"], maxSelect: 1 }));
    submissions.fields.add(new TextField({ name: "final_error", max: 500 }));
    submissions.fields.add(new JSONField({ name: "final_report", maxSize: 200000, hidden: true }));
    submissions.fields.add(new NumberField({ name: "final_total", min: 0, max: 100, onlyInt: true, hidden: true }));
    app.save(submissions);
  },
  (app) => {
    const assignments = app.findCollectionByNameOrId("assignments");
    assignments.fields.removeByName("rubric_notes");
    assignments.fields.getByName("outline").hidden = false;
    app.save(assignments);

    const submissions = app.findCollectionByNameOrId("submissions");
    for (const name of ["handed_in_at", "files", "final_status", "final_error", "final_report", "final_total"]) submissions.fields.removeByName(name);
    app.save(submissions);
  },
);
