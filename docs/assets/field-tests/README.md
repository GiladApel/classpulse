# Field-test protocol (T4–T7)

> Tests that need real phones. Each one: what to prepare, what to do, what to write down. Results go into the
> [tools report](../../02-tools-report.md) §3 and, for the manual test cases, the [STD](../../08-stp-std.md).
> Use https://classpulse.giladautomation.com with a test course; no real student data.

## T4: QR from the back of the room
- **Prepare:** a lesson started on a laptop; the projector view (`/projector/:id`) full screen on a TV or a large monitor; 3 phones (at least one iPhone and one Android), each signed in as a different test student.
- **Do:** from 3 m, 5 m and 8 m, each phone opens the camera, scans the QR and waits for "attendance recorded". Between distances the lecturer removes the records.
- **Record:**

| Distance | Phone | Scanned? (Y/N) | Seconds from camera open to "recorded" | Notes (glare, angle) |
|----------|-------|----------------|-----------------------------------------|----------------------|
| 3 m | | | | |
| 5 m | | | | |
| 8 m | | | | |

- **Pass:** every phone at 5 m within 10 s (a 10 s window plus the next one leaves room).

## T5: Indoor location error
- **Prepare:** stand at a known point (the "lecturer's desk") and start a lesson there (lenient mode). Mark a second point 20 m away.
- **Do:** each phone checks in at the desk, then (after removal) at the 20 m point. The attendance list shows the distance.
- **Record:**

| Phone | Distance shown at the desk (m) | Reported accuracy (m) | Distance shown at 20 m | Notes (indoors/outdoors, Wi-Fi on?) |
|-------|-------------------------------|-----------------------|------------------------|-------------------------------------|
| | | | | |

- **Use:** the median error sets the default radius (now 50 m); this is a partial test at home, to be repeated in the classroom.

## T6: Blur strength (run on the computer)
- **Prepare:** one class photo you are allowed to use.
- **Do:** produce blurred copies at σ = 15, 25, 35 (the app uses 30) and look at each at full size.
- **Record:** for each σ: can a face be recognised (Y/N)? can a seat/row be found (Y/N)?
- **Pass:** the lowest σ where no face is recognisable but seats are; if it is above 30, raise the default.

## T7: First sign-in on phones
- **Prepare:** a test student whose email is on the test course's roster and who never signed in; an iPhone (Safari) and an Android phone (Chrome).
- **Do:** (a) open the site link directly; (b) send the link in WhatsApp and open it from the chat. Sign in with Google, then scan a lesson's QR.
- **Record:**

| Phone | Path | Taps until the course is on the home screen | Seconds | Did the in-app-browser notice appear on (b)? | Taps for the next check-in |
|-------|------|---------------------------------------------|---------|----------------------------------------------|----------------------------|
| iPhone | direct | | | — | |
| iPhone | WhatsApp | | | | |
| Android | direct | | | — | |
| Android | WhatsApp | | | | |

- **Pass (NFR-01):** after the first visit, a check-in takes ≤ 2 taps and ≤ 5 s.

## T2 and T3 (if material is available)
- **T2:** more classroom photos → `npx tsx spikes/headcount/detect.mts photo.jpg 3`; write the count next to a count by eye.
- **T3:** a 5–10 minute lecture recording → `npx tsx spikes/lecture-summary/summarize.mts clip.mp4`; check that the chapter times match.
