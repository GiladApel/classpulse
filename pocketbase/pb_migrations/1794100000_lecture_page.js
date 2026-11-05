/// <reference path="../pb_data/types.d.ts" />

// M8: a page per lecture for every course participant (including students who missed it): questions with the
// lecturer's answers, closed polls with results, practice questions and materials. All writes go through the API.
const lecturerOf = "session.course.lecturer = @request.auth.id";
const checkedIn =
  "(@collection.attendance_records.session ?= session && @collection.attendance_records.student ?= @request.auth.id" +
  " && @collection.attendance_records.status ?!= 'removed')";
const participantOf = (courseExpr) =>
  `(@collection.attendance_records.session.course ?= ${courseExpr} && @collection.attendance_records.student ?= @request.auth.id` +
  " && @collection.attendance_records.status ?!= 'removed')";

const OLD = {
  feed: `${lecturerOf} || ${checkedIn}`,
  polls: `${lecturerOf} || (${checkedIn} && status != 'draft')`,
};
const NEW = {
  // A participant of the course attended some session, so this also covers students checked in to this one.
  feed: `${lecturerOf} || ${participantOf("session.course")}`,
  polls: `${OLD.polls} || (${participantOf("session.course")} && status = 'closed')`,
};

const setRules = (app, name, rule) => {
  const c = app.findCollectionByNameOrId(name);
  c.listRule = rule;
  c.viewRule = rule;
  return c;
};

migrate(
  (app) => {
    const sessions = app.findCollectionByNameOrId("sessions");
    const users = app.findCollectionByNameOrId("users");

    const posts = setRules(app, "feed_posts", NEW.feed);
    posts.fields.add(new TextField({ name: "answer", max: 2000 }));
    app.save(posts);
    app.save(setRules(app, "polls", NEW.polls));

    // correct_index is hidden: a student reads it only from their own answer record, after answering.
    const questions = new Collection({
      type: "base",
      name: "practice_questions",
      listRule: `${lecturerOf} || ${participantOf("session.course")}`,
      viewRule: `${lecturerOf} || ${participantOf("session.course")}`,
      fields: [
        { type: "relation", name: "session", required: true, collectionId: sessions.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "question", required: true, max: 300 },
        { type: "json", name: "options", required: true, maxSize: 5000 },
        { type: "number", name: "correct_index", hidden: true },
        { type: "select", name: "source", required: true, values: ["manual", "ai"], maxSelect: 1 },
        { type: "date", name: "created_at", required: true },
      ],
      indexes: ["CREATE INDEX idx_practice_session ON practice_questions (session)"],
    });
    app.save(questions);

    const answers = new Collection({
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
    });
    app.save(answers);

    const materials = new Collection({
      type: "base",
      name: "materials",
      listRule: `${lecturerOf} || ${participantOf("session.course")}`,
      viewRule: `${lecturerOf} || ${participantOf("session.course")}`,
      fields: [
        { type: "relation", name: "session", required: true, collectionId: sessions.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "title", required: true, max: 200 },
        { type: "select", name: "kind", required: true, values: ["file", "link"], maxSelect: 1 },
        { type: "text", name: "url", max: 2000 },
        { type: "file", name: "file", maxSelect: 1, maxSize: 52428800, protected: true },
        { type: "text", name: "filename", max: 200 },
        { type: "date", name: "added_at", required: true },
      ],
      indexes: ["CREATE INDEX idx_materials_session ON materials (session)"],
    });
    app.save(materials);
  },
  (app) => {
    for (const name of ["materials", "practice_answers", "practice_questions"]) {
      app.delete(app.findCollectionByNameOrId(name));
    }
    const posts = setRules(app, "feed_posts", OLD.feed);
    posts.fields.removeByName("answer");
    app.save(posts);
    app.save(setRules(app, "polls", OLD.polls));
  },
);
