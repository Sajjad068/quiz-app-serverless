-- schema.sql — اجرای این فایل در SQL Editor داشبورد Supabase
-- قابل اجرای مجدد است (idempotent).

-- ---------- جدول‌ها ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  name text not null,
  role text not null default 'student',
  total_score integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  options text[] not null check (array_length(options, 1) = 4),
  correct integer not null check (correct between 0 and 3),
  points integer not null default 10 check (points >= 0),
  image_url text,
  time_limit integer check (time_limit is null or time_limit between 5 and 600),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

-- برای دیتابیسی که نسخهٔ قبلی را دارد
alter table public.questions add column if not exists image_url text;
alter table public.questions add column if not exists time_limit integer
  check (time_limit is null or time_limit between 5 and 600);

-- پاسخ‌های داده‌شده: هر دانش‌آموز هر سوال را فقط یک‌بار می‌تواند جواب دهد
create table if not exists public.answers (
  user_id uuid not null references auth.users on delete cascade,
  question_id uuid not null references public.questions on delete cascade,
  picked integer not null,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;

-- ---------- پاکسازی نسخهٔ قدیمی ----------
drop trigger if exists profiles_role_guard on public.profiles;
drop function if exists public.prevent_role_change();
drop function if exists public.add_score(integer);

-- ---------- کمک‌تابع ----------
create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher');
$$;

-- ---------- ساخت خودکار پروفایل بعد از ثبت‌نام ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uname text := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, username, name)
  values (new.id, uname, coalesce(nullif(new.raw_user_meta_data->>'name', ''), uname));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- سیاست‌های profiles ----------
drop policy if exists "profiles readable" on public.profiles;
drop policy if exists "insert own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;
drop policy if exists "read own profile" on public.profiles;

create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_teacher());

create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- کاربر فقط می‌تواند «نام» خودش را عوض کند؛ امتیاز و نقش از کلاینت قابل تغییر نیست
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (name) on public.profiles to authenticated;

-- ---------- سیاست‌های questions ----------
drop policy if exists "questions readable" on public.questions;
drop policy if exists "teachers insert questions" on public.questions;
drop policy if exists "teachers update questions" on public.questions;
drop policy if exists "teachers delete questions" on public.questions;

create policy "questions readable" on public.questions
  for select to authenticated using (true);
create policy "teachers insert questions" on public.questions
  for insert to authenticated with check (public.is_teacher());
create policy "teachers update questions" on public.questions
  for update to authenticated using (public.is_teacher());
create policy "teachers delete questions" on public.questions
  for delete to authenticated using (public.is_teacher());

-- ستون «correct» (پاسخ درست) برای کلاینت قابل خواندن نیست
revoke select on public.questions from anon, authenticated;
grant select (id, text, options, points, image_url, time_limit, created_at) on public.questions to authenticated;

-- ---------- سیاست‌های answers (نوشتن فقط از طریق submit_answer) ----------
drop policy if exists "read own answers" on public.answers;
create policy "read own answers" on public.answers
  for select to authenticated using (user_id = auth.uid());
revoke all on public.answers from anon, authenticated;
grant select on public.answers to authenticated;

-- ---------- توابع (RPC) ----------

-- یک سوال تصادفی که هنوز جواب داده نشده (بدون پاسخ درست)
drop function if exists public.next_question();
create or replace function public.next_question()
returns table(id uuid, text text, options text[], points integer, image_url text, time_limit integer)
language sql stable security definer set search_path = public as $$
  select q.id, q.text, q.options, q.points, q.image_url, q.time_limit
    from public.questions q
   where not exists (
           select 1 from public.answers a
            where a.question_id = q.id and a.user_id = auth.uid())
   order by random()
   limit 1;
$$;

