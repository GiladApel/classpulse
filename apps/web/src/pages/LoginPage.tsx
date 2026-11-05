import { type FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, Card, ErrorText, Field, inputClass, Screen } from '../components/ui';
import { pb } from '../lib/pb';

export default function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next') ?? '/';
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const done = () => navigate(next, { replace: true });

  const google = async () => {
    setError('');
    setBusy(true);
    try {
      await pb.collection('users').authWithOAuth2({ provider: 'google' });
      done();
    } catch {
      setError('ההתחברות עם Google נכשלה. נסו שוב.');
    } finally {
      setBusy(false);
    }
  };

  const withPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError('');
    setBusy(true);
    try {
      await pb.collection('users').authWithPassword(String(form.get('email')), String(form.get('password')));
      done();
    } catch {
      setError('אימייל או סיסמה שגויים');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <div className="text-center">
        <h1 className="text-3xl font-bold text-indigo-700">ClassPulse</h1>
        <p className="mt-1 text-slate-600">התחברו פעם אחת — מהפעם הבאה סריקה אחת מספיקה</p>
      </div>
      <Card className="flex flex-col gap-3">
        <Button onClick={google} disabled={busy} className="py-3 text-lg">
          התחברות עם Google
        </Button>
        <ErrorText>{error}</ErrorText>
        {showPassword ? (
          <form onSubmit={withPassword} className="flex flex-col gap-3 border-t border-slate-100 pt-3">
            <Field label="אימייל">
              <input name="email" type="email" required dir="ltr" autoComplete="username" className={inputClass} />
            </Field>
            <Field label="סיסמה">
              <input name="password" type="password" required dir="ltr" autoComplete="current-password" className={inputClass} />
            </Field>
            <Button type="submit" variant="secondary" disabled={busy}>
              כניסה
            </Button>
          </form>
        ) : (
          <Button variant="ghost" onClick={() => setShowPassword(true)} className="text-sm">
            כניסת מרצה עם סיסמה
          </Button>
        )}
      </Card>
    </Screen>
  );
}
