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
const debounce = (fn, ms) => { let t; const f = () => { clearTimeout(t); t = setTimeout(fn, ms) }; f.now = () => { clearTimeout(t); fn() }; return f };

function makeStore(backend, profDoc, privDoc) {
  const priv = { ...(privDoc || {}) };
  let prof = profDoc || null;
  const ME_SKIP = ['vers', 'stats', 'showStats', 'showRewards', 'pubEvents', 'upd'];
  const pickMe = p => { const o = {}; for (const k in p) if (!ME_SKIP.includes(k)) o[k] = p[k]; return o };
  const flushPriv = debounce(() => backend.setPriv(priv).catch(e => console.warn('priv', e)), 800);
  const flushProf = debounce(() => {
    const a = window.__app; if (!a) return;
    const me = { ...a.me }; delete me.sample;
    let vers = (prof && prof.vers) || [];
    if (!me.def) {
      const v = me.ver || 1, cur = { img: me.img, ring: me.ring };
      vers = vers.length < v ? [...vers, cur] : [...vers.slice(0, v - 1), cur];
      if (vers.length > 8) vers = vers.map((x, i) => i < vers.length - 8 ? { ring: x.ring, img: null } : x);
    }
    const s = a.settings;
    prof = { ...me, vers, stats: { ...a.myStats(), pins: a.myPins() }, showStats: !!s.pubStats, showRewards: !!s.pubRewards, pubEvents: !!s.pubEvents, upd: Date.now() };
    backend.setProfile(prof).catch(e => console.warn('profile', e));
  }, 1000);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { flushPriv.now(); flushProf.now() } });
  return {
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
  return { id, msg: typeof d.msg === 'string' ? d.msg.slice(0, 30) : '', name: d.name || '名無し', maker: d.maker || 'その他', car: d.car || '—', pref: d.pref || '', ring: d.ring || '#e8551c',
    img: d.img, bg: d.bg, ver: d.ver || 1, vers: (d.vers && d.vers.length ? d.vers : [{ img: d.img, ring: d.ring }]).map(v => ({ ring: v.ring, img: v.img || d.img })),
    stats: { pins: [], ...(d.stats || {}) }, showStats: d.showStats !== false, showRewards: d.showRewards !== false };
}
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
    report: d => F.addDoc(Col('reports'), { ...d, by: uid, at: Date.now() }),
    signOut: () => (NATIVE ? FA.signOut().catch(() => { }) : Promise.resolve()).then(() => A.signOut(auth)).then(() => location.reload()),
    deleteAccount: async () => {
      await Promise.all([F.deleteDoc(D('live', uid)).catch(() => { }), F.deleteDoc(D('users', uid, 'priv', 'state')), F.deleteDoc(D('users', uid))]);
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
    report: d => put('reports/r' + Date.now(), { ...d, by: uid }),
    signOut: () => Promise.resolve(location.reload()),
    deleteAccount: async () => { ['users/' + uid, 'users/' + uid + '/priv/state', 'live/' + uid].forEach(k => M.docs.delete(k)); notify() },
  };
}

/* ---------- boot ---------- */
const params = new URLSearchParams(location.search);
const mockId = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && params.get('mock');
let be = null;
try { be = mockId ? mockBackend(mockId) : await firebaseBackend() }
catch (e) { showError('ログインまたは読み込みの途中で止まりました。', e) }
if (be) {
  window.__cloud = {
    uid: be.uid, store: makeStore(be, be.profDoc, be.privDoc), people,
    onPeople: f => peopleCbs.push(f),
    live: be.live, ex: be.ex, report: be.report, signOut: be.signOut, deleteAccount: be.deleteAccount,
  };
  let first = true;
  step('参加者を読み込んでいます…');
  const slow = setTimeout(() => { if (first) showError('参加者の一覧を読み込めません（15秒たっても応答がありません）。', 'timeout') }, 15000);
  be.subPeople(map => {
    setPeople(map, be.uid);
    if (!first) return;
    first = false; clearTimeout(slow);
    try { window.__startApp(); gate.hidden = true; gate.innerHTML = '' } catch (e) { showError('画面の準備中にエラーが起きました。', e) }
  }, e => { if (first) { clearTimeout(slow); showError('参加者の一覧を読み込めませんでした。', e) } });
}
