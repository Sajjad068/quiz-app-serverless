# کوییز ریاضی (React + Supabase)

فرانت‌اند React برای کوییز کلاسی، فارسی و راست‌چین (RTL). بدون npm/build — فقط فایل‌های استاتیک؛ بک‌اند کاملاً سرورلس روی Supabase.

## اجرای محلی

```bash
cd quiz-app
python -m http.server 5173
```

سپس `http://127.0.0.1:5173` را باز کنید.

## راه‌اندازی Supabase (یک بار)

1. یک پروژه Supabase بسازید.
2. فایل `supabase/schema.sql` را در **SQL Editor** اجرا کنید.
3. **Authentication → Sign In / Providers → Email**: گزینه **Confirm email** را **خاموش** کنید.
4. **Project Settings → API**: مقادیر `Project URL` و `anon public` را در `config.js` بگذارید (کلید `service_role` را هرگز نگذارید).
5. ساخت حساب معلم: با یک نام کاربری دلخواه (مثلاً `teacher`) از صفحهٔ ثبت‌نام حساب بسازید، سپس در SQL Editor:
   ```sql
   update public.profiles set role = 'teacher' where username = 'teacher';
   ```
   بعد با «ورود معلم» وارد شوید و از پنل معلم سوال اضافه کنید (دکمه «۱۰ سوال تصادفی» سریع‌ترین راه است).

## انتشار روی GitHub Pages

1. مخزن GitHub بسازید و فایل‌های پروژه را در **ریشه** مخزن push کنید (فایل `index.html` باید در ریشه باشد).
2. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*، Branch = `main` و پوشه `/ (root)`.
3. بعد از یکی دو دقیقه آدرس `https://USERNAME.github.io/REPO/` فعال می‌شود.
4. (اختیاری) دامنهٔ شخصی: در **Settings → Pages → Custom domain** دامنه را بنویسید و در DNS یک رکورد `CNAME` به `USERNAME.github.io` بسازید، سپس **Enforce HTTPS** را روشن کنید.

> کلید `anon` عمومی است و گذاشتنش در مخزن اشکالی ندارد؛ امنیت با RLS و توابع SQL در `schema.sql` تامین می‌شود.

## امکانات

- ثبت‌نام دانش‌آموز (نام کاربری + نام + رمز) و ورود جداگانهٔ معلم
- کوییز چهارگزینه‌ای: هر سوال فقط یک‌بار قابل پاسخ است و امتیاز در سرور محاسبه می‌شود
- لیدربورد: نام خودت کامل، نام بقیه با ستاره (ماسک در سرور انجام می‌شود)
- پنل معلم: CRUD سوالات، ساخت ۱۰ سوال ریاضی تصادفی، ریست امتیازها

## امنیت (خلاصه)

- پاسخ درست سوال‌ها برای دانش‌آموز قابل خواندن نیست (فقط تابع `submit_answer` آن را می‌بیند).
- امتیاز و نقش را کاربر نمی‌تواند مستقیم تغییر دهد؛ فقط `submit_answer` امتیاز اضافه می‌کند.
- پروفایل با تریگر دیتابیس ساخته می‌شود، پس کسی نمی‌تواند خودش را معلم کند.
- نقش `teacher` فقط با SQL داده می‌شود.

## ساختار فایل‌ها

```
quiz-app/
├── index.html          # نقطه ورود + بارگذاری کتابخانه‌ها
├── config.js           # آدرس و کلید Supabase (پر کنید)
├── .nojekyll           # برای GitHub Pages
├── src/
│   ├── App.jsx         # کامپوننت‌های React
│   └── store.js        # لایه دسترسی به Supabase
├── supabase/schema.sql # جدول‌ها، RLS و توابع RPC
└── vendor/             # react, react-dom, babel, tailwind, supabase-js
```

> اگر قبلاً نسخهٔ قدیمی `schema.sql` را اجرا کرده‌اید، فایل جدید را دوباره اجرا کنید (قابل اجرای مجدد است).
