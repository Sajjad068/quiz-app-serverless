/* store.js - لایه دسترسی به داده (Supabase)
   امتیازدهی، انتخاب سوال و لیدربورد همگی در سرور (توابع SQL) انجام می‌شوند. */

const SUPABASE_URL = window.QA_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.QA_SUPABASE_ANON_KEY || '';

function makeClient() {
  try {
    if (!window.supabase || !window.supabase.createClient) return null;
    if (!/^https?:\/\//.test(SUPABASE_URL) || !SUPABASE_ANON_KEY) return null;
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) { return null; }
}

const db = makeClient();
const isConfigured = () => !!db;

function hiddenEmail(username) { return String(username).trim().toLowerCase() + '@quiz.local'; }

/* ---------- تولید سوال ریاضی چهارگزینه‌ای ---------- */
function faNum(n) { return String(n).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]); }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

function makeMathQuestion() {
  const ops = ['+', '-', '×'];
  const op = ops[randInt(0, 2)];
  let a, b, ans;
  if (op === '+') { a = randInt(2, 50); b = randInt(2, 50); ans = a + b; }
  else if (op === '-') { a = randInt(10, 60); b = randInt(2, 9); ans = a - b; }
  else { a = randInt(2, 12); b = randInt(2, 12); ans = a * b; }

  const nums = [ans];
  let guard = 0;
  while (nums.length < 4 && guard++ < 50) {
    const cand = ans + randInt(1, 9) * (Math.random() < 0.5 ? -1 : 1);
    if (cand >= 0 && !nums.includes(cand)) nums.push(cand);
  }
  while (nums.length < 4) nums.push(ans + nums.length * 3);

  const shuffled = nums.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return {
    text: `${faNum(a)} ${op} ${faNum(b)} = ؟`,
    options: shuffled.map(x => faNum(x)),
    correct: shuffled.indexOf(ans),
    points: 10,
  };
}

function friendlyError(e) {
  const m = (e && (e.message || e.error_description || e.error)) || '';
  if (/already registered/i.test(m) || /database error saving new user/i.test(m)) return 'این نام کاربری قبلاً گرفته شده است.';
  if (/invalid login credentials/i.test(m)) return 'نام کاربری یا رمز عبور اشتباه است.';
  if (/email not confirmed/i.test(m)) return 'ایمیل این حساب تایید نشده است. (در Supabase گزینه Confirm email را خاموش کنید)';
  if (/password should be at least/i.test(m)) return 'رمز عبور باید حداقل ۶ کاراکتر باشد.';
  if (/rate limit/i.test(m)) return 'تعداد تلاش‌ها زیاد بود؛ کمی بعد دوباره امتحان کنید.';
  if (/Failed to fetch/i.test(m) || /NetworkError/i.test(m)) return 'اتصال به Supabase برقرار نشد. اینترنت یا آدرس را در config.js بررسی کنید.';
  if (/permission denied/i.test(m) || /row-level security/i.test(m)) return 'اجازهٔ این کار را ندارید.';
  return m || 'خطای ناشناخته رخ داد.';
}

const okOrErr = (error) => (error ? { ok: false, msg: friendlyError(error) } : { ok: true });

const remoteStore = {
  async fetchProfile(userId) {
    const { data } = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
    return data || null;
  },

  async signUp(username, name, password) {
    username = String(username || '').trim().toLowerCase();
    name = String(name || '').trim();
    if (!username || !name || !password) return { ok: false, msg: 'تمام فیلدها الزامی هستند.' };
    if (!/^[a-z0-9_.-]+$/.test(username)) return { ok: false, msg: 'نام کاربری فقط حروف انگلیسی، عدد و _ - . باشد.' };
    if (name.length > 40) return { ok: false, msg: 'نام خیلی بلند است.' };

    const { data, error } = await db.auth.signUp({
      email: hiddenEmail(username),
      password,
      options: { data: { username, name } },
    });
    if (error) return { ok: false, msg: friendlyError(error) };
    if (!data.session) return { ok: false, msg: 'ثبت‌نام کامل نشد؛ گزینه Confirm email را در Supabase خاموش کنید.' };
    return { ok: true, role: 'student' };
  },

  async login(username, password) {
    username = String(username || '').trim().toLowerCase();
    const { data, error } = await db.auth.signInWithPassword({ email: hiddenEmail(username), password });
    if (error) return { ok: false, msg: friendlyError(error) };
    const profile = await remoteStore.fetchProfile(data.user.id);
    return { ok: true, role: (profile && profile.role) || 'student' };
  },

  async logout() { await db.auth.signOut(); },

  async getCurrentSession() {
    const { data } = await db.auth.getSession();
    const session = data ? data.session : null;
    if (!session) return null;
    const profile = await remoteStore.fetchProfile(session.user.id);
    if (!profile) return null;
    return { username: profile.username, name: profile.name, role: profile.role || 'student', score: profile.total_score || 0 };
  },

  /* ----- دانش‌آموز ----- */
  async nextQuestion() {
    const { data, error } = await db.rpc('next_question');
    if (error) return { ok: false, msg: friendlyError(error), question: null };
    return { ok: true, question: (data && data[0]) || null };
  },

  async submitAnswer(questionId, optionIndex) {
    const { data, error } = await db.rpc('submit_answer', { p_question: questionId, p_option: optionIndex });
    if (error) return { ok: false, msg: friendlyError(error) };
    const r = data && data[0];
    if (!r) return { ok: false, msg: 'پاسخی از سرور دریافت نشد.' };
    return { ok: true, correct: r.r_correct, correctIndex: r.r_correct_index, gained: r.r_gained, total: r.r_total };
  },

  async getLeaderboard() {
    const { data, error } = await db.rpc('get_leaderboard');
    if (error) return { ok: false, msg: friendlyError(error), rows: [] };
    return {
      ok: true,
      rows: (data || []).map(r => ({ pos: Number(r.pos), name: r.display_name, score: r.score || 0, isMe: !!r.is_me })),
    };
  },

  /* ----- معلم ----- */
  async getTeacherQuestions() {
    const { data, error } = await db.rpc('teacher_questions');
    if (error) return { ok: false, msg: friendlyError(error), rows: [] };
    return { ok: true, rows: data || [] };
  },

  async addQuestions(list) {
    const { data } = await db.auth.getSession();
    const uid = data && data.session ? data.session.user.id : null;
    const { error } = await db.from('questions').insert(list.map(q => ({ ...q, created_by: uid })));
    return okOrErr(error);
  },

  async updateQuestion(id, q) {
    const { error } = await db.from('questions').update(q).eq('id', id);
    return okOrErr(error);
  },

  async deleteQuestion(id) {
    const { error } = await db.from('questions').delete().eq('id', id);
    return okOrErr(error);
  },

  async uploadQuestionImage(file) {
    if (!file) return { ok: false, msg: 'فایلی انتخاب نشد.' };
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) return { ok: false, msg: 'فقط تصویر PNG، JPG، WEBP، GIF یا SVG مجاز است.' };
    if (file.size > 2 * 1024 * 1024) return { ok: false, msg: 'حجم تصویر باید کمتر از ۲ مگابایت باشد.' };
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await db.storage.from('question-images').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
    if (error) return { ok: false, msg: friendlyError(error) };
    const { data } = db.storage.from('question-images').getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
  },

  async resetScores() {
    const { error } = await db.rpc('reset_scores');
    return okOrErr(error);
  },
};

/* ---------- خروجی نهایی ---------- */
const qaStore = remoteStore;
qaStore.isConfigured = isConfigured;
qaStore.makeMathQuestion = makeMathQuestion;

window.QAStore = qaStore;
