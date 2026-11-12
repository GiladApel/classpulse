/// <reference path="../pb_data/types.d.ts" />

// M10: the lecturer uploads the course roster and sets its weekly timetable. A course member is now a student
// on the roster OR one who attended a session (walk-ins and courses without a roster keep working).
// Live participation (posting, voting, challenges, feedback) still needs a check-in to that lesson.
const enrolledIn = (courseExpr) =>
  `(@collection.enrollments.course ?= ${courseExpr} && @collection.enrollments.student_number ?= @request.auth.student_id)`;
const attendedIn = (courseExpr) =>
  `(@collection.attendance_records.session.course ?= ${courseExpr} && @collection.attendance_records.student ?= @request.auth.id` +
  " && @collection.attendance_records.status ?!= 'removed')";
const memberOf = (courseExpr) => `(${enrolledIn(courseExpr)} || ${attendedIn(courseExpr)})`;

const COURSE_EXPRS = ["session.course", "assignment.course", "course"];
const MEMBER_COLLECTIONS = ["feed_posts", "polls", "recordings", "assignments", "assignment_insights", "practice_questions", "materials"];

const rewrite = (rule, from, to) => COURSE_EXPRS.reduce((r, expr) => r.split(from(expr)).join(to(expr)), rule);

const setMemberRules = (app, from, to) => {
  for (const name of MEMBER_COLLECTIONS) {
    const c = app.findCollectionByNameOrId(name);
    c.listRule = rewrite(c.listRule, from, to);
    c.viewRule = rewrite(c.viewRule, from, to);
    app.save(c);
  }
};

migrate(
  (app) => {
    const courses = app.findCollectionByNameOrId("courses");
    courses.fields.add(new DateField({ name: "term_start" }));
    courses.fields.add(new DateField({ name: "term_end" }));
    app.save(courses);

    app.save(
      new Collection({
        type: "base",
        name: "enrollments",
        // Students read only their own row, so nobody sees the roster except its lecturer.
        listRule: "course.lecturer = @request.auth.id || student_number = @request.auth.student_id",
        viewRule: "course.lecturer = @request.auth.id || student_number = @request.auth.student_id",
        fields: [
          { type: "relation", name: "course", required: true, collectionId: courses.id, maxSelect: 1, cascadeDelete: true },
          { type: "text", name: "student_number", required: true, max: 20, pattern: "^[0-9]+$" },
          { type: "text", name: "name", max: 80 },
          { type: "date", name: "added_at", required: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_enrollments_unique ON enrollments (course, student_number)"],
      }),
    );

    const slotRule = `course.lecturer = @request.auth.id || ${memberOf("course")}`;
    app.save(
      new Collection({
        type: "base",
        name: "course_slots",
        listRule: slotRule,
        viewRule: slotRule,
        fields: [
          { type: "relation", name: "course", required: true, collectionId: courses.id, maxSelect: 1, cascadeDelete: true },
          { type: "number", name: "weekday", min: 0, max: 6, onlyInt: true },
          { type: "text", name: "starts", required: true, pattern: "^[0-2][0-9]:[0-5][0-9]$" },
          { type: "text", name: "ends", required: true, pattern: "^[0-2][0-9]:[0-5][0-9]$" },
          { type: "text", name: "room", max: 40 },
        ],
        indexes: ["CREATE INDEX idx_course_slots_course ON course_slots (course)"],
      }),
    );

    setMemberRules(app, attendedIn, memberOf);
  },
  (app) => {
    setMemberRules(app, memberOf, attendedIn);
    app.delete(app.findCollectionByNameOrId("course_slots"));
    app.delete(app.findCollectionByNameOrId("enrollments"));
    const courses = app.findCollectionByNameOrId("courses");
    courses.fields.removeByName("term_start");
    courses.fields.removeByName("term_end");
    app.save(courses);
  },
);
