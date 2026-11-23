/// <reference path="../pb_data/types.d.ts" />

// Students are identified by the email they sign in with. A roster row has an email, an ID or both; the API links
// an email row to the user who signs in with that email by writing the user's student key into `student_number`.
// Until then the row's `student_number` is empty, so every rule that compares it with the signed-in user's key
// must also require that key to be non-empty (an unlinked row must never match a user without a key).
const ROSTER_MATCH = "@collection.enrollments.student_number ?= @request.auth.student_id";
const OWN_ROW = "student_number = @request.auth.student_id";
const HAS_KEY = " && @request.auth.student_id != ''";

const RULES = ["listRule", "viewRule"];

function rewrite(app, from, to) {
  for (const c of app.findAllCollections()) {
    let changed = false;
    for (const name of RULES) {
      if (!c[name]) continue;
      const rule = String(c[name]);
      if (!rule.includes(from)) continue;
      c[name] = rule.split(from).join(to);
      changed = true;
    }
    if (changed) app.save(c);
  }
}

migrate(
  (app) => {
    const enrollments = app.findCollectionByNameOrId("enrollments");
    enrollments.fields.add(new TextField({ name: "email", max: 120 }));
    const number = enrollments.fields.getByName("student_number");
    number.required = false;
    number.pattern = "^[0-9]*$";
    enrollments.indexes = enrollments.indexes.filter((i) => !i.includes("idx_enrollments_unique"));
    enrollments.indexes.push("CREATE UNIQUE INDEX idx_enrollments_unique ON enrollments (course, student_number) WHERE student_number != ''");
    enrollments.indexes.push("CREATE UNIQUE INDEX idx_enrollments_email ON enrollments (course, email) WHERE email != ''");
    for (const name of RULES) enrollments[name] = enrollments[name].split(OWN_ROW).join(OWN_ROW + HAS_KEY);
    app.save(enrollments);

    rewrite(app, ROSTER_MATCH, ROSTER_MATCH + HAS_KEY);
  },
  (app) => {
    rewrite(app, ROSTER_MATCH + HAS_KEY, ROSTER_MATCH);

    for (const r of app.findRecordsByFilter("enrollments", "student_number = ''")) app.delete(r);
    const enrollments = app.findCollectionByNameOrId("enrollments");
    for (const name of RULES) enrollments[name] = enrollments[name].split(OWN_ROW + HAS_KEY).join(OWN_ROW);
    enrollments.indexes = enrollments.indexes.filter((i) => !i.includes("idx_enrollments_unique") && !i.includes("idx_enrollments_email"));
    enrollments.indexes.push("CREATE UNIQUE INDEX idx_enrollments_unique ON enrollments (course, student_number)");
    const number = enrollments.fields.getByName("student_number");
    number.required = true;
    number.pattern = "^[0-9]+$";
    enrollments.fields.removeByName("email");
    app.save(enrollments);
  },
);
