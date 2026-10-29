-- sample_question.sql — یک سوال نمونه با فرمول LaTeX و تایمر ۳۰ ثانیه‌ای
-- (بعد از schema.sql در SQL Editor اجرا کنید؛ یا همین سوال را از پنل معلم بسازید.)

insert into public.questions (text, options, correct, points, time_limit)
values (
  E'مجموع جواب‌های معادلهٔ زیر کدام است؟\n$$x^{2} - 5x + 6 = 0$$',
  array['$5$', '$6$', '$-5$', '$\frac{5}{2}$'],
  0,
  10,
  30
);
