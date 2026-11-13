import { pb } from '../../lib/pb';
import { type PollRecord, useLiveRecords } from '../../lib/useLiveRecords';
import EngagementPanel from '../EngagementPanel';
import FeedbackCard, { FeedbackResults } from '../FeedbackCard';
import PollBars from '../PollBars';
import StudentLivePanel, { Feed } from '../StudentLivePanel';
import { Button, Card } from '../ui';

interface Props {
  sessionId: string;
  lecturer: boolean;
  live: boolean;
  /** The student has a (not removed) attendance record for this lesson. */
  attended: boolean;
  goToAttendance: () => void;
}

/**
 * The class conversation, open to everyone in the course, in the room or at home: questions, polls and "I'm lost" while
 * live; questions, answers, poll results and feedback afterwards. Attendance alone still needs the QR in the room.
 */
export default function ForumTab({ sessionId, lecturer, live, attended, goToAttendance }: Props) {
  if (lecturer)
    return (
      <>
        {!live && <FeedbackResults sessionId={sessionId} />}
        <EngagementPanel sessionId={sessionId} active={live} />
      </>
    );

  if (live)
    return (
      <>
        {!attended && (
          <Card className="flex flex-wrap items-center justify-between gap-3 border-s-4 border-indigo-300 py-3">
            <p className="text-sm">אפשר לשאול ולהצביע גם מהבית. בכיתה? סמנו נוכחות בסריקת הקוד שעל הלוח.</p>
            <Button variant="ghost" onClick={goToAttendance} className="text-sm">
              לנוכחות
            </Button>
          </Card>
        )}
        <StudentLivePanel sessionId={sessionId} active />
      </>
    );

  return (
    <>
      {attended && <FeedbackCard sessionId={sessionId} ended />}
      <ClosedPolls sessionId={sessionId} />
      <Feed sessionId={sessionId} canPost />
    </>
  );
}

function ClosedPolls({ sessionId }: { sessionId: string }) {
  const polls = useLiveRecords<PollRecord>('polls', pb.filter('session = {:s} && status = "closed"', { s: sessionId }), 'closed_at');
  if (polls.length === 0) return null;
  return (
    <Card>
      <h2 className="mb-3 font-semibold">סקרים מהשיעור</h2>
      <div className="flex flex-col gap-4">
        {polls.map((p) => (
          <div key={p.id}>
            <p className="mb-2 font-medium">{p.question}</p>
            <PollBars options={p.options} counts={p.results?.counts ?? p.options.map(() => 0)} correctIndex={p.answer_index} />
          </div>
        ))}
      </div>
    </Card>
  );
}
