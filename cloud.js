// PetaCar beta: login gate + Firestore-backed storage for the app in index.html.
// The app itself stays a plain script; it starts once window.__cloud is ready (window.__startApp()).
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const gate = document.getElementById('gate');
const LOCAL_KEYS = ['colv2', 'sort2'];                 // per-device view preferences
const PROFILE_SYNC = ['me2', 'log2', 'spot2', 'pins2', 'set2']; // keys that change what others see
const people = (window.__people = window.__people || []);
const peopleCbs = [];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function showGate(html) { gate.hidden = false; gate.innerHTML = `<div class="gbox"><div class="glogo">P</div>${html}</div>`; }
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
  return { id, name: d.name || '名無し', maker: d.maker || 'その他', car: d.car || '—', pref: d.pref || '', ring: d.ring || '#e8551c',
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
  const app = initializeApp(firebaseConfig), auth = A.getAuth(app), db = F.getFirestore(app);
  const provider = new A.GoogleAuthProvider();
  const user = await new Promise(res => {
    const un = A.onAuthStateChanged(auth, u => {
      if (u) { un(); res(u); return }
      showGate(`<h1>ペタカー! ベータ</h1><p>招待された人だけが使えるテスト版です。招待に使ったGoogleアカウントでログインしてください。</p>
        <button class="gbtn" id="glogin">Googleでログイン</button><p class="gerr" id="gerr" hidden></p>`);
      document.getElementById('glogin').onclick = () => A.signInWithPopup(auth, provider).catch(e => {
        const el = document.getElementById('gerr'); el.hidden = false;
        el.textContent = e.code === 'auth/popup-blocked' ? 'ログイン画面が開けませんでした。ブラウザのポップアップを許可してください。' : e.code === 'auth/popup-closed-by-user' ? 'ログインがキャンセルされました。' : 'ログインできませんでした（' + e.code + '）';
      });
    });
  });
  showGate('<p>読み込んでいます…</p>');
  const email = (user.email || '').toLowerCase();
  const allowed = await F.getDoc(F.doc(db, 'allow', email)).then(s => s.exists()).catch(() => false);
  if (!allowed) {
    showGate(`<h1>まだ招待されていません</h1><p><b>${esc(email)}</b> はテストの参加者リストに入っていません。鈴木さんに、このアドレスを伝えてください。</p><button class="gbtn sub" id="gout">別のアカウントでログイン</button>`);
    document.getElementById('gout').onclick = () => A.signOut(auth).then(() => location.reload());
    return null;
  }
  const uid = user.uid, D = (...p) => F.doc(db, ...p), Col = (...p) => F.collection(db, ...p);
  const [profSnap, privSnap] = await Promise.all([F.getDoc(D('users', uid)), F.getDoc(D('users', uid, 'priv', 'state'))]);
  const snapMap = qs => { const m = {}; qs.forEach(d => m[d.id] = d.data()); return m };
  return {
    uid, profDoc: profSnap.exists() ? profSnap.data() : null, privDoc: privSnap.exists() ? privSnap.data() : null,
    setProfile: d => F.setDoc(D('users', uid), d),
    setPriv: d => F.setDoc(D('users', uid, 'priv', 'state'), d),
    subPeople: cb => F.onSnapshot(Col('users'), qs => cb(snapMap(qs)), e => console.warn('people', e)),
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
    signOut: () => A.signOut(auth).then(() => location.reload()),
    deleteAccount: async () => {
      await Promise.all([F.deleteDoc(D('live', uid)).catch(() => { }), F.deleteDoc(D('users', uid, 'priv', 'state')), F.deleteDoc(D('users', uid))]);
      try { await A.deleteUser(auth.currentUser) }
      catch (e) { if (e.code === 'auth/requires-recent-login') { await A.reauthenticateWithPopup(auth.currentUser, provider); await A.deleteUser(auth.currentUser) } else throw e }
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
    subPeople: cb => sub(() => cb(coll('users'))),
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
catch (e) { console.error(e); showGate(`<h1>読み込めませんでした</h1><p>電波のよい場所で、ページを開き直してください。</p><p class="gerr">${esc(e.code || e.message || e)}</p>`) }
if (be) {
  window.__cloud = {
    uid: be.uid, store: makeStore(be, be.profDoc, be.privDoc), people,
    onPeople: f => peopleCbs.push(f),
    live: be.live, ex: be.ex, report: be.report, signOut: be.signOut, deleteAccount: be.deleteAccount,
  };
  let first = true;
  be.subPeople(map => { setPeople(map, be.uid); if (first) { first = false; gate.hidden = true; gate.innerHTML = ''; window.__startApp() } });
}
