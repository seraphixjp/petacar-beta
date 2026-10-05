// PetaCar beta: login gate + Firestore-backed storage for the app in index.html.
// The app itself stays a plain script; it starts once window.__cloud is ready (window.__startApp()).
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
// アプリ版（Capacitor）ではブラウザのポップアップが使えないので、OS標準のログイン画面を使う
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const IOS = NATIVE && window.Capacitor.getPlatform() === 'ios';
const FA = NATIVE ? window.Capacitor.registerPlugin('FirebaseAuthentication') : null;
async function nativeCred(A, kind) {
  if (kind === 'apple') { const r = await FA.signInWithApple({ skipNativeAuth: true }); return new A.OAuthProvider('apple.com').credential({ idToken: r.credential.idToken, rawNonce: r.credential.nonce }) }
  const r = await FA.signInWithGoogle({ skipNativeAuth: true }); return A.GoogleAuthProvider.credential(r.credential.idToken);
}
const gate = document.getElementById('gate');
const LOCAL_KEYS = ['colv2', 'sort2'];                 // per-device view preferences
const PROFILE_SYNC = ['me2', 'log2', 'spot2', 'pins2', 'set2']; // keys that change what others see
const people = (window.__people = window.__people || []);
const peopleCbs = [];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LOGO = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="22" fill="#e8551c"/><text x="46" y="60" text-anchor="middle" font-size="22" textLength="64" lengthAdjust="spacingAndGlyphs" fill="#fff" transform="rotate(-8 50 50)" font-family="Dela Gothic One,Hiragino Sans,sans-serif">ペタカー</text><text x="80" y="44" font-size="24" fill="#121820" transform="rotate(12 80 40)" font-family="Dela Gothic One,sans-serif">!</text><path d="M18 74h64" stroke="#121820" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 8"/></svg>`;
function showGate(html) { gate.hidden = false; gate.innerHTML = `<div class="gbox"><div class="glogo">${LOGO}</div>${html}</div>`; }
const step = t => showGate(`<p>${esc(t)}</p><div class="gspin"></div>`);
function showError(where, e) { console.error(where, e); showGate(`<h1>うまく開けませんでした</h1><p>${esc(where)}</p><p class="gerr">${esc((e && (e.code || e.message)) || e)}</p><p>この画面のスクリーンショットを鈴木さんに送ってください。</p><button class="gbtn" onclick="location.reload()">開き直す</button>`) }
addEventListener('error', e => { if (gate.hidden) { const b = document.createElement('div'); b.className = 'errbar'; b.textContent = 'エラー: ' + (e.message || '') + ' @' + (e.lineno || ''); document.body.appendChild(b) } });
addEventListener('unhandledrejection', e => { if (gate.hidden) { const b = document.createElement('div'); b.className = 'errbar'; b.textContent = 'エラー: ' + ((e.reason && (e.reason.code || e.reason.message)) || e.reason); document.body.appendChild(b) } });
// .now() は書き込み待ちがあるときだけ走る（何も変えていない古い画面が、閉じるときに上書きしないように）
const debounce = (fn, ms) => { let t = null; const f = () => { clearTimeout(t); t = setTimeout(() => { t = null; fn() }, ms) }; f.now = () => { if (t === null) return; clearTimeout(t); t = null; fn() }; f.cancel = () => { clearTimeout(t); t = null }; return f };

/* ---------- データを消さないための守り ---------- */
const DEV = Math.random().toString(36).slice(2, 10); // この画面を開いた1回ごとの印
const LOADED_AT = Date.now();
let frozen = null;            // 'maint' | 'stale' | 'guard' のとき、クラウドへは書かない
const bar = (id, text, color) => {
  let b = document.getElementById(id);
  if (!text) { if (b) b.remove(); return }
  if (!b) { b = document.createElement('div'); b.id = id; b.className = 'errbar'; document.body.appendChild(b) }
  b.textContent = text; if (color) b.style.background = color;
};

