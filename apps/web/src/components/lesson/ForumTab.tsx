import { Link } from 'react-router';
import { pb } from '../../lib/pb';
import { type PollRecord, useLiveRecords } from '../../lib/useLiveRecords';
import EngagementPanel from '../EngagementPanel';
import FeedbackCard, { FeedbackResults } from '../FeedbackCard';
import PollBars from '../PollBars';
import StudentLivePanel, { Feed } from '../StudentLivePanel';
import { Button, Card } from '../ui';

interface Props {
  sessionId: string;
  courseId: string;
  lecturer: boolean;
  live: boolean;
  /** The student has a (not removed) attendance record for this lesson. */
  attended: boolean;
  goToAttendance: () => void;
}

/**
 * The class conversation, open to everyone in the course, in the room or at home: questions, polls and "I'm lost" while
 * live; afterwards the questions with their answers, poll results and feedback, read-only: new questions go to the
 * course forum. Attendance alone still needs the QR in the room.
 */
export default function ForumTab({ sessionId, courseId, lecturer, live, attended, goToAttendance }: Props) {
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
      <Card className="flex flex-wrap items-center justify-between gap-3 py-3">
        <p className="text-sm">השיעור הסתיים. יש שאלה? שאלו בפורום של הקורס.</p>
        <Link to={`/course/${courseId}?tab=forum`} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          לפורום הקורס
        </Link>
      </Card>
      <ClosedPolls sessionId={sessionId} />
      <Feed scope={{ sessionId }} canPost={false} />
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
