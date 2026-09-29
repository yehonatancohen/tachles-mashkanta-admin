/** Hebrew labels for the event names mortgage-website's beacon sends. Unknown names fall back
 * to the raw name, so a new event shows up without a code change here. */
export const EVENT_LABELS: Record<string, string> = {
  page_view: 'צפייה בדף',
  calculator_used: 'שימוש במחשבון',
  step1_complete: 'שלב ראשון הושלם',
  question_skipped: 'דילוג על שאלה',
  result_view: 'צפייה בתוצאה',
  lead_gate_view: 'צפייה בטופס',
  otp_sent: 'קוד אימות נשלח',
  otp_verified: 'טלפון אומת',
  lead_submitted: 'ליד נשלח',
  rate_alert_view: 'צפייה בהתראת ריבית',
  rate_alert_submitted: 'נרשם להתראת ריבית',
  invalid_input: 'קלט לא תקין',
  phone_not_verified: 'טלפון לא אומת',
  balance_below_minimum: 'יתרה מתחת למינימום',
  loan_below_minimum: 'הלוואה מתחת למינימום',
  payment_too_high: 'החזר גבוה מדי',
  payment_too_low: 'החזר נמוך מדי',
};

export const eventLabel = (name: string) => EVENT_LABELS[name] ?? name;

/** Validation-noise events: kept in the data, hidden by default in charts and activity badges. */
export const NOISE_EVENTS = new Set([
  'invalid_input',
  'phone_not_verified',
  'balance_below_minimum',
  'loan_below_minimum',
  'payment_too_high',
  'payment_too_low',
]);
