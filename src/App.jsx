/* App.jsx */
const { useState, useEffect, useRef, useCallback } = React;

const store = window.QAStore;

/* ---------------- AUTH ---------------- */
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login'); // login | signup | teacher
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const r = await store.signUp(username, name, password);
        if (!r.ok) { setErr(r.msg); return; }
        onAuth();
      } else {
        const r = await store.login(username, password);
        if (!r.ok) { setErr(r.msg); return; }
        if (mode === 'teacher' && r.role !== 'teacher') { await store.logout(); setErr('این حساب دسترسی معلم ندارد.'); return; }
        if (mode !== 'teacher' && r.role === 'teacher') { await store.logout(); setErr('برای معلم، از «ورود معلم» استفاده کنید.'); return; }
        onAuth();
      }
    } finally {
      setBusy(false);
    }
  }

  function goTeacher() { setMode('teacher'); setErr(''); setUsername(''); setPassword(''); }
  function goStudent() { setMode('login'); setErr(''); }

  const isTeacher = mode === 'teacher';

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-center mb-2">کوییز ریاضی</h1>
        <p className="text-center text-slate-500 mb-6">
          {isTeacher ? 'ورود معلم' : (mode === 'login' ? 'ورود به حساب دانش‌آموز' : 'ساخت حساب دانش‌آموز')}
        </p>

        {isTeacher ? (
          <div className="mb-6 border-b pb-4 text-center">
            <button onClick={goStudent} className="text-sm text-indigo-600 hover:underline">← بازگشت به ورود دانش‌آموز</button>
          </div>
        ) : (
          <div className="flex mb-6 border-b">
            <button className={'flex-1 py-2 ' + (mode === 'login' ? 'tab-active font-semibold' : 'text-slate-400')}
              onClick={() => { setMode('login'); setErr(''); }}>ورود</button>
            <button className={'flex-1 py-2 ' + (mode === 'signup' ? 'tab-active font-semibold' : 'text-slate-400')}
              onClick={() => { setMode('signup'); setErr(''); }}>ثبت‌نام</button>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block mb-1 text-sm font-medium">نام کاربری</label>
            <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username"
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          {mode === 'signup' && (
            <div>
              <label className="block mb-1 text-sm font-medium">نام و نام خانوادگی</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          )}
          <div>
            <label className="block mb-1 text-sm font-medium">رمز عبور</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <button type="submit" disabled={busy}
            className="btn w-full bg-indigo-600 text-white rounded-lg py-2 font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {busy ? 'لطفاً صبر کنید…' : (isTeacher ? 'ورود معلم' : (mode === 'login' ? 'ورود' : 'ثبت‌نام'))}
          </button>
        </form>

        {!isTeacher && (
          <div className="mt-6 text-center">
            <button onClick={goTeacher} className="text-sm text-slate-500 hover:text-slate-700 underline">
              ورود معلم
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- QUIZ (چهارگزینه‌ای) ---------------- */
function QuizTab({ onChange }) {
  const [q, setQ] = useState(null);
  const [picked, setPicked] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(true);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setPicked(null); setResult(null); setMsg(''); setBusy(true);
    const r = await store.nextQuestion();
    if (!r.ok) setMsg(r.msg);
    setQ(r.question || null);
    setBusy(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function pick(i) {
    if (result || sending) return;
    setSending(true); setPicked(i); setMsg('');
    const r = await store.submitAnswer(q.id, i);
    setSending(false);
    if (!r.ok) { setPicked(null); setMsg(r.msg); return; }
    setResult(r);
    onChange && onChange();
  }

  if (busy) return <div className="card p-8 text-center text-slate-500">در حال بارگذاری سوال…</div>;

  if (!q) {
    return (
      <div className="card p-8 text-center space-y-3">
        <div className={msg ? 'text-red-600' : 'text-slate-600'}>
          {msg || 'همهٔ سوال‌های موجود را جواب دادید! 🎉 منتظر سوال‌های جدید معلم باشید.'}
        </div>
        <button onClick={load} className="text-sm text-indigo-600 hover:underline">بررسی دوباره</button>
      </div>
    );
  }

  const optionClasses = (i) => {
    if (!result) return 'border-slate-300 hover:border-indigo-500 hover:bg-indigo-50 cursor-pointer';
    if (i === result.correctIndex) return 'border-green-500 bg-green-50 text-green-700 font-semibold';
    if (i === picked) return 'border-red-500 bg-red-50 text-red-700';
    return 'border-slate-200 text-slate-400';
  };

  return (
    <div className="card p-6">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm text-slate-500">سوال ریاضی (امتیاز: {q.points})</span>
        {result && <button onClick={load} className="text-sm text-indigo-600 hover:underline">سوال بعدی ←</button>}
      </div>
      <p className="text-xl font-bold mb-5">{q.text}</p>

      {msg && <div className="mb-3 text-sm text-red-600">{msg}</div>}

      <div className="grid grid-cols-2 gap-3">
        {q.options.map((opt, i) => (
          <button key={i} onClick={() => pick(i)} disabled={!!result || sending}
            className={'btn border-2 rounded-xl py-3 text-lg font-medium ' + optionClasses(i)}>
            <span className="inline-block w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-sm leading-6 ml-2">{'ABCD'[i]}</span>
            {opt}
          </button>
        ))}
      </div>

      {result && (
        <div className={'mt-4 rounded-lg p-4 text-center ' + (result.correct ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
          {result.correct
            ? `آفرین! ${result.gained} امتیاز کسب کردید.`
            : `اشتباه بود. پاسخ درست گزینه ${q.options[result.correctIndex]} بود.`}
        </div>
      )}
    </div>
  );
}

/* ---------------- LEADERBOARD ---------------- */
function LeaderboardTab({ version }) {
  const [board, setBoard] = useState([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setBusy(true);
    store.getLeaderboard().then(r => {
      if (!alive) return;
      setBoard(r.rows); setErr(r.ok ? '' : r.msg); setBusy(false);
    });
    return () => { alive = false; };
  }, [version]);

  const me = board.find(b => b.isMe);
  const myRank = me ? me.pos : null;

  if (busy) return <div className="card p-8 text-center text-slate-500">در حال بارگذاری…</div>;

  return (
    <div className="space-y-4">
      {err && <div className="card p-3 text-red-600 text-sm">{err}</div>}
      {me && (
        <div className="card p-4 flex justify-between items-center bg-indigo-50">
          <span className="font-semibold">رتبهٔ شما: {myRank} از {board.length}</span>
          <span>امتیاز: {me.score}</span>
        </div>
      )}
      <div className="card overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3">رتبه</th>
              <th className="px-4 py-3">نام</th>
              <th className="px-4 py-3">امتیاز</th>
            </tr>
          </thead>
          <tbody>
            {board.map((b, i) => {
              const isMe = b.isMe;
              const displayName = b.name;
              return (
                <tr key={i} className={isMe ? 'bg-indigo-50 font-semibold' : 'border-t'}>
                  <td className="px-4 py-3">{b.pos}</td>
                  <td className={'px-4 py-3 ' + (isMe ? '' : 'masked')}>{displayName}{isMe ? ' (شما)' : ''}</td>
                  <td className="px-4 py-3">{b.score}</td>
                </tr>
              );
            })}
            {board.length === 0 && (
              <tr><td colSpan="3" className="px-4 py-6 text-center text-slate-400">هنوز شرکت‌کننده‌ای وجود ندارد.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-400 text-center">نام سایر شرکت‌کنندگان جهت حفظ حریم خصوصی ماسک شده است.</div>
    </div>
  );
}

/* ---------------- TEACHER PANEL (مدیریت سوالات) ---------------- */
function TeacherPanel({ onBack }) {
  const [qs, setQs] = useState([]);
  const [editing, setEditing] = useState(null); // id or 'new'
  const [text, setText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [points, setPoints] = useState(10);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);

  async function refresh() {
    const r = await store.getTeacherQuestions();
    if (!r.ok) setErr(r.msg);
    setQs(r.rows);
    setBusy(false);
  }
  useEffect(() => { refresh(); }, []);

  function startNew() {
    setEditing('new'); setText(''); setOptions(['', '', '', '']); setCorrect(0); setPoints(10); setErr('');
  }
  function startEdit(q) {
    setEditing(q.id); setText(q.text); setOptions(q.options.slice()); setCorrect(q.correct); setPoints(q.points); setErr('');
  }
  function cancel() { setEditing(null); setErr(''); }

  function setOpt(i, v) { setOptions(o => o.map((x, j) => (j === i ? v : x))); }

  async function save(e) {
    e.preventDefault();
    if (!text.trim()) { setErr('متن سوال را وارد کنید.'); return; }
    if (options.some(o => !String(o).trim())) { setErr('هر چهار گزینه باید پر شوند.'); return; }
    const p = points === '' ? 10 : Math.round(Number(points));
    if (!Number.isFinite(p) || p < 0) { setErr('امتیاز باید عدد صفر یا بیشتر باشد.'); return; }
    const data = {
      text: text.trim(),
      options: options.map(o => String(o).trim()),
      correct: Number(correct) || 0,
      points: p,
    };
    const r = editing === 'new'
      ? await store.addQuestions([data])
      : await store.updateQuestion(editing, data);
    if (!r.ok) { setErr(r.msg); return; }
    await refresh();
    cancel();
  }

  async function remove(id) {
    if (!confirm('این سوال حذف شود؟')) return;
    const r = await store.deleteQuestion(id);
    if (!r.ok) { setErr(r.msg); return; }
    setErr('');
    refresh();
  }

  async function addRandom() {
    const list = Array.from({ length: 10 }, () => store.makeMathQuestion());
    const r = await store.addQuestions(list);
    if (!r.ok) { setErr(r.msg); return; }
    setErr('');
    refresh();
  }

  async function resetAll() {
    if (!confirm('امتیاز همهٔ دانش‌آموزان صفر و تاریخچهٔ پاسخ‌ها پاک شود؟')) return;
    const r = await store.resetScores();
    setErr(r.ok ? '' : r.msg);
    if (r.ok) alert('انجام شد.');
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">پنل معلم — مدیریت سوالات</h1>
        <button onClick={onBack} className="text-indigo-600 hover:underline">بازگشت</button>
      </div>

      {err && <div className="card p-3 text-red-600 text-sm">{err}</div>}

      <div className="card p-4 flex gap-2">
        <button onClick={startNew} className="btn bg-indigo-600 text-white rounded-lg py-2 px-4 font-semibold hover:bg-indigo-700">
          ＋ سوال جدید
        </button>
        <button onClick={addRandom} className="btn bg-emerald-600 text-white rounded-lg py-2 px-4 font-semibold hover:bg-emerald-700">
          🎲 ۱۰ سوال ریاضی تصادفی
        </button>
        <button onClick={resetAll} className="btn bg-red-100 text-red-700 rounded-lg py-2 px-4 font-semibold hover:bg-red-200 mr-auto">
          ریست امتیازها
        </button>
      </div>

      {editing !== null && (
        <div className="card p-4">
          <h2 className="font-semibold mb-3">{editing === 'new' ? 'سوال جدید' : 'ویرایش سوال'}</h2>
          <form onSubmit={save} className="space-y-3">
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
              placeholder="متن سوال (مثلاً: ۷ × ۸ = ؟)" className="w-full border rounded-lg px-3 py-2" />
            <div className="grid grid-cols-2 gap-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} title="پاسخ درست" />
                  <span className="text-xs text-slate-500 w-10">گزینه {'ABCD'[i]}</span>
                  <input value={o} onChange={e => setOpt(i, e.target.value)} placeholder={'گزینه ' + 'ABCD'[i]}
                    className="flex-1 border rounded-lg px-3 py-2" />
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-500">رادیوی کنار گزینه، پاسخ درست را مشخص می‌کند.</div>
            <input type="number" value={points} onChange={e => setPoints(e.target.value)}
              placeholder="امتیاز" className="w-40 border rounded-lg px-3 py-2" />
            <div className="flex gap-2">
              <button type="submit" className="btn bg-green-600 text-white rounded-lg py-2 px-4 font-semibold hover:bg-green-700">ذخیره</button>
              <button type="button" onClick={cancel} className="btn bg-slate-200 rounded-lg py-2 px-4 font-semibold">لغو</button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        {busy ? (
          <div className="p-8 text-center text-slate-500">در حال بارگذاری…</div>
        ) : (
          <table className="w-full text-right">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3">سوال</th>
                <th className="px-4 py-3">پاسخ درست</th>
                <th className="px-4 py-3">امتیاز</th>
                <th className="px-4 py-3">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {qs.map(q => (
                <tr key={q.id} className="border-t">
                  <td className="px-4 py-3">{q.text}</td>
                  <td className="px-4 py-3 text-green-700 font-medium">{q.options[q.correct]}</td>
                  <td className="px-4 py-3">{q.points}</td>
                  <td className="px-4 py-3 space-x-2 space-x-reverse">
                    <button onClick={() => startEdit(q)} className="text-indigo-600 hover:underline">ویرایش</button>
                    <button onClick={() => remove(q.id)} className="text-red-600 hover:underline">حذف</button>
                  </td>
                </tr>
              ))}
              {qs.length === 0 && (
                <tr><td colSpan="4" className="px-4 py-6 text-center text-slate-400">سوالی وجود ندارد.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------------- HOME ---------------- */
function HomeScreen({ session, onLogout, onRefreshSession }) {
  const [tab, setTab] = useState('quiz');
  const [version, setVersion] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  function refresh() { setVersion(v => v + 1); }
  function afterAnswer() { refresh(); onRefreshSession(); }

  const isTeacher = session.role === 'teacher';

  if (panelOpen && isTeacher) {
    return <TeacherPanel onBack={() => { setPanelOpen(false); refresh(); }} />;
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="card p-4 flex justify-between items-center">
        <div>
          <div className="font-bold">سلام، {session.name}</div>
          <div className="text-sm text-slate-500">
            {isTeacher ? 'حساب معلم' : `امتیاز کل: ${session.score || 0}`}
          </div>
        </div>
        <div className="flex gap-2">
          {isTeacher && (
            <button onClick={() => setPanelOpen(true)} className="btn bg-amber-500 text-white rounded-lg py-2 px-3 text-sm font-semibold hover:bg-amber-600">
              پنل معلم
            </button>
          )}
          <button onClick={onLogout} className="btn bg-slate-200 rounded-lg py-2 px-3 text-sm font-semibold hover:bg-slate-300">
            خروج
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex border-b">
          <button onClick={() => setTab('quiz')}
            className={'flex-1 py-3 ' + (tab === 'quiz' ? 'tab-active font-semibold' : 'text-slate-400')}>کوییز</button>
          <button onClick={() => setTab('leaderboard')}
            className={'flex-1 py-3 ' + (tab === 'leaderboard' ? 'tab-active font-semibold' : 'text-slate-400')}>لیدربورد</button>
        </div>
        <div className="p-4">
          {tab === 'quiz' ? (
            <QuizTab onChange={afterAnswer} />
          ) : (
            <LeaderboardTab version={version} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- APP ROOT ---------------- */
function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;
    store.getCurrentSession().then(s => { if (alive) { setSession(s); setChecking(false); } });
    return () => { alive = false; };
  }, []);

  async function handleAuth() {
    const s = await store.getCurrentSession();
    setSession(s);
  }
  async function handleLogout() {
    await store.logout();
    setSession(null);
  }

  if (checking) return <div className="min-h-screen flex items-center justify-center text-slate-500">در حال بررسی ورود…</div>;
  if (!store.isConfigured()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-lg p-6 text-center space-y-2">
          <h1 className="text-xl font-bold">اتصال به Supabase لازم است</h1>
          <p className="text-slate-600 text-sm">فایل <code>config.js</code> را با Project URL و anon key پروژه Supabase خود پر کنید، سپس <code>supabase/schema.sql</code> را در SQL Editor اجرا کنید.</p>
        </div>
      </div>
    );
  }
  if (!session) return <AuthScreen onAuth={handleAuth} />;
  return <HomeScreen session={session} onLogout={handleLogout} onRefreshSession={handleAuth} />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