function makeStore(backend, profDoc, privDoc) {
  const priv = { ...(privDoc || {}) };
  let prof = profDoc || null;
  const ME_SKIP = ['sns', 'vers', 'stats', 'showStats', 'showRewards', 'pubEvents', 'upd', 'dev'];
  const pickMe = p => { const o = {}; for (const k in p) if (!ME_SKIP.includes(k)) o[k] = p[k]; return o };
  // 交換とスポットの記録はアプリの操作では減らない。減った内容を書こうとしたら不具合なので書かない
  const cnt = p => ({ log2: Array.isArray(p.log2) ? p.log2.length : 0, spot2: Array.isArray(p.spot2) ? p.spot2.length : 0 });
  const base = { ...cnt(priv), real: !!(prof && !prof.def) };
  const guardTrip = what => {
    if (frozen !== 'guard') console.error('save blocked:', what);
    frozen = frozen || 'guard';
    bar('savebar', '記録が減る保存を止めました。アプリを開き直してください（データは守られています）');
  };
  const retry = f => { bar('savebar', '保存できませんでした。通信状態を確認してください（自動でやり直します）'); setTimeout(f, 5000) };
  const flushPriv = debounce(() => {
    if (frozen) return;
    const n = cnt(priv);
    if (n.log2 < base.log2 || n.spot2 < base.spot2) return guardTrip(`log ${base.log2}->${n.log2}, spot ${base.spot2}->${n.spot2}`);
    backend.setPriv({ ...priv, _dev: DEV, _at: Date.now() }).then(() => {
      base.log2 = Math.max(base.log2, n.log2); base.spot2 = Math.max(base.spot2, n.spot2); bar('savebar', '');
    }, e => { console.warn('priv', e); retry(flushPriv) });
  }, 800);
  const flushProf = debounce(() => {
    if (frozen) return;
    const a = window.__app; if (!a) return;
    if (base.real && a.me.def) return guardTrip('profile reset to default');
    const me = { ...a.me }; delete me.sample; delete me.official;
    let vers = (prof && prof.vers) || [];
    if (!me.def) {
      const v = me.ver || 1, cur = { img: me.img, ring: me.ring };
      vers = vers.length < v ? [...vers, cur] : [...vers.slice(0, v - 1), cur];
      if (vers.length > 8) vers = vers.map((x, i) => i < vers.length - 8 ? { ring: x.ring, img: null } : x);
    }
    const s = a.settings;
    prof = { ...me, sns: s.showSns ? (s.sns || []).filter(Boolean).slice(0, 2) : [], vers, stats: { ...a.myStats(), pins: a.myPins() }, showStats: !!s.pubStats, showRewards: !!s.pubRewards, pubEvents: !!s.pubEvents, upd: Date.now(), dev: DEV };
    if (!me.def) base.real = true;
    backend.setProfile(prof).then(() => bar('savebar', ''), e => { console.warn('profile', e); retry(flushProf) });
  }, 1000);
  const flushAll = () => { flushPriv.now(); flushProf.now() };
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll() });
  return {
    flushAll, cancelAll: () => { flushPriv.cancel(); flushProf.cancel() },
    get(k, d) {
      if (LOCAL_KEYS.includes(k)) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch (e) { return d } }
      if (k === 'me2') return prof ? pickMe(prof) : d;
      return k in priv ? priv[k] : d;
    },
    set(k, v) {
      if (LOCAL_KEYS.includes(k)) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { } return }
      if (k !== 'me2') { priv[k] = v; flushPriv() }
      if (PROFILE_SYNC.includes(k)) flushProf();
    },
  };
}

