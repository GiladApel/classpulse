// Builds a short Hebrew "lecture" (Gemini TTS → 24 kHz PCM) for testing the real video-summary path.
//   npx tsx spikes/lecture-summary/make-lecture.mts lecture.pcm
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../..');
const [, , outPcm] = process.argv;
process.loadEnvFile(`${root}/.env`);
const { GoogleGenAI } = createRequire(`${root}/apps/api/package.json`)('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const LECTURE = `שלום לכולם, ברוכים הבאים להרצאה השישית בהנדסת תוכנה. היום נדבר על שתי תבניות עיצוב שמתבלבלים ביניהן הרבה: סטרטג'י וסטייט.
נתחיל בסטרטג'י. הרעיון הוא להגדיר משפחה של אלגוריתמים, לעטוף כל אחד מהם במחלקה נפרדת, ולאפשר ללקוח להחליף ביניהם בזמן ריצה. הלקוח תלוי בממשק ולא במימוש. דוגמה מהפרויקט שלנו: ממשק LLMProvider, שאפשר להחליף בו בין ג'מיני לבין מוק בלי לשנות אף שירות. זה מימוש ישיר של עקרון פתוח-סגור.
עכשיו סטייט. כאן האובייקט עצמו משנה את ההתנהגות שלו כשהמצב הפנימי שלו משתנה. במקום שרשרת של if ו-else בכל מתודה, כל מצב הוא מחלקה, והאובייקט מעביר את הקריאה למחלקת המצב הנוכחית. דוגמה: אתגר נוכחות שעובר ממצב ממתין, לפעיל, לסגור.
אז מה ההבדל? בסטרטג'י הלקוח בוחר את האלגוריתם מבחוץ. בסטייט האובייקט עובר בין מצבים בעצמו, והמצבים בדרך כלל מכירים זה את זה.
לסיום, שאלה למחשבה: אם המצבים לעולם לא משתנים בזמן ריצה, האם עדיין צריך סטייט? נדבר על זה בשבוע הבא. תודה רבה.`;

const res = await ai.models.generateContent({
  model: 'gemini-3.8-flash-tts',
  contents: [{ parts: [{ text: `Read this university lecture aloud in Hebrew, at a calm lecturing pace:\n${LECTURE}` }] }],
  config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
});
const part = res.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);
if (!part) throw new Error('No audio returned');
console.log('mime', part.inlineData.mimeType);
await writeFile(outPcm, Buffer.from(part.inlineData.data, 'base64'));
console.log('wrote', outPcm);
