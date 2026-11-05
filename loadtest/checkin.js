// NFR-02: 80 check-ins within 30 s, p95 < 500 ms. Run via loadtest/run.sh, which prepares the fixture and the SSE listeners.
// Each student "scans" the QR currently on the projector: the token is fetched as the lecturer (the projector's request)
// right before the check-in, so token windows behave as in class. Only the check-in request counts toward the threshold.
import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

const f = JSON.parse(open('./.fixture.json'));
const N = f.students.length;

export const options = {
  scenarios: {
    checkins: { executor: 'per-vu-iterations', vus: N, iterations: 1, maxDuration: '60s' },
  },
  thresholds: {
    'http_req_duration{name:checkin}': ['p(95)<500'],
    'http_req_failed{name:checkin}': ['rate==0'],
    checks: ['rate==1'],
  },
};

export default function () {
  const i = exec.vu.idInTest - 1;
  const s = f.students[i];
  sleep(Math.random() * 30); // arrivals spread over 30 s

  const qr = http.get(`${f.baseUrl}/api/sessions/${f.sessionId}/qr`, {
    headers: { Authorization: `Bearer ${f.lecturerToken}` },
    tags: { name: 'qr' },
  });
  check(qr, { 'qr 200': (r) => r.status === 200 });
  const token = qr.json('token');

  const res = http.post(
    `${f.baseUrl}/api/checkins`,
    JSON.stringify({ token, deviceId: s.deviceId, location: { ...f.location, accuracyM: 20 } }),
    { headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' }, tags: { name: 'checkin' } },
  );
  check(res, { 'checkin 201': (r) => r.status === 201 });
}