function toPerson(id, d) {
  const sns = Array.isArray(d.sns) ? d.sns.filter(u => typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) && u.length <= 200).slice(0, 2) : [];
  return { id, official: !!OFF[id], sns, msg: typeof d.msg === 'string' ? d.msg.slice(0, 30) : '', name: d.name || '名無し', maker: d.maker || 'その他', car: d.car || '—', pref: d.pref || '', ring: d.ring || '#e8551c',
    img: d.img, bg: d.bg, ver: d.ver || 1, vers: (d.vers && d.vers.length ? d.vers : [{ img: d.img, ring: d.ring }]).map(v => ({ ring: v.ring, img: v.img || d.img })),
    stats: { pins: [], ...(d.stats || {}) }, showStats: d.showStats !== false, showRewards: d.showRewards !== false };
}
// 公式アカウント：運営がコンソールで official/{uid} を作ったときだけ付く。本人のプロフィールの値は信用しない
let OFF = {};
function setPeople(map, me) {
  people.length = 0;
  for (const [id, d] of Object.entries(map)) if (id !== me && d && !d.def) people.push(toPerson(id, d));
  peopleCbs.forEach(f => { try { f() } catch (e) { console.warn(e) } });
}

/* ---------- Firebase backend ---------- */
async function firebaseBackend() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
  const app = initializeApp(firebaseConfig), auth = NATIVE ? A.initializeAuth(app, { persistence: A.indexedDBLocalPersistence }) : A.getAuth(app), db = F.getFirestore(app);
  const provider = new A.GoogleAuthProvider();
  const user = await new Promise(res => {
    const un = A.onAuthStateChanged(auth, u => {
      if (u) { un(); res(u); return }
      if (NATIVE) {
        showGate(`<h1>ペタカー!</h1><p>実際に会った人とだけ、車のスタンプを交換できます。</p>
          ${IOS ? '<button class="gbtn apple" id="napple">Appleでサインイン</button>' : ''}<button class="gbtn${IOS ? ' sub' : ''}" id="ngoogle">Googleでログイン</button><p class="gerr" id="gerr" hidden></p>`);
        const go = kind => nativeCred(A, kind).then(c => A.signInWithCredential(auth, c)).catch(e => {
          const el = document.getElementById('gerr'); el.hidden = false;
          el.textContent = /cancel/i.test((e && (e.code || e.message)) || '') ? 'ログインがキャンセルされました。' : 'ログインできませんでした（' + ((e && (e.code || e.message)) || e) + '）';
        });
        document.getElementById('ngoogle').onclick = () => go('google');
        if (IOS) document.getElementById('napple').onclick = () => go('apple');
        return;
      }
      // LINEなどアプリ内のブラウザではGoogleログインが戻ってこない。LINEは外部ブラウザで開き直せる
      const ua = navigator.userAgent, inApp = /\bLine\/|FBAN|FBAV|Instagram|; wv\)/i.test(ua);
      if (/\bLine\//i.test(ua) && !/openExternalBrowser=1/.test(location.search)) {
        location.replace(location.pathname + (location.search ? location.search + '&' : '?') + 'openExternalBrowser=1'); return }
      showGate(`<h1>ペタカー! ベータ</h1><p>招待された人だけが使えるテスト版です。招待に使ったGoogleアカウントでログインしてください。</p>
        ${inApp ? '<p class="gerr">アプリの中のブラウザではログインできません。下のボタンでURLをコピーして、ChromeやSafariに貼り付けて開いてください。</p>' : ''}
        <button class="gbtn" id="glogin">Googleでログイン</button><p class="gerr" id="gerr" hidden></p>
        <p class="ghelp">ログインのあと白い画面で止まるときは、メールやLINEのリンクから開いている可能性があります。URLをコピーして、Chrome（iPhoneはSafari）で直接開いてください。</p>
        <button class="gbtn sub" id="gcopy">URLをコピー</button>`);
      document.getElementById('gcopy').onclick = e => {
        const url = location.origin + location.pathname;
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => e.target.textContent = 'コピーしました', () => prompt('このURLをコピーしてください', url));
      };
      document.getElementById('glogin').onclick = () => A.signInWithPopup(auth, provider).catch(e => {
        const el = document.getElementById('gerr'); el.hidden = false;
        el.textContent = e.code === 'auth/popup-blocked' ? 'ログイン画面が開けませんでした。ブラウザのポップアップを許可してください。' : e.code === 'auth/popup-closed-by-user' ? 'ログインがキャンセルされました。' : 'ログインできませんでした（' + e.code + '）';
      });
    });
  });
  step('招待リストを確認しています…');
  const email = (user.email || '').toLowerCase();
  let allowErr = null;
  const allowed = await F.getDoc(F.doc(db, 'allow', email)).then(s => s.exists()).catch(e => { allowErr = e; return false });
  if (allowErr && allowErr.code !== 'permission-denied') throw allowErr;
  if (!allowed) {
    showGate(`<h1>まだ招待されていません</h1><p><b>${esc(email)}</b> はテストの参加者リストに入っていません。鈴木さんに、このアドレスを伝えてください。</p><button class="gbtn sub" id="gout">別のアカウントでログイン</button>`);
    document.getElementById('gout').onclick = () => A.signOut(auth).then(() => location.reload());
    return null;
  }
  const uid = user.uid, D = (...p) => F.doc(db, ...p), Col = (...p) => F.collection(db, ...p);
  step('データを読み込んでいます…');
  const [profSnap, privSnap] = await Promise.all([F.getDoc(D('users', uid)), F.getDoc(D('users', uid, 'priv', 'state'))]);
  const snapMap = qs => { const m = {}; qs.forEach(d => m[d.id] = d.data()); return m };
  return {
    uid, profDoc: profSnap.exists() ? profSnap.data() : null, privDoc: privSnap.exists() ? privSnap.data() : null,
    setProfile: d => F.setDoc(D('users', uid), d),
    setPriv: d => F.setDoc(D('users', uid, 'priv', 'state'), d),
    subPeople: (cb, err) => F.onSnapshot(Col('users'), qs => cb(snapMap(qs)), e => { console.warn('people', e); err && err(e) }),
    live: {
      set: d => F.setDoc(D('live', uid), d),
      clear: () => F.deleteDoc(D('live', uid)).catch(() => { }),
      sub: cb => F.onSnapshot(Col('live'), qs => cb(snapMap(qs)), e => console.warn('live', e)),
    },
    ex: {
      create: async peer => { const r = F.doc(Col('ex')); await F.setDoc(r, { a: uid, b: peer, state: 'asked', at: Date.now() }); return r.id },
      update: (id, d) => F.updateDoc(D('ex', id), d),
      sub: cb => {
        let A1 = {}, B1 = {}; const fire = () => { const m = {}; for (const [k, v] of Object.entries({ ...A1, ...B1 })) m[k] = { ...v, id: k }; cb(m) };
        const u1 = F.onSnapshot(F.query(Col('ex'), F.where('a', '==', uid)), qs => { A1 = snapMap(qs); fire() }, e => console.warn('exA', e));
        const u2 = F.onSnapshot(F.query(Col('ex'), F.where('b', '==', uid)), qs => { B1 = snapMap(qs); fire() }, e => console.warn('exB', e));
        return () => { u1(); u2() };
      },
      subSides: (id, cb) => F.onSnapshot(Col('ex', id, 'side'), qs => cb(snapMap(qs)), e => console.warn('side', e)),
      setSide: (id, d) => F.setDoc(D('ex', id, 'side', uid), d),
    },
    // スポットの「いま◯人」：誰が記録したかは書かない（spot と期限だけ）
    here: {
      add: spot => F.addDoc(Col('here'), { spot, until: Date.now() + 7200000 }),
      sub: cb => F.onSnapshot(F.query(Col('here'), F.where('until', '>', Date.now())), qs => cb(qs.docs.map(d => d.data())), e => console.warn('here', e)),
    },
    official: cb => F.onSnapshot(Col('official'), qs => { const m = {}; qs.forEach(d => m[d.id] = true); cb(m) }, e => console.warn('official', e)),
    // メンテナンスのスイッチ（運営がコンソールで config/app を書き換える）。読めないときはスイッチなし扱い
    config: cb => F.onSnapshot(D('config', 'app'), s => cb(s.exists() ? s.data() : {}), e => { console.warn('config', e); cb({}) }),
    subMine: cb => F.onSnapshot(D('users', uid, 'priv', 'state'), s => cb(s.exists() ? s.data() : null), e => console.warn('mine', e)),
    // バックアップ：曜日ごとの7枠（b0〜b6）と、復元の直前の状態（bpre）。自分しか読めない場所に置く
    bakGet: (slot, withProf) => Promise.all([F.getDoc(D('users', uid, 'priv', 'b' + slot)), withProf ? F.getDoc(D('users', uid, 'priv', 'bp' + slot)) : null]).then(([a, b]) => a.exists() ? { ...a.data(), prof: b && b.exists() ? b.data().data : null } : null),
    bakPut: (slot, day, privD, profD) => Promise.all([F.setDoc(D('users', uid, 'priv', 'b' + slot), { day, at: Date.now(), data: privD }), profD ? F.setDoc(D('users', uid, 'priv', 'bp' + slot), { day, at: Date.now(), data: profD }) : null]),
    report: d => F.addDoc(Col('reports'), { ...d, by: uid, at: Date.now() }),
    signOut: () => (NATIVE ? FA.signOut().catch(() => { }) : Promise.resolve()).then(() => A.signOut(auth)).then(() => location.reload()),
    deleteAccount: async () => {
      const baks = ['pre', 0, 1, 2, 3, 4, 5, 6].flatMap(k => ['b' + k, 'bp' + k]).map(k => F.deleteDoc(D('users', uid, 'priv', k)));
      await Promise.all([F.deleteDoc(D('live', uid)).catch(() => { }), ...baks, F.deleteDoc(D('users', uid, 'priv', 'state')), F.deleteDoc(D('users', uid))]);
      try { await A.deleteUser(auth.currentUser) }
      catch (e) { if (e.code === 'auth/requires-recent-login') { if (NATIVE) { const apple = auth.currentUser.providerData.some(p => p.providerId === 'apple.com'); await A.reauthenticateWithCredential(auth.currentUser, await nativeCred(A, apple ? 'apple' : 'google')) } else await A.reauthenticateWithPopup(auth.currentUser, provider); await A.deleteUser(auth.currentUser) } else throw e }
    },
  };
}

