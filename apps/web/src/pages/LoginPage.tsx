import { type FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, Card, ErrorText, Field, inputClass, Screen } from '../components/ui';
import { chromeIntent, inAppBrowser, isAndroid } from '../lib/inAppBrowser';
import { pb } from '../lib/pb';

export default function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next') ?? '/';
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const embedded = inAppBrowser();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
    } catch {
      prompt('העתיקו את הקישור:', location.href);
    }
  };

  const done = () => navigate(next, { replace: true });

  const google = async () => {
    setError('');
    setBusy(true);
    try {
      await pb.collection('users').authWithOAuth2({ provider: 'google' });
      done();
    } catch {
      setError(embedded ? `Google לא מאפשר התחברות מתוך ${embedded}. פתחו את הקישור בדפדפן (הוראות למעלה).` : 'ההתחברות עם Google נכשלה. אם לא נפתח חלון של Google, אפשרו חלונות קופצים ונסו שוב.');
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
        <p className="mt-1 text-slate-600">נרשמים פעם אחת עם Google וממלאים מספר סטודנט / ת.ז. — הקורסים שהמרצה רשם אתכם אליהם יופיעו מיד.</p>
      </div>
      {embedded && (
        <div className="flex flex-col gap-2 rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-300">
          <p className="font-semibold text-amber-900">הקישור נפתח בתוך {embedded}</p>
          <p className="text-sm text-amber-900">
            Google לא מאפשר להתחבר מכאן. {isAndroid() ? 'פתחו את האתר ב-Chrome:' : 'הקישו על ⋯ או על סמל המצפן ובחרו "פתיחה ב-Safari", או העתיקו את הקישור והדביקו אותו ב-Safari.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {isAndroid() && (
              <a href={chromeIntent()} className="rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white">
                פתיחה ב-Chrome
              </a>
            )}
            <Button variant="secondary" onClick={copyLink}>
              {copied ? '✓ הקישור הועתק' : 'העתקת הקישור'}
            </Button>
          </div>
        </div>
      )}
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
