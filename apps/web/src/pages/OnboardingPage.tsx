import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Button, Card, ErrorText, Field, inputClass, Screen } from '../components/ui';
import { pb, useUser } from '../lib/pb';

export default function OnboardingPage() {
  const user = useUser();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return <Navigate to="/login" replace />;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const studentId = String(form.get('studentId')).trim();
    const name = String(form.get('name')).trim();
    if (!/^\d{9}$/.test(studentId)) return setError('מספר סטודנט/ת.ז. צריך להכיל 9 ספרות');
    setBusy(true);
    try {
      await pb.collection('users').update(user.id, { student_id: studentId, name });
      await pb.collection('users').authRefresh();
      navigate(params.get('next') ?? '/', { replace: true });
    } catch {
      setError('המספר כבר רשום במערכת או שאירעה שגיאה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <h1 className="text-xl font-bold">עוד צעד אחד</h1>
        <p className="mb-4 text-sm text-slate-600">ממלאים פעם אחת בלבד. כך המרצה יזהה אתכם בגיליון הנוכחות.</p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="שם מלא">
            <input name="name" required defaultValue={user.name} maxLength={80} className={inputClass} />
          </Field>
          <Field label="מספר סטודנט / ת.ז.">
            <input name="studentId" required inputMode="numeric" dir="ltr" maxLength={9} className={inputClass} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy}>
            שמירה
          </Button>
        </form>
      </Card>
    </Screen>
  );
}
