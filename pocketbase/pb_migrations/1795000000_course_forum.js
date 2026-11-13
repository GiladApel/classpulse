/// <reference path="../pb_data/types.d.ts" />

// Every post belongs to a course; a post with no lesson is in the course forum, open to members at any time.
// A lesson's own questions are asked while it is live. Access is decided on `course` for both kinds.
const LECTURER = "course.lecturer = @request.auth.id";
const MEMBER =
  "((@collection.enrollments.course ?= course && @collection.enrollments.student_number ?= @request.auth.student_id) || " +
  "(@collection.attendance_records.session.course ?= course && @collection.attendance_records.student ?= @request.auth.id && @collection.attendance_records.status ?!= 'removed'))";
const OLD_MEMBER =
  "((@collection.enrollments.course ?= session.course && @collection.enrollments.student_number ?= @request.auth.student_id) || " +
  "(@collection.attendance_records.session.course ?= session.course && @collection.attendance_records.student ?= @request.auth.id && @collection.attendance_records.status ?!= 'removed'))";

migrate(
  (app) => {
    const courses = app.findCollectionByNameOrId("courses");
    const posts = app.findCollectionByNameOrId("feed_posts");
    posts.fields.add(new RelationField({ name: "course", collectionId: courses.id, maxSelect: 1, cascadeDelete: true }));
    app.save(posts);

    for (const r of app.findRecordsByFilter("feed_posts", "id != ''")) {
      const session = app.findRecordById("sessions", r.get("session"));
      r.set("course", session.get("course"));
      app.saveNoValidate(r);
    }

    posts.fields.getByName("course").required = true;
    posts.fields.getByName("session").required = false;
    posts.indexes.push("CREATE INDEX `idx_posts_course` ON `feed_posts` (`course`)");
    const rule = `${LECTURER} || ${MEMBER}`;
    posts.listRule = rule;
    posts.viewRule = rule;
    app.save(posts);

    const votes = app.findCollectionByNameOrId("post_votes");
    const voteRule = "voter = @request.auth.id || post.course.lecturer = @request.auth.id";
    votes.listRule = voteRule;
    votes.viewRule = voteRule;
    app.save(votes);
  },
  (app) => {
    for (const r of app.findRecordsByFilter("feed_posts", "session = ''")) app.delete(r);

    const votes = app.findCollectionByNameOrId("post_votes");
    const voteRule = "voter = @request.auth.id || post.session.course.lecturer = @request.auth.id";
    votes.listRule = voteRule;
    votes.viewRule = voteRule;
    app.save(votes);

    const posts = app.findCollectionByNameOrId("feed_posts");
    const rule = `session.course.lecturer = @request.auth.id || ${OLD_MEMBER}`;
    posts.listRule = rule;
    posts.viewRule = rule;
    posts.indexes = posts.indexes.filter((i) => !i.includes("idx_posts_course"));
    posts.fields.getByName("session").required = true;
    posts.fields.removeByName("course");
    app.save(posts);
  },
);