-- ثبت پاسخ: درستی در سرور بررسی و امتیاز همان‌جا اضافه می‌شود
-- p_option = -1 یعنی «تمام شدن زمان» (بدون پاسخ): سوال سوخته و بدون امتیاز ثبت می‌شود.
-- زمان‌سنجی فقط در مرورگر انجام می‌شود و سرور آن را بررسی نمی‌کند (مبنا بر اعتماد).
create or replace function public.submit_answer(p_question uuid, p_option integer)
returns table(r_correct boolean, r_correct_index integer, r_gained integer, r_total integer)
language plpgsql security definer set search_path = public as $$
declare
  q public.questions;
  ok boolean;
  g integer := 0;
  ts integer;
begin
  if auth.uid() is null then raise exception 'ابتدا وارد شوید.'; end if;

  select * into q from public.questions where id = p_question;
  if not found then raise exception 'سوال پیدا نشد.'; end if;

  if p_option is null or p_option < -1 or p_option > 3 then raise exception 'گزینه نامعتبر است.'; end if;

  if exists (select 1 from public.answers a where a.user_id = auth.uid() and a.question_id = q.id) then
    raise exception 'این سوال را قبلاً جواب داده‌اید.';
  end if;

  ok := (q.correct = p_option);
  insert into public.answers (user_id, question_id, picked, is_correct)
  values (auth.uid(), q.id, p_option, ok);

  if ok then
    g := q.points;
    update public.profiles set total_score = total_score + g where id = auth.uid();
  end if;

  select p.total_score into ts from public.profiles p where p.id = auth.uid();
  return query select ok, q.correct, g, ts;
end $$;

-- لیدربورد: نام دیگران در سرور ماسک می‌شود
create or replace function public.get_leaderboard()
returns table(pos bigint, display_name text, score integer, is_me boolean)
language sql stable security definer set search_path = public as $$
  select row_number() over (order by p.total_score desc, p.name),
         case when p.id = auth.uid() then p.name
              else coalesce((select string_agg('*', ' ') from generate_series(1, char_length(p.name))), '') end,
         p.total_score,
         p.id = auth.uid()
    from public.profiles p
   where p.role <> 'teacher'
   order by p.total_score desc, p.name;
$$;

-- فهرست کامل سوال‌ها همراه با پاسخ درست (فقط معلم)
drop function if exists public.teacher_questions();
create or replace function public.teacher_questions()
returns table(id uuid, text text, options text[], correct integer, points integer,
              image_url text, time_limit integer, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'فقط معلم دسترسی دارد.'; end if;
  return query
    select q.id, q.text, q.options, q.correct, q.points, q.image_url, q.time_limit, q.created_at
      from public.questions q order by q.created_at;
end $$;

-- صفر کردن امتیاز همه و پاک کردن تاریخچهٔ پاسخ‌ها (فقط معلم)
create or replace function public.reset_scores()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'فقط معلم دسترسی دارد.'; end if;
  delete from public.answers where true;
  update public.profiles set total_score = 0 where true;
end $$;

-- دسترسی: فقط کاربران واردشده
revoke all on function public.next_question() from public, anon;
revoke all on function public.submit_answer(uuid, integer) from public, anon;
revoke all on function public.get_leaderboard() from public, anon;
revoke all on function public.teacher_questions() from public, anon;
revoke all on function public.reset_scores() from public, anon;
grant execute on function public.next_question() to authenticated;
grant execute on function public.submit_answer(uuid, integer) to authenticated;
grant execute on function public.get_leaderboard() to authenticated;
grant execute on function public.teacher_questions() to authenticated;
grant execute on function public.reset_scores() to authenticated;

-- ---------- ذخیره‌سازی تصویر سوال‌ها (Storage) ----------
-- همه می‌توانند تصویر را ببینند؛ فقط معلم می‌تواند آپلود یا حذف کند.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

drop policy if exists "question images teacher insert" on storage.objects;
drop policy if exists "question images teacher delete" on storage.objects;
create policy "question images teacher insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'question-images' and public.is_teacher());
create policy "question images teacher delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'question-images' and public.is_teacher());

-- بعد از اینکه معلم از داخل برنامه ثبت‌نام کرد، این را اجرا کنید (نام کاربری خودتان را بگذارید):
-- update public.profiles set role = 'teacher' where username = 'teacher';