/* ---------- local mock backend (two-frame testing on localhost only) ---------- */
function mockBackend(uid) {
  const M = window.parent.__mock;   // { docs: Map, subs: Set }
  const notify = () => setTimeout(() => M.subs.forEach(f => f()), 20);
  const put = (p, d) => { M.docs.set(p, JSON.parse(JSON.stringify(d))); notify(); return Promise.resolve() };
  const coll = (prefix, filter = () => true) => { const m = {}; for (const [k, v] of M.docs) { const rest = k.slice(prefix.length + 1); if (k.startsWith(prefix + '/') && !rest.includes('/') && filter(v)) m[rest] = JSON.parse(JSON.stringify(v)) } return m };
  const sub = (fn) => { const f = () => fn(); M.subs.add(f); setTimeout(f, 10); return () => M.subs.delete(f) };
  let n = 0;
  return {
    uid, profDoc: M.docs.get('users/' + uid) || null, privDoc: M.docs.get('users/' + uid + '/priv/state') || null,
    setProfile: d => put('users/' + uid, d), setPriv: d => put('users/' + uid + '/priv/state', d),
    subPeople: (cb, err) => sub(() => cb(coll('users'))),
    live: { set: d => put('live/' + uid, d), clear: () => { M.docs.delete('live/' + uid); notify(); return Promise.resolve() }, sub: cb => sub(() => cb(coll('live'))) },
    ex: {
      create: async peer => { const id = 'x' + Date.now() + (n++); await put('ex/' + id, { a: uid, b: peer, state: 'asked', at: Date.now() }); return id },
      update: (id, d) => put('ex/' + id, { ...M.docs.get('ex/' + id), ...d }),
      sub: cb => sub(() => { const m = coll('ex', v => v.a === uid || v.b === uid); for (const k in m) m[k].id = k; cb(m) }),
      subSides: (id, cb) => sub(() => cb(coll('ex/' + id + '/side'))),
      setSide: (id, d) => put('ex/' + id + '/side/' + uid, d),
    },
    here: { add: spot => put('here/h' + Date.now() + (n++), { spot, until: Date.now() + 7200000 }), sub: cb => sub(() => cb(Object.values(coll('here')))) },
    official: cb => sub(() => { const m = {}; Object.keys(coll('official')).forEach(k => m[k] = true); cb(m) }),
    config: cb => sub(() => cb(JSON.parse(JSON.stringify(M.docs.get('config/app') || {})))),
    subMine: cb => sub(() => cb(JSON.parse(JSON.stringify(M.docs.get('users/' + uid + '/priv/state') || null)))),
    bakGet: slot => { const a = M.docs.get('users/' + uid + '/priv/b' + slot), b = M.docs.get('users/' + uid + '/priv/bp' + slot); return Promise.resolve(a ? JSON.parse(JSON.stringify({ ...a, prof: b ? b.data : null })) : null) },
    bakPut: (slot, day, privD, profD) => { put('users/' + uid + '/priv/b' + slot, { day, at: Date.now(), data: privD }); if (profD) put('users/' + uid + '/priv/bp' + slot, { day, at: Date.now(), data: profD }); return Promise.resolve() },
    report: d => put('reports/r' + Date.now(), { ...d, by: uid }),
    signOut: () => Promise.resolve(location.reload()),
    deleteAccount: async () => { for (const k of [...M.docs.keys()]) if (k === 'users/' + uid || k.startsWith('users/' + uid + '/') || k === 'live/' + uid) M.docs.delete(k); notify() },
  };
}

