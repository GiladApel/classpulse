/// <reference path="../pb_data/types.d.ts" />

// Students can join a lecture from its Zoom link: attendance method "zoom". Zoom students take part in everything
// online, but challenges (photo tap, roll-call QR) are for the students in the room only.
const lecturerOf = "session.course.lecturer = @request.auth.id";
const checkedIn = (extra) =>
  "(@collection.attendance_records.session ?= session && @collection.attendance_records.student ?= @request.auth.id" +
  " && @collection.attendance_records.status ?!= 'removed'" + extra + ")";
const OLD_CHALLENGES = `${lecturerOf} || ${checkedIn("")}`;
const NEW_CHALLENGES = `${lecturerOf} || ${checkedIn(" && @collection.attendance_records.method ?!= 'zoom'")}`;

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
  (app) => setup(app, ["qr", "manual", "zoom"], NEW_CHALLENGES),
  (app) => setup(app, ["qr", "manual"], OLD_CHALLENGES),
);
