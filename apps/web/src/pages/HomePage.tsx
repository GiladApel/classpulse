import { Navigate } from 'react-router';
import { Button, Card, Screen } from '../components/ui';
import { pb, useUser } from '../lib/pb';

export default function HomePage() {
  const user = useUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'lecturer') return <Navigate to="/dash" replace />;
  if (!user.student_id) return <Navigate to="/onboarding" replace />;

  return (
    <Screen>
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="text-6xl">📷</div>
        <h1 className="text-2xl font-bold">שלום {user.name.split(' ')[0]}</h1>
        <p className="text-slate-600">כדי לסמן נוכחות, סרקו עם מצלמת הטלפון את הקוד שמוקרן בכיתה.</p>
      </Card>
      <Button variant="ghost" onClick={() => pb.authStore.clear()} className="self-center text-sm">
        התנתקות
      </Button>
    </Screen>
  );
}
