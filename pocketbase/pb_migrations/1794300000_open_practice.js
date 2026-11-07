/// <reference path="../pb_data/types.d.ts" />

// Practice questions become open review questions: no options, no correct answer, nothing for students to submit.
migrate(
  (app) => {
    const questions = app.findCollectionByNameOrId("practice_questions");
    questions.fields.removeByName("options");
    questions.fields.removeByName("correct_index");
    app.save(questions);
    app.delete(app.findCollectionByNameOrId("practice_answers"));
  },
  (app) => {
    const questions = app.findCollectionByNameOrId("practice_questions");
    questions.fields.add(new JSONField({ name: "options", maxSize: 5000 }));
    questions.fields.add(new NumberField({ name: "correct_index", hidden: true }));
    app.save(questions);
    const users = app.findCollectionByNameOrId("users");
    app.save(
      new Collection({
        type: "base",
        name: "practice_answers",
        listRule: "student = @request.auth.id || question.session.course.lecturer = @request.auth.id",
        viewRule: "student = @request.auth.id || question.session.course.lecturer = @request.auth.id",
        fields: [
          { type: "relation", name: "question", required: true, collectionId: questions.id, maxSelect: 1, cascadeDelete: true },
          { type: "relation", name: "student", collectionId: users.id, maxSelect: 1 },
          { type: "text", name: "student_number", required: true, max: 20 },
          { type: "number", name: "option_index", min: 0 },
          { type: "bool", name: "correct" },
          { type: "number", name: "correct_index", min: 0 },
          { type: "date", name: "answered_at", required: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_practice_answers_unique ON practice_answers (question, student_number)"],
      }),
    );
  },
);
