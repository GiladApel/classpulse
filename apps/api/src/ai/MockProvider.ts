import { type LLMProvider, LLMOutputError, type StructuredRequest } from './LLMProvider.js';

type Fixture = unknown | ((req: StructuredRequest) => unknown);

/** Deterministic provider for tests, offline development and the demo fallback. */
export class MockProvider implements LLMProvider {
  readonly calls: StructuredRequest[] = [];

  constructor(private readonly fixtures: Record<string, Fixture> = DEFAULT_FIXTURES) {}

  async generateStructured<T>(req: StructuredRequest): Promise<T> {
    this.calls.push(req);
    if (!(req.task in this.fixtures)) throw new LLMOutputError(`No mock fixture for task ${req.task}`);
    const fixture = this.fixtures[req.task];
    if (fixture instanceof Error) throw fixture;
    return structuredClone(typeof fixture === 'function' ? fixture(req) : fixture) as T;
  }
}

// Three people in a row across the middle of the frame (box_2d = [ymin, xmin, ymax, xmax] on a 0–1000 grid).
export const DEFAULT_FIXTURES: Record<string, unknown> = {
  detect_people: {
    people: [
      { box_2d: [350, 100, 750, 280] },
      { box_2d: [350, 410, 750, 590] },
      { box_2d: [350, 720, 750, 900] },
    ],
    confidence: 0.9,
  },
  generate_mcq: {
    questions: [
      { question: 'איזה תבנית עיצוב מפרידה בין יצירת אובייקט לשימוש בו?', options: ['Factory', 'Observer', 'Adapter', 'Singleton'], correctIndex: 0 },
      { question: 'מה מבטיח עקרון ה-LSP?', options: ['מחלקה אחת לכל אחריות', 'תת-מחלקה יכולה להחליף את מחלקת הבסיס', 'תלות בממשקים', 'ממשקים קטנים'], correctIndex: 1 },
      { question: 'מתי נעדיף Strategy על פני if/else?', options: ['אף פעם', 'כשיש אלגוריתם אחד', 'כשאלגוריתמים מתחלפים בזמן ריצה', 'רק בבדיקות'], correctIndex: 2 },
    ],
  },
  generate_practice: {
    questions: [
      { question: 'מה תפקידו של ה-Subject בתבנית Observer?', options: ['מחזיק רשימת מאזינים ומודיע להם על שינוי', 'יוצר אובייקטים', 'מתרגם ממשק', 'שומר מצב גלובלי'], correctIndex: 0 },
      { question: 'מה ההבדל המרכזי בין State ל-Strategy?', options: ['אין הבדל', 'ב-State האובייקט מחליף התנהגות בעצמו לפי מצבו', 'Strategy משמש רק ל-UI', 'State לא משתמש בממשקים'], correctIndex: 1 },
      { question: 'איזה עיקרון מופר כשמחלקה אחת אחראית גם על לוגיקה וגם על שמירה למסד?', options: ['OCP', 'LSP', 'SRP', 'ISP'], correctIndex: 2 },
      { question: 'מה מאפשר עקרון ה-OCP?', options: ['לשנות קוד קיים בכל הוספה', 'להוסיף התנהגות חדשה בלי לשנות קוד קיים', 'למחוק מחלקות בסיס', 'לוותר על ממשקים'], correctIndex: 1 },
      { question: 'מה תפקיד Adapter?', options: ['להאיץ ביצועים', 'ליצור אובייקט יחיד', 'להתאים ממשק קיים לממשק שהלקוח מצפה לו', 'לשמור היסטוריה'], correctIndex: 2 },
      { question: 'למה מזריקים תלויות דרך הבנאי?', options: ['כדי שאפשר יהיה להחליף מימוש בבדיקות', 'כדי לחסוך זיכרון', 'כי אסור להשתמש ב-new', 'כדי להסתיר שדות'], correctIndex: 0 },
      { question: 'מה מאפיין Template Method?', options: ['כל השלבים מוגדרים בתת-מחלקה', 'מחלקת הבסיס קובעת את סדר השלבים ותת-מחלקות ממלאות חלקים', 'אין ירושה', 'נבחר בזמן ריצה מתוך רשימה'], correctIndex: 1 },
      { question: 'מתי Chain of Responsibility מתאים?', options: ['כשיש בדיקה אחת', 'כשסדרת בודקים עצמאיים צריכה לעבור על אותה בקשה', 'רק בממשק משתמש', 'כשאין צורך בהרחבה'], correctIndex: 1 },
    ],
  },
  // Ids are placeholders: FeedClusterer drops unknown ids, so tests pass their own fixture.
  cluster_feed: { themes: [] },
  summarize_lecture: {
    tldr: 'ההרצאה הציגה את תבניות העיצוב Strategy ו-State, את ההבדל ביניהן ומתי לבחור בכל אחת.',
    chapters: [
      { startSec: 0, title: 'פתיחה', summary: 'סקירת השיעור הקודם ומטרות השיעור.' },
      { startSec: 300, title: 'Strategy', summary: 'משפחת אלגוריתמים מתחלפים מאחורי ממשק אחד.' },
      { startSec: 1200, title: 'State', summary: 'אובייקט שמשנה התנהגות לפי מצבו הפנימי.' },
      { startSec: 2100, title: 'השוואה ודוגמאות', summary: 'מתי כל תבנית מתאימה, עם דוגמאות קוד.' },
    ],
    concepts: [
      { term: 'Strategy', explanation: 'החלפת אלגוריתם בזמן ריצה דרך ממשק משותף.' },
      { term: 'State', explanation: 'העברת ההתנהגות למחלקת מצב נפרדת לכל מצב.' },
    ],
    questions: [
      { question: 'מה ההבדל העיקרי בין Strategy ל-State?', answer: 'ב-Strategy הלקוח בוחר את האלגוריתם; ב-State האובייקט עובר בין מצבים בעצמו.' },
      { question: 'איזה עקרון SOLID Strategy מממשת?', answer: 'OCP — אלגוריתם חדש הוא מחלקה חדשה.' },
      { question: 'מתי עדיף if/else פשוט על פני Strategy?', answer: 'כשיש מעט מקרים קבועים שלא צפויים להשתנות.' },
      { question: 'איך State מונעת תנאים מפוזרים?', answer: 'כל מצב מטפל בהתנהגות שלו במחלקה אחת.' },
      { question: 'תנו דוגמה ל-Strategy מהפרויקט.', answer: 'LLMProvider: Gemini או Mock מתחלפים בלי לשנות את השירותים.' },
    ],
  },
  // Score follows submission length so mock reviews differ between students (and percentiles are meaningful).
  review_homework: (req: StructuredRequest) => {
    const body = /<submission>\n([\s\S]*)\n<\/submission>/.exec(req.prompt)?.[1] ?? '';
    const ids = [...req.prompt.matchAll(/- id "([^"]+)"/g)].map((m) => m[1]);
    const score = Math.min(100, 40 + Math.round(body.length / 20));
    return {
      summary: 'הגשה סבירה; יש מקום לשיפור בבדיקות.',
      criteria: ids.map((id) => ({ id, score, strengths: ['מבנה ברור'], fixes: score < 80 ? ['חסרות בדיקות יחידה'] : [] })),
      mistakes: score < 80 ? ['חסרות בדיקות יחידה'] : [],
    };
  },
  aggregate_mistakes: { mistakes: [{ title: 'חסרות בדיקות יחידה', description: 'כתבו בדיקה לכל מחלקה בדומיין לפני ההגשה.', count: 1 }] },
};