/* ---------- boot ---------- */
const params = new URLSearchParams(location.search);
const mockId = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && params.get('mock');
let be = null;
try { be = mockId ? mockBackend(mockId) : await firebaseBackend() }
catch (e) { showError('ログインまたは読み込みの途中で止まりました。', e) }
const ymdL = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const counts = d => ({ log: d && Array.isArray(d.log2) ? d.log2.length : 0, spot: d && Array.isArray(d.spot2) ? d.spot2.length : 0 });

// 1日1回、読み込んだ直後（まだ何も変えていない状態）を曜日の枠に残す
async function dailyBackup() {
  if (!be.privDoc) return;
  const day = ymdL(), slot = new Date().getDay();
  const cur = await be.bakGet(slot, false);
  if (cur && cur.day === day) return;
  await be.bakPut(slot, day, be.privDoc, be.profDoc);
}

// ?restore を付けて開くと、バックアップから戻す画面になる
async function showRestore() {
  step('バックアップを探しています…');
  const slots = ['pre', 0, 1, 2, 3, 4, 5, 6];
  const got = (await Promise.all(slots.map(s => be.bakGet(s, false).then(b => b && { ...b, slot: s }).catch(() => null)))).filter(Boolean).sort((a, b) => b.at - a.at);
  const now = counts(be.privDoc), name = b => b.slot === 'pre' ? '戻す前の状態' : b.day + ' の状態';
  const back = () => location.replace(location.pathname + (mockId ? '?mock=' + mockId : ''));
  showGate(`<h1>バックアップから戻す</h1><p>いまのデータ：交換${now.log}件・スポット${now.spot}件</p>
    <p>アプリを開いた日ごとに、最大7日分を自動で保存しています。戻す直前の状態も残るので、やり直せます。</p>
    ${got.length ? got.map(b => { const n = counts(b.data); return `<button class="gbtn sub" data-slot="${b.slot}">${esc(name(b))}<br><small>交換${n.log}件・スポット${n.spot}件</small></button>` }).join('') : '<p class="gerr">まだバックアップがありません。</p>'}
    <button class="gbtn" id="rback">戻さずにアプリを開く</button>`);
  document.getElementById('rback').onclick = back;
  gate.querySelectorAll('[data-slot]').forEach(btn => btn.onclick = async () => {
    const b = got.find(x => String(x.slot) === btn.dataset.slot);
    if (!confirm(`${name(b)}に戻しますか？`)) return;
    step('戻しています…');
    try {
      const full = await be.bakGet(b.slot, true);
      if (b.slot !== 'pre') await be.bakPut('pre', ymdL(), be.privDoc || {}, be.profDoc);
      await be.setPriv({ ...full.data, _dev: DEV, _at: Date.now() });
      if (full.prof) await be.setProfile({ ...full.prof, dev: DEV, upd: Date.now() });
      showGate(`<h1>戻しました</h1><p>${esc(name(b))}に戻りました。</p><button class="gbtn" id="rdone">アプリを開く</button>`);
      document.getElementById('rdone').onclick = back;
    } catch (e) { showError('戻せませんでした。', e) }
  });
}

