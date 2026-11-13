/**
 * Links shared in WhatsApp, Instagram, Facebook, Telegram and the like open in the app's own browser, where Google
 * refuses to sign in ("disallowed_useragent") and the sign-in popup often never opens.
 */
export function inAppBrowser(ua = navigator.userAgent): string | null {
  const apps: [RegExp, string][] = [
    [/WhatsApp/i, 'WhatsApp'],
    [/Instagram/i, 'Instagram'],
    [/FBAN|FBAV|FB_IAB/i, 'Facebook'],
    [/Telegram/i, 'Telegram'],
    [/Line\//i, 'LINE'],
    [/TikTok|musical_ly|Bytedance/i, 'TikTok'],
    [/Snapchat/i, 'Snapchat'],
    [/LinkedInApp/i, 'LinkedIn'],
    [/MicroMessenger/i, 'WeChat'],
  ];
  for (const [re, name] of apps) if (re.test(ua)) return name;
  // A generic Android WebView.
  if (/Android/i.test(ua) && /; wv\)/.test(ua)) return 'האפליקציה';
  return null;
}

export const isAndroid = (ua = navigator.userAgent) => /Android/i.test(ua);

/** On Android an intent link opens the same page in Chrome; iOS has no such link, so the user is told where to tap. */
export function chromeIntent(href = location.href): string {
  const url = new URL(href);
  return `intent://${url.host}${url.pathname}${url.search}${url.hash}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;end`;
}
