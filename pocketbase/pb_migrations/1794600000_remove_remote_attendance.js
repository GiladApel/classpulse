/// <reference path="../pb_data/types.d.ts" />

// Attendance is taken in the room only (QR, or the lecturer's manual approval). Remote records already stored
// become manual approvals, so nobody loses a lesson they attended.
const lecturerOf = "session.course.lecturer = @request.auth.id";
const checkedIn = (extra) =>
  "(@collection.attendance_records.session ?= session && @collection.attendance_records.student ?= @request.auth.id" +
  " && @collection.attendance_records.status ?!= 'removed'" + extra + ")";
const ROOM_ONLY = `${lecturerOf} || ${checkedIn(" && @collection.attendance_records.method ?!= 'zoom'")}`;
const CHECKED_IN = `${lecturerOf} || ${checkedIn("")}`;
const NOTE = "remote (feature removed)";

const setup = (app, methods, challengesRule) => {
  const records = app.findCollectionByNameOrId("attendance_records");
  records.fields.getByName("method").values = methods;
  app.save(records);
  const challenges = app.findCollectionByNameOrId("challenges");
  challenges.listRule = challengesRule;
  challenges.viewRule = challengesRule;
  app.save(challenges);
};

migrate(
  (app) => {
    for (const r of app.findRecordsByFilter("attendance_records", "method = 'zoom'")) {
      r.set("method", "manual");
      r.set("note", NOTE);
      app.save(r);
    }
    setup(app, ["qr", "manual"], CHECKED_IN);
  },
  (app) => {
    setup(app, ["qr", "manual", "zoom"], ROOM_ONLY);
    for (const r of app.findRecordsByFilter("attendance_records", `method = 'manual' && note = '${NOTE}'`)) {
      r.set("method", "zoom");
      r.set("note", "");
      app.save(r);
    }
  },
);