if (be && params.has('restore')) showRestore().catch(e => showError('バックアップを読み込めませんでした。', e));
else if (be) {
  const store = makeStore(be, be.profDoc, be.privDoc);
  window.__cloud = {
    uid: be.uid, store, people,
    onPeople: f => peopleCbs.push(f), isOfficial: id => !!OFF[id],
    live: be.live, ex: be.ex, here: be.here, report: be.report, signOut: be.signOut, deleteAccount: be.deleteAccount,
  };
  let started = false, gotPeople = false, gotCfg = false, cfg = {};
  step('参加者を読み込んでいます…');
  const slow = setTimeout(() => { if (!started && !frozen) showError('参加者の一覧を読み込めません（15秒たっても応答がありません）。', 'timeout') }, 15000);
  function start() {
    if (started || !gotPeople || !gotCfg || frozen) return;
    started = true; clearTimeout(slow);
    try { window.__startApp(); gate.hidden = true; gate.innerHTML = ''; dailyBackup().catch(e => console.warn('backup', e)) }
    catch (e) { showError('画面の準備中にエラーが起きました。', e) }
  }

  // メンテナンス：config/app の maint が true の間は、運営（staff に uid がある人）以外は止める
  const isStaff = c => String(c.staff || '').split(/[\s,]+/).includes(be.uid);
  be.config(c => {
    cfg = c || {}; gotCfg = true;
    const staff = isStaff(cfg);
    bar('maintbar', cfg.maint && staff ? 'メンテナンス中（運営だけ使えます）' : '', '#6d4fd8');
    if (cfg.maint && !staff) {
      if (frozen === 'maint') return;
      if (started) store.flushAll();   // 押した直後の記録は先に保存してから止める
      store.cancelAll(); frozen = frozen || 'maint'; clearTimeout(slow);
      showGate(`<h1>ただいまメンテナンス中です</h1><p>${esc(cfg.msg || 'アプリの更新作業をしています。終わると自動で開き直します。')}</p><p>これまでの記録はそのまま残っています。</p><div class="gspin"></div>`);
      return;
    }
    if (frozen === 'maint') { location.reload(); return }
    start();
  });

  // 別の端末・タブが新しい内容を書いたら、この画面の古い内容で上書きしないように止めて読み込み直す
  const stale = () => {
    if (frozen === 'stale' || frozen === 'maint') return;
    store.cancelAll(); frozen = 'stale';
    const go = () => location.reload();
    if (document.visibilityState === 'hidden') { addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') go() }); return }
    showGate(`<h1>別の画面で記録が更新されました</h1><p>ほかのスマホやタブで、ペタカー! の記録が変わりました。古い内容で上書きしないように、最新の状態を読み込み直します。</p><button class="gbtn" id="sreload">読み込み直す</button>`);
    document.getElementById('sreload').onclick = go;
  };
  const p0 = be.privDoc || {}, f0 = be.profDoc || {};
  be.subMine(d => { if (d && d._dev !== DEV && !(d._dev === p0._dev && d._at === p0._at)) stale() });

  let lastMap = {};
  be.official(m => { OFF = m; setPeople(lastMap, be.uid) });
  be.subPeople(map => {
    lastMap = map; setPeople(map, be.uid);
    const mine = map[be.uid];
    if (mine && mine.dev !== DEV && !(mine.dev === f0.dev && mine.upd === f0.upd)) stale();
    if (gotPeople) return;
    gotPeople = true; start();
  }, e => { if (!gotPeople) { clearTimeout(slow); showError('参加者の一覧を読み込めませんでした。', e) } });
}
