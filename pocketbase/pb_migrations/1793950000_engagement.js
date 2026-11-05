/// <reference path="../pb_data/types.d.ts" />

// M5: live backchannel (lost signals, feed) and polls. All writes go through the API (create/update rules null).
migrate(
  (app) => {
    const sessions = app.findCollectionByNameOrId("sessions");
    const users = app.findCollectionByNameOrId("users");
    const lecturerOf = "session.course.lecturer = @request.auth.id";
    const checkedIn =
      "(@collection.attendance_records.session ?= session && @collection.attendance_records.student ?= @request.auth.id" +
      " && @collection.attendance_records.status ?!= 'removed')";

    const lost = new Collection({
      type: "base",
      name: "lost_signals",
      listRule: lecturerOf,
      viewRule: lecturerOf,
      fields: [
        { type: "relation", name: "session", required: true, collectionId: sessions.id, maxSelect: 1, cascadeDelete: true },
        // Hidden: the lecturer sees how many are lost, never who (the API needs them for the cooldown).
        { type: "relation", name: "student", collectionId: users.id, maxSelect: 1, hidden: true },
        { type: "text", name: "student_number", required: true, max: 20, hidden: true },
        { type: "date", name: "at", required: true },
      ],
      indexes: ["CREATE INDEX idx_lost_session_at ON lost_signals (session, at)"],
    });
    app.save(lost);

    // author/author_number are hidden so an anonymous post cannot be traced by anyone but the API.
    const posts = new Collection({
      type: "base",
      name: "feed_posts",
      listRule: `${lecturerOf} || ${checkedIn}`,
      viewRule: `${lecturerOf} || ${checkedIn}`,
      fields: [
        { type: "relation", name: "session", required: true, collectionId: sessions.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "author", collectionId: users.id, maxSelect: 1, hidden: true },
        { type: "text", name: "author_number", max: 20, hidden: true },
        { type: "text", name: "display_name", max: 100 },
        { type: "bool", name: "anonymous" },
        { type: "text", name: "text", required: true, max: 500 },
        { type: "number", name: "votes", min: 0 },
        { type: "bool", name: "answered" },
        { type: "date", name: "posted_at", required: true },
      ],
      indexes: ["CREATE INDEX idx_posts_session ON feed_posts (session)"],
    });
    app.save(posts);

    const postVotes = new Collection({
      type: "base",
      name: "post_votes",
      listRule: "voter = @request.auth.id || post.session.course.lecturer = @request.auth.id",
      viewRule: "voter = @request.auth.id || post.session.course.lecturer = @request.auth.id",
      fields: [
        { type: "relation", name: "post", required: true, collectionId: posts.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "voter", collectionId: users.id, maxSelect: 1 },
        { type: "text", name: "voter_number", required: true, max: 20 },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_post_votes_unique ON post_votes (post, voter_number)"],
    });
    app.save(postVotes);

    // correct_index is hidden until close; answer_index (-1 = not revealed) is what clients read.
    const polls = new Collection({
      type: "base",
      name: "polls",
      listRule: `${lecturerOf} || (${checkedIn} && status != 'draft')`,
      viewRule: `${lecturerOf} || (${checkedIn} && status != 'draft')`,
      fields: [
        { type: "relation", name: "session", required: true, collectionId: sessions.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "question", required: true, max: 300 },
        { type: "json", name: "options", required: true, maxSize: 5000 },
        { type: "number", name: "correct_index", hidden: true },
        { type: "number", name: "answer_index" },
        { type: "select", name: "status", required: true, values: ["draft", "open", "closed"], maxSelect: 1 },
        { type: "select", name: "source", required: true, values: ["template", "manual", "ai"], maxSelect: 1 },
        { type: "json", name: "results", maxSize: 5000 },
        { type: "date", name: "created_at", required: true },
        { type: "date", name: "opened_at" },
        { type: "date", name: "closed_at" },
      ],
      indexes: ["CREATE INDEX idx_polls_session ON polls (session, status)"],
    });
    app.save(polls);

    const pollVotes = new Collection({
      type: "base",
      name: "poll_votes",
      listRule: "student = @request.auth.id || poll.session.course.lecturer = @request.auth.id",
      viewRule: "student = @request.auth.id || poll.session.course.lecturer = @request.auth.id",
      fields: [
        { type: "relation", name: "poll", required: true, collectionId: polls.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "student", collectionId: users.id, maxSelect: 1 },
        { type: "text", name: "student_number", required: true, max: 20 },
        { type: "number", name: "option_index", min: 0 },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_poll_votes_unique ON poll_votes (poll, student_number)"],
    });
    app.save(pollVotes);
  },
  (app) => {
    for (const name of ["poll_votes", "polls", "post_votes", "feed_posts", "lost_signals"]) {
      app.delete(app.findCollectionByNameOrId(name));
    }
  },
);
