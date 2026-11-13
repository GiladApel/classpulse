/// <reference path="../pb_data/types.d.ts" />

// A lesson's polls are for the whole course, in the room or at home: every course member sees an open poll (and
// votes through the API), not only those checked in to that lesson. Drafts stay with the lecturer.
const LECTURER = "session.course.lecturer = @request.auth.id";
const MEMBER =
  "((@collection.enrollments.course ?= session.course && @collection.enrollments.student_number ?= @request.auth.student_id) || " +
  "(@collection.attendance_records.session.course ?= session.course && @collection.attendance_records.student ?= @request.auth.id && @collection.attendance_records.status ?!= 'removed'))";
const CHECKED_IN =
  "(@collection.attendance_records.session ?= session && @collection.attendance_records.student ?= @request.auth.id && @collection.attendance_records.status ?!= 'removed')";

migrate(
  (app) => {
    const polls = app.findCollectionByNameOrId("polls");
    const rule = `${LECTURER} || (${MEMBER} && status != 'draft')`;
    polls.listRule = rule;
    polls.viewRule = rule;
    app.save(polls);
  },
  (app) => {
    const polls = app.findCollectionByNameOrId("polls");
    const rule = `${LECTURER} || (${CHECKED_IN} && status != 'draft') || (${MEMBER} && status = 'closed')`;
    polls.listRule = rule;
    polls.viewRule = rule;
    app.save(polls);
  },
);
