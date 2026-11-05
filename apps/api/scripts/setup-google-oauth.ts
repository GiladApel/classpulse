// Enables Google OAuth2 on the PocketBase `users` collection using GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from ../../.env.
// Usage: npm run setup:oauth -w apps/api
import { createSuperuserClient } from '../src/infra/pb/pbClient.js';

try {
  process.loadEnvFile('../../.env');
} catch {
  // env from shell
}

const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? '';
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '';

if (!clientId.endsWith('.apps.googleusercontent.com') || !clientSecret || /[[\]]/.test(clientSecret)) {
  console.error('Set real GOOGLE_CLIENT_ID (…apps.googleusercontent.com) and GOOGLE_CLIENT_SECRET in the root .env first.');
  process.exit(1);
}

const pb = await createSuperuserClient(
  process.env.PB_URL ?? 'http://127.0.0.1:8090',
  process.env.PB_SUPERUSER_EMAIL ?? '',
  process.env.PB_SUPERUSER_PASSWORD ?? '',
);

const users = await pb.collections.getOne('users');
const others = (users.oauth2?.providers ?? []).filter((p: { name: string }) => p.name !== 'google');

await pb.collections.update('users', {
  oauth2: {
    ...users.oauth2,
    enabled: true,
    mappedFields: { ...users.oauth2?.mappedFields, name: 'name', avatarURL: 'avatar' },
    providers: [...others, { name: 'google', clientId, clientSecret }],
  },
});

const check = await pb.collection('users').listAuthMethods();
const google = check.oauth2.providers.find((p) => p.name === 'google');
console.log(google ? `Google OAuth2 enabled (client ${clientId.slice(0, 12)}…)` : 'Update saved but Google is not listed — check the PB admin.');
