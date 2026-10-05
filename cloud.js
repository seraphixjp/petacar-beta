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
const LOGO = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="22" fill="#e8551c"/><text x="44" y="60" text-anchor="middle" font-size="22" textLength="64" lengthAdjust="spacingAndGlyphs" fill="#fff" transform="rotate(-8 50 50)" font-family="Dela Gothic One,Hiragino Sans,sans-serif">ペタカー</text><text x="77" y="60" font-size="22" fill="#121820" transform="rotate(-8 50 50)" font-family="Dela Gothic One,sans-serif">!</text><path d="M18 74h64" stroke="#121820" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 8"/></svg>`;
function showGate(html) { gate.hidden = false; gate.innerHTML = `<div class="gbox"><div class="glogo">${LOGO}</div>${html}</div>`; }
// ストア審査（投稿のあるアプリ）：ログインの前に利用規約への同意を明示する
const AGREE = '<p class="ghelp">ログインすると、<a href="https://seraphixjp.github.io/petacar-beta/terms.html" target="_blank" rel="noopener">利用規約</a>と<a href="https://seraphixjp.github.io/petacar-beta/privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a>に同意したものとします。不快な写真や名前は禁止で、見つけしだい削除します。</p>';
const step = t => showGate(`<p>${esc(t)}</p><div class="gspin"></div>`);
// ロゴを5回続けてタップすると、審査用のメール／パスワードのログイン欄が出る
function bindReviewLogin(A, auth) {
  const logo = gate.querySelector('.glogo'); if (!logo) return;
  let n = 0, t = null;
  logo.onclick = () => {
    n++; clearTimeout(t); t = setTimeout(() => n = 0, 1500);
    if (n < 5 || document.getElementById('rvf')) return;
    const f = document.createElement('form'); f.id = 'rvf'; f.className = 'rvf';
    f.innerHTML = '<p class="ghelp">審査用ログイン</p><input type="email" id="rvm" placeholder="メールアドレス" autocomplete="username" required><input type="password" id="rvp" placeholder="パスワード" autocomplete="current-password" required><button class="gbtn sub" type="submit">ログイン</button><p class="gerr" id="rve" hidden></p>';
    gate.querySelector('.gbox').appendChild(f);
    f.onsubmit = e => {
      e.preventDefault();
      A.signInWithEmailAndPassword(auth, document.getElementById('rvm').value.trim(), document.getElementById('rvp').value).catch(er => {
        const el = document.getElementById('rve'); el.hidden = false; el.textContent = 'ログインできませんでした（' + (er.code || er.message) + '）';
      });
    };
  };
}
function showError(where, e) { console.error(where, e); showGate(`<h1>うまく開けませんでした</h1><p>${esc(where)}</p><p class="gerr">${esc((e && (e.code || e.message)) || e)}</p><p>この画面のスクリーンショットを鈴木さんに送ってください。</p><button class="gbtn" onclick="location.reload()">開き直す</button>`) }
addEventListener('error', e => { if (gate.hidden) { const b = document.createElement('div'); b.className = 'errbar'; b.textContent = 'エラー: ' + (e.message || '') + ' @' + (e.lineno || ''); document.body.appendChild(b) } });
addEventListener('unhandledrejection', e => { if (gate.hidden) { const b = document.createElement('div'); b.className = 'errbar'; b.textContent = 'エラー: ' + ((e.reason && (e.reason.code || e.reason.message)) || e.reason); document.body.appendChild(b) } });
// .now() は書き込み待ちがあるときだけ走る（何も変えていない古い画面が、閉じるときに上書きしないように）
const debounce = (fn, ms) => { let t = null; const f = () => { clearTimeout(t); t = setTimeout(() => { t = null; fn() }, ms) }; f.now = () => { if (t === null) return; clearTimeout(t); t = null; fn() }; f.cancel = () => { clearTimeout(t); t = null }; return f };

/* ---------- 画像：プロフィールから分けて img/{uid_hash} に置き、端末（IndexedDB）に残す ----------
   同じ画像は同じ名前になるので、どの端末でも一度読めば二度と読まない（無料枠に収めるため） */
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const REF_RE = /^im:[A-Za-z0-9_-]{1,128}_[0-9a-f]{16}$/;
const DEMO_RE = /^cars\/[A-Za-z0-9_-]{1,40}\.jpg$/;
// 交換モードのマス目（約5km）を文字にしたもの。前後2マス＝交換の判定と同じ範囲
const ckOf = c => Array.isArray(c) && c.length === 2 ? c[0].toFixed(2) + ',' + c[1].toFixed(2) : 'none';
const cellsNear = c => { const out = []; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) out.push(ckOf([Math.round(c[0] * 20 + i) / 20, Math.round(c[1] * 20 + j) / 20])); return out };
const imgMem = new Map();      // 'im:..' -> data URL
const imgMiss = new Set();     // この起動中に見つからなかった参照（何度も読みに行かない）
const imgWant = new Set();
let imgBe = null, imgT = null, imgsChanged = () => { };
// 端末の保存場所が開けない（プライベートモード等）ときは2秒であきらめて、毎回読む動きにする
const idbOpen = (() => { let p = null; return () => p || (p = new Promise((ok, ng) => { const r = indexedDB.open('petacar', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => { const db = r.result; db.onversionchange = () => db.close(); ok(db) }; r.onerror = () => ng(r.error); r.onblocked = () => ng(new Error('idb blocked')); setTimeout(() => ng(new Error('idb timeout')), 2000) })) })();
async function idbLoadAll() {
  try {
    const db = await idbOpen();
    await new Promise((ok, ng) => { const c = db.transaction('img').objectStore('img').openCursor(); c.onsuccess = () => { const k = c.result; if (!k) return ok(); if (typeof k.value === 'string') imgMem.set(k.key, k.value); k.continue() }; c.onerror = () => ng(c.error); setTimeout(ok, 3000) });
  } catch (e) { console.warn('idb', e) }
}
const idbPut = (k, v) => idbOpen().then(db => db.transaction('img', 'readwrite').objectStore('img').put(v, k)).catch(() => { });
function keepImg(ref, v) { imgMem.set(ref, v); idbPut(ref, v) }
// 画面が描くときに呼ぶ。手元になければ null を返して、まとめて読みに行く（届いたら描き直す）
function imgOf(r) {
  if (!r || typeof r !== 'string') return null;
  if (r.startsWith('data:')) return IMG_RE.test(r) ? r : null;
  if (DEMO_RE.test(r)) return r;
  if (!REF_RE.test(r)) return null;
  const v = imgMem.get(r); if (v) return v;
  if (!imgMiss.has(r)) { imgWant.add(r); if (!imgT) imgT = setTimeout(pullImgs, 40) }
  return null;
}
async function pullImgs() {
  imgT = null; const refs = [...imgWant].filter(r => !imgMem.has(r) && !imgMiss.has(r)); imgWant.clear();
  if (!refs.length || !imgBe) return;
  refs.forEach(r => imgMiss.add(r));   // 読み込み中・失敗は同じ起動の間は再要求しない
  let got = {};
  try { got = await imgBe.getImgs(refs.map(r => r.slice(3))) } catch (e) { console.warn('img', e); refs.forEach(r => imgMiss.delete(r)); return }
  let n = 0;
  for (const [id, d] of Object.entries(got)) { const v = d && typeof d.d === 'string' && IMG_RE.test(d.d) ? d.d : null; if (v) { keepImg('im:' + id, v); imgMiss.delete('im:' + id); n++ } }
  if (n) imgsChanged();
}
// 起動前に必要な画像（自分のスタンプなど）を待って読む
async function needImgs(refs) {
  const miss = [...new Set(refs)].filter(r => typeof r === 'string' && REF_RE.test(r) && !imgMem.has(r));
  if (!miss.length || !imgBe) return;
  const got = await imgBe.getImgs(miss.map(r => r.slice(3))).catch(e => { console.warn('img', e); return {} });
  for (const [id, d] of Object.entries(got)) if (d && typeof d.d === 'string' && IMG_RE.test(d.d)) keepImg('im:' + id, d.d);
}
// 画像の名前（中身から決まる16桁）。crypto.subtle が無い環境では簡易ハッシュ2本で代用
const h32 = (t, seed) => { let h = seed >>> 0; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 } return h.toString(16).padStart(8, '0') };
const sha16 = async t => window.crypto && crypto.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('') : h32(t, 2166136261) + h32(t, 374761393);
// data URL を参照に変える（初めての画像だけ書き込む）。PNGは自動の仮スタンプなので保存しない
async function toRef(v, uid, mine) {
  if (!v || typeof v !== 'string') return null;
  if (REF_RE.test(v) || DEMO_RE.test(v)) return v;
  if (!IMG_RE.test(v) || v.startsWith('data:image/png')) return null;
  const ref = 'im:' + uid + '_' + await sha16(v);
  if (!mine.has(ref)) { await imgBe.putImg(ref.slice(3), v); mine.add(ref); await imgBe.addMine(ref.slice(3)) }
  if (!imgMem.has(ref)) keepImg(ref, v);
  return ref;
}

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

function makeStore(backend, profDoc, privDoc, mine) {
  const priv = { ...(privDoc || {}) };
  let prof = profDoc || null;
  const ME_SKIP = ['sns', 'vers', 'stats', 'showStats', 'showRewards', 'pubEvents', 'upd', 'dev', 'wv'];
  const pickMe = p => { const o = {}; for (const k in p) if (!ME_SKIP.includes(k)) o[k] = p[k]; return o };
  // 交換とスポットの記録はアプリの操作では減らない。減った内容を書こうとしたら不具合なので書かない
  const cnt = p => ({ log2: Array.isArray(p.log2) ? p.log2.length : 0, spot2: Array.isArray(p.spot2) ? p.spot2.length : 0 });
  const base = { ...cnt(priv), real: !!(prof && !prof.def) };
  // 止めるのはおかしかった方だけ（プロフィールの異常で交換の記録まで止めない）
  const blocked = { priv: false, prof: false };
  const guardTrip = (kind, what) => {
    if (!blocked[kind]) console.error('save blocked:', kind, what);
    blocked[kind] = true;
    bar('savebar', kind === 'priv' ? '記録が減る保存を止めました。アプリを開き直してください（データは守られています）' : 'プロフィールの保存を止めました。アプリを開き直してください（スタンプは守られています）');
  };
  const retry = (f, e) => {
    if (e && (e.code === 'invalid-argument' || e.code === 'permission-denied')) { bar('savebar', '保存できませんでした（' + e.code + '）。この画面のスクリーンショットを鈴木さんに送ってください'); return }
    bar('savebar', '保存できませんでした。通信状態を確認してください（自動でやり直します）'); setTimeout(f, 5000) };
  const flushPriv = debounce(() => {
    if (frozen || blocked.priv) return;
    const n = cnt(priv);
    if (n.log2 < base.log2 || n.spot2 < base.spot2) return guardTrip('priv', `log ${base.log2}->${n.log2}, spot ${base.spot2}->${n.spot2}`);
    backend.setPriv({ ...priv, _dev: DEV, _at: Date.now() }).then(() => {
      base.log2 = Math.max(base.log2, n.log2); base.spot2 = Math.max(base.spot2, n.spot2); if (!blocked.prof) bar('savebar', '');
    }, e => { console.warn('priv', e); retry(flushPriv, e) });
  }, 800);
  // プロフィールの画像は参照（im:）にしてから書く。書き込みは1つずつ順番に
  let profQ = Promise.resolve();
  const R = v => toRef(v, backend.uid, mine);
  const flushProf = debounce(() => {
    if (frozen || blocked.prof) return;
    const a = window.__app; if (!a) return;
    if (base.real && a.me.def) return guardTrip('prof', 'profile reset to default');
    const me = { ...a.me }; delete me.sample; delete me.official;
    const s = a.settings;
    const run = async () => {
      if (frozen || blocked.prof) return;
      // 以前の「版」の一覧は、昔の交換の記録を描くためだけに残す（新しい記録はスタンプの控え im を持つ）
      const vers = await Promise.all(((prof && prof.vers) || []).map(async x => x && typeof x === 'object' ? { ring: x.ring, img: await R(x.img) } : x));
      const garage = await Promise.all((Array.isArray(me.garage) ? me.garage : []).map(async c => c && typeof c === 'object' ? { ...c, img: await R(c.img) } : c));
      const bg = me.bg && me.bg.kind === 'photo' ? { ...me.bg, src: await R(me.bg.src) } : me.bg;
      const img = await R(me.img);
      if (frozen || blocked.prof) return;
      prof = { ...me, img, bg: bg && bg.kind === 'photo' && !bg.src ? { kind: 'preset', id: 'night' } : bg, garage, sns: s.showSns ? (s.sns || []).filter(Boolean).slice(0, 2) : [], vers, stats: s.pubStats || s.pubRewards ? { ...a.myStats(), pins: s.pubRewards ? a.myPins() : [] } : { pins: [] }, showStats: !!s.pubStats, showRewards: !!s.pubRewards, pubEvents: !!s.pubEvents, dev: DEV, wv: Math.random().toString(36).slice(2, 10) };
      if (!me.def) base.real = true;
      await backend.setProfile(prof);
      if (!blocked.priv) bar('savebar', '');
    };
    profQ = profQ.then(run).catch(e => { console.warn('profile', e); retry(flushProf, e) });
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

// 他の人のプロフィールは誰でも書けるので、形を確かめてから使う（壊れた1件で全員のアプリが止まらないように）
const okImg = v => typeof v === 'string' && (IMG_RE.test(v) || REF_RE.test(v)) ? v : null;
const okCol = v => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : '#e8551c';
const str = (v, n, d = '') => typeof v === 'string' && v ? v.slice(0, n) : d;
const num = (v, lo, hi, d) => typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const BAD_KEY = k => k === '__proto__' || k === 'constructor' || k === 'prototype';
function cleanBg(b) {
  if (!b || typeof b !== 'object') return undefined;
  if (b.kind === 'photo') { const src = okImg(b.src); return src ? { kind: 'photo', src, y: num(b.y, 0, 100, 50), dim: num(b.dim, 0, 1, .35) } : undefined }
  return { kind: 'preset', id: typeof b.id === 'string' && /^[a-z]{1,12}$/.test(b.id) ? b.id : 'night' };
}
function cleanStats(st) {
  const o = { pins: [] }; if (!st || typeof st !== 'object') return o;
  for (const [k, v] of Object.entries(st)) {
    if (k === 'pins') o.pins = Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.length < 24).slice(0, 12) : [];
    else if (/^[A-Za-z0-9_]{1,16}$/.test(k) && typeof v === 'number' && isFinite(v)) o[k] = v;
  }
  return o;
}
function toPerson(id, d) {
  const sns = Array.isArray(d.sns) ? d.sns.filter(u => typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) && u.length <= 200).slice(0, 2) : [];
  const ring = okCol(d.ring), img = okImg(d.img);
  const maker = str(d.maker, 30, 'その他');
  const vers = (Array.isArray(d.vers) && d.vers.length ? d.vers : [{ img, ring }]).slice(0, 30)
    .map(v => v && typeof v === 'object' ? { ring: okCol(v.ring), img: okImg(v.img) || img } : { ring, img });
  return { id, official: !!OFF[id], sns, msg: str(d.msg, 30), name: str(d.name, 24, '名無し'), maker: BAD_KEY(maker) ? 'その他' : maker, car: str(d.car, 40, '—'), pref: str(d.pref, 4), ring,
    img, bg: cleanBg(d.bg), ver: num(d.ver, 1, 99, 1) | 0, vers,
    stats: cleanStats(d.stats), showStats: d.showStats !== false, showRewards: d.showRewards !== false };
}
// 公式アカウント：運営がコンソールで official/{uid} を作ったときだけ付く。本人のプロフィールの値は信用しない
let OFF = {};
const DAY = 86400000, PEOPLE_TTL = 2 * DAY;   // 交換した人のプロフィールは2日に1回だけ読み直す
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;
let pcache = {}, pkey = '', pmeId = '', pfetch = null;  // id -> { d, at }（d が null は退会済み）
const inflight = new Set();
const pSave = () => { try { localStorage.setItem(pkey, JSON.stringify(Object.fromEntries(Object.entries(pcache).filter(([, x]) => !x.big)))) } catch (e) { } };
const pMap = () => { const m = {}; for (const [id, x] of Object.entries(pcache)) if (x && x.d) m[id] = x.d; return m };
// ids の人を読めるようにする。fresh は交換の直前など、今のスタンプが必要なとき
async function need(ids, fresh) {
  const now = Date.now();
  const list = [...new Set(ids)].filter(id => typeof id === 'string' && UID_RE.test(id) && id !== pmeId && !inflight.has(id) && (fresh || !pcache[id] || now - pcache[id].at > PEOPLE_TTL));
  if (!list.length || !pfetch) return;
  list.forEach(id => inflight.add(id));
  try {
    const got = await pfetch(list);
    for (const id of list) {
      const d = got[id] || null;
      // 古い形（画像入り）の大きなプロフィールは端末に残さない（この起動の間だけ持つ）
      pcache[id] = { d, at: Date.now(), ...(JSON.stringify(d).length >= 60000 ? { big: 1 } : {}) };
    }
    pSave(); setPeople(pMap(), pmeId);
  } catch (e) { console.warn('people', e) }
  finally { list.forEach(id => inflight.delete(id)) }
}
function setPeople(map, me) {
  people.length = 0;
  for (const [id, d] of Object.entries(map)) if (id !== me && d && typeof d === 'object' && !d.def) { try { people.push(toPerson(id, d)) } catch (e) { console.warn('skip profile', id, e) } }
  peopleCbs.forEach(f => { try { f() } catch (e) { console.warn(e) } });
}
imgsChanged = () => peopleCbs.forEach(f => { try { f() } catch (e) { console.warn(e) } });

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
          ${IOS ? '<button class="gbtn apple" id="napple">Appleでサインイン</button>' : ''}<button class="gbtn${IOS ? ' sub' : ''}" id="ngoogle">Googleでログイン</button><p class="gerr" id="gerr" hidden></p>${AGREE}`);
        const go = kind => nativeCred(A, kind).then(c => A.signInWithCredential(auth, c)).catch(e => {
          const el = document.getElementById('gerr'); el.hidden = false;
          el.textContent = /cancel/i.test((e && (e.code || e.message)) || '') ? 'ログインがキャンセルされました。' : 'ログインできませんでした（' + ((e && (e.code || e.message)) || e) + '）';
        });
        document.getElementById('ngoogle').onclick = () => go('google');
        if (IOS) document.getElementById('napple').onclick = () => go('apple');
        bindReviewLogin(A, auth);
        return;
      }
      // LINEなどアプリ内のブラウザではGoogleログインが戻ってこない。LINEは外部ブラウザで開き直せる
      const ua = navigator.userAgent, inApp = /\bLine\/|FBAN|FBAV|Instagram|; wv\)/i.test(ua);
      if (/\bLine\//i.test(ua) && !/openExternalBrowser=1/.test(location.search)) {
        location.replace(location.pathname + (location.search ? location.search + '&' : '?') + 'openExternalBrowser=1'); return }
      showGate(`<h1>ペタカー! ベータ</h1><p>招待された人だけが使えるテスト版です。招待に使ったGoogleアカウントでログインしてください。</p>
        ${inApp ? '<p class="gerr">アプリの中のブラウザではログインできません。下のボタンでURLをコピーして、ChromeやSafariに貼り付けて開いてください。</p>' : ''}
        <button class="gbtn" id="glogin">Googleでログイン</button><p class="gerr" id="gerr" hidden></p>${AGREE}
        <p class="ghelp">ログインのあと白い画面で止まるときは、メールやLINEのリンクから開いている可能性があります。URLをコピーして、Chrome（iPhoneはSafari）で直接開いてください。</p>
        <button class="gbtn sub" id="gcopy">URLをコピー</button>`);
      document.getElementById('gcopy').onclick = e => {
        const url = location.origin + location.pathname;
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => e.target.textContent = 'コピーしました', () => prompt('このURLをコピーしてください', url));
      };
      bindReviewLogin(A, auth);
      document.getElementById('glogin').onclick = () => A.signInWithPopup(auth, provider).catch(e => {
        const el = document.getElementById('gerr'); el.hidden = false;
        el.textContent = e.code === 'auth/popup-blocked' ? 'ログイン画面が開けませんでした。ブラウザのポップアップを許可してください。' : e.code === 'auth/popup-closed-by-user' ? 'ログインがキャンセルされました。' : 'ログインできませんでした（' + e.code + '）';
      });
    });
  });
  step('招待リストを確認しています…');
  const email = (user.email || '').toLowerCase();
  let allowErr = null;
  let demo = false;
  const allowed = await F.getDoc(F.doc(db, 'allow', email)).then(s => { demo = !!(s.exists() && s.data().demo); return s.exists() }).catch(e => { allowErr = e; return false });
  if (allowErr && allowErr.code !== 'permission-denied') throw allowErr;
  if (!allowed) {
    showGate(`<h1>まだ招待されていません</h1><p><b>${esc(email)}</b> はテストの参加者リストに入っていません。鈴木さんに、このアドレスを伝えてください。</p><button class="gbtn sub" id="gout">別のアカウントでログイン</button>`);
    document.getElementById('gout').onclick = () => A.signOut(auth).then(() => location.reload());
    return null;
  }
  const uid = user.uid, D = (...p) => F.doc(db, ...p), Col = (...p) => F.collection(db, ...p);
  step('データを読み込んでいます…');
  const [profSnap, privSnap, mineSnap] = await Promise.all([F.getDoc(D('users', uid)), F.getDoc(D('users', uid, 'priv', 'state')), F.getDoc(D('users', uid, 'priv', 'imgs'))]);
  const snapMap = qs => { const m = {}; qs.forEach(d => m[d.id] = d.data()); return m };
  const byIds = async (col, ids) => { const m = {}; for (let i = 0; i < ids.length; i += 30) { const qs = await F.getDocs(F.query(Col(col), F.where(F.documentId(), 'in', ids.slice(i, i + 30)))); qs.forEach(d => m[d.id] = d.data()) } return m };
  // 近くの人：約5kmのマス目の前後2マス（交換の判定と同じ範囲）だけを見る。位置なしの人も見る
  const liveQs = c => c ? [F.query(Col('live'), F.where('ck', 'in', cellsNear(c))), F.query(Col('live'), F.where('ck', '==', 'none'))] : [F.query(Col('live'), F.where('until', '>', Date.now() - 60000))];
  const hereId = spot => encodeURIComponent(spot).slice(0, 700);
  return {
    uid, demo, profDoc: profSnap.exists() ? profSnap.data() : null, privDoc: privSnap.exists() ? privSnap.data() : null,
    mine: mineSnap.exists() && Array.isArray(mineSnap.data().ids) ? mineSnap.data().ids : [],
    setProfile: d => F.setDoc(D('users', uid), d),
    setPriv: d => F.setDoc(D('users', uid, 'priv', 'state'), d),
    getProfiles: ids => byIds('users', ids),
    subMyProf: cb => F.onSnapshot(D('users', uid), s => cb(s.exists() ? s.data() : null), e => console.warn('myprof', e)),
    getImgs: ids => byIds('img', ids),
    putImg: (id, d) => F.setDoc(D('img', id), { d, by: uid }),
    addMine: id => F.setDoc(D('users', uid, 'priv', 'imgs'), { ids: F.arrayUnion(id) }, { merge: true }),
    live: {
      set: d => F.setDoc(D('live', uid), d),
      clear: () => F.deleteDoc(D('live', uid)).catch(() => { }),
      // 交換モードの間だけ、自分のマス目の近くだけを見る
      watch: (cell, cb) => { const parts = liveQs(cell).map(() => ({})); const uns = liveQs(cell).map((q, i) => F.onSnapshot(q, qs => { parts[i] = snapMap(qs); cb(Object.assign({}, ...parts)) }, e => console.warn('live', e))); return () => uns.forEach(u => u()) },
    },
    ex: {
      create: async peer => { const r = F.doc(Col('ex')); await F.setDoc(r, { a: uid, b: peer, state: 'asked', at: Date.now() }); return r.id },
      update: (id, d) => F.updateDoc(D('ex', id), d),
      sub: cb => {
        let A1 = {}, B1 = {}; const fire = () => { const m = {}; for (const [k, v] of Object.entries({ ...A1, ...B1 })) m[k] = { ...v, id: k }; cb(m) };
        // 申し込みは2分で切れるので、直近30分の分だけを見る（過去の分を毎回読まない）
        const since = Date.now() - 1800000;
        const u1 = F.onSnapshot(F.query(Col('ex'), F.where('a', '==', uid), F.where('at', '>', since)), qs => { A1 = snapMap(qs); fire() }, e => console.warn('exA', e));
        const u2 = F.onSnapshot(F.query(Col('ex'), F.where('b', '==', uid), F.where('at', '>', since)), qs => { B1 = snapMap(qs); fire() }, e => console.warn('exB', e));
        return () => { u1(); u2() };
      },
      subSides: (id, cb) => F.onSnapshot(Col('ex', id, 'side'), qs => cb(snapMap(qs)), e => console.warn('side', e)),
      setSide: (id, d) => F.setDoc(D('ex', id, 'side', uid), d),
    },
    // スポットの「いま◯人」：誰が記録したかは書かない（spot と期限だけ）
    // スポットごとに1枚：期限の数字だけを並べる（誰かは書かない）。今にぎわっているスポットだけを読む
    here: {
      add: spot => F.runTransaction(db, async tx => {
        const r = D('here', hereId(spot)), s = await tx.get(r), now = Date.now();
        const until = Math.ceil((now + 7200000) / 600000) * 600000 + Math.floor(Math.random() * 1000);
        const t = [...(s.exists() && Array.isArray(s.data().t) ? s.data().t : []).filter(x => typeof x === 'number' && x > now), until].slice(-150);
        tx.set(r, { t, last: Math.max(...t) });
      }),
      sub: cb => F.onSnapshot(F.query(Col('here'), F.where('last', '>', Date.now()), F.limit(200)), qs => cb(qs.docs.flatMap(d => { const x = d.data(); let spot = ''; try { spot = decodeURIComponent(d.id) } catch (e) { } return Array.isArray(x.t) ? x.t.map(until => ({ spot, until })) : [] })), e => console.warn('here', e)),
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
      const ms = await F.getDoc(D('users', uid, 'priv', 'imgs')).catch(() => null);
      const imgs = (ms && ms.exists() && Array.isArray(ms.data().ids) ? ms.data().ids : []).map(id => F.deleteDoc(D('img', id)).catch(() => { }));
      // 交換の申し込みの記録（自分が入っているもの）も消す。自分の side も先に消す
      const exs = await Promise.all(['a', 'b'].map(k => F.getDocs(F.query(Col('ex'), F.where(k, '==', uid))).catch(() => null)));
      const exDel = exs.filter(Boolean).flatMap(qs => qs.docs.map(d => F.deleteDoc(D('ex', d.id, 'side', uid)).catch(() => { }).then(() => F.deleteDoc(D('ex', d.id)).catch(() => { }))));
      await Promise.all([F.deleteDoc(D('live', uid)).catch(() => { }), ...baks, ...imgs, ...exDel]);
      await Promise.all([F.deleteDoc(D('users', uid, 'priv', 'imgs')), F.deleteDoc(D('users', uid, 'priv', 'state')), F.deleteDoc(D('users', uid))]);
      try { await A.deleteUser(auth.currentUser) }
      catch (e) { if (e.code === 'auth/requires-recent-login') { if (NATIVE) { const apple = auth.currentUser.providerData.some(p => p.providerId === 'apple.com'); await A.reauthenticateWithCredential(auth.currentUser, await nativeCred(A, apple ? 'apple' : 'google')) } else await A.reauthenticateWithPopup(auth.currentUser, provider); await A.deleteUser(auth.currentUser) } else throw e }
    },
  };
}

/* ---------- local mock backend (two-frame testing on localhost only) ---------- */
function mockBackend(uid) {
  const M = window.parent.__mock;   // { docs: Map, subs: Set }
  const notify = () => setTimeout(() => M.subs.forEach(f => { try { f() } catch (e) { M.subs.delete(f) } }), 20);  // 閉じた画面の購読は捨てる
  const put = (p, d) => { M.docs.set(p, JSON.parse(JSON.stringify(d))); notify(); return Promise.resolve() };
  const coll = (prefix, filter = () => true) => { const m = {}; for (const [k, v] of M.docs) { const rest = k.slice(prefix.length + 1); if (k.startsWith(prefix + '/') && !rest.includes('/') && filter(v)) m[rest] = JSON.parse(JSON.stringify(v)) } return m };
  const sub = (fn) => { const f = () => fn(); M.subs.add(f); setTimeout(f, 10); return () => M.subs.delete(f) };
  let n = 0;
  return {
    uid, demo: !!params.get('demo'), profDoc: M.docs.get('users/' + uid) || null, privDoc: M.docs.get('users/' + uid + '/priv/state') || null,
    mine: ((M.docs.get('users/' + uid + '/priv/imgs') || {}).ids || []).slice(),
    setProfile: d => put('users/' + uid, d), setPriv: d => put('users/' + uid + '/priv/state', d),
    getProfiles: ids => { M.reads = (M.reads || 0) + ids.length; const m = {}; ids.forEach(id => { const d = M.docs.get('users/' + id); if (d) m[id] = JSON.parse(JSON.stringify(d)) }); return Promise.resolve(m) },
    subMyProf: cb => sub(() => cb(JSON.parse(JSON.stringify(M.docs.get('users/' + uid) || null)))),
    getImgs: ids => { M.imgReads = (M.imgReads || 0) + ids.length; const m = {}; ids.forEach(id => { const d = M.docs.get('img/' + id); if (d) m[id] = { ...d } }); return Promise.resolve(m) },
    putImg: (id, d) => { M.imgWrites = (M.imgWrites || 0) + 1; return put('img/' + id, { d, by: uid }) },
    addMine: id => { const k = 'users/' + uid + '/priv/imgs', o = M.docs.get(k) || { ids: [] }; if (!o.ids.includes(id)) o.ids.push(id); return put(k, o) },
    live: {
      set: d => put('live/' + uid, d), clear: () => { M.docs.delete('live/' + uid); notify(); return Promise.resolve() },
      watch: (cell, cb) => sub(() => { const ok = cell ? [...cellsNear(cell), 'none'] : null; cb(coll('live', v => !ok || ok.includes(v.ck))) }),
    },
    ex: {
      create: async peer => { const id = 'x' + Date.now() + (n++); await put('ex/' + id, { a: uid, b: peer, state: 'asked', at: Date.now() }); return id },
      update: (id, d) => put('ex/' + id, { ...M.docs.get('ex/' + id), ...d }),
      sub: cb => sub(() => { const m = coll('ex', v => v.a === uid || v.b === uid); for (const k in m) m[k].id = k; cb(m) }),
      subSides: (id, cb) => sub(() => cb(coll('ex/' + id + '/side'))),
      setSide: (id, d) => put('ex/' + id + '/side/' + uid, d),
    },
    here: {
      add: spot => { const k = 'here/' + encodeURIComponent(spot), o = M.docs.get(k) || { t: [] }, now = Date.now(); const t = [...o.t.filter(x => x > now), now + 7200000 + Math.floor(Math.random() * 1000)]; return put(k, { t, last: Math.max(...t) }) },
      sub: cb => sub(() => { const out = []; for (const [k, v] of M.docs) if (k.startsWith('here/') && v.last > Date.now()) v.t.forEach(until => out.push({ spot: decodeURIComponent(k.slice(5)), until })); cb(out) }),
    },
    official: cb => sub(() => { const m = {}; Object.keys(coll('official')).forEach(k => m[k] = true); cb(m) }),
    config: cb => sub(() => cb(JSON.parse(JSON.stringify(M.docs.get('config/app') || {})))),
    subMine: cb => sub(() => cb(JSON.parse(JSON.stringify(M.docs.get('users/' + uid + '/priv/state') || null)))),
    bakGet: slot => { const a = M.docs.get('users/' + uid + '/priv/b' + slot), b = M.docs.get('users/' + uid + '/priv/bp' + slot); return Promise.resolve(a ? JSON.parse(JSON.stringify({ ...a, prof: b ? b.data : null })) : null) },
    bakPut: (slot, day, privD, profD) => { put('users/' + uid + '/priv/b' + slot, { day, at: Date.now(), data: privD }); if (profD) put('users/' + uid + '/priv/bp' + slot, { day, at: Date.now(), data: profD }); return Promise.resolve() },
    report: d => put('reports/r' + Date.now(), { ...d, by: uid }),
    signOut: () => Promise.resolve(location.reload()),
    deleteAccount: async () => { const mine = (M.docs.get('users/' + uid + '/priv/imgs') || {}).ids || []; for (const k of [...M.docs.keys()]) if (k === 'users/' + uid || k.startsWith('users/' + uid + '/') || k === 'live/' + uid || mine.includes(k.slice(4)) && k.startsWith('img/')) M.docs.delete(k); notify() },
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
  imgBe = be;
  const mine = new Set((be.mine || []).map(id => 'im:' + id));
  const store = makeStore(be, be.profDoc, be.privDoc, mine);
  // 交換モード中だけ近くの人を見る（それ以外の時間は読み取りゼロ）
  let liveCb = () => { }, liveUn = null, liveCell = undefined;
  const live = {
    set: async d => { d = { ...d, ck: ckOf(d.cell) }; await be.live.set(d); const c = d.cell || null; if (!liveUn || JSON.stringify(c) !== JSON.stringify(liveCell)) { if (liveUn) liveUn(); liveCell = c; liveUn = be.live.watch(c, m => { need(Object.keys(m)); liveCb(m) }) } },
    clear: () => { if (liveUn) { liveUn(); liveUn = null } liveCell = undefined; liveCb({}); return be.live.clear() },
    sub: cb => { liveCb = cb },
  };
  window.__cloud = {
    uid: be.uid, demo: !!be.demo, store, people,
    onPeople: f => peopleCbs.push(f), isOfficial: id => !!OFF[id],
    img: imgOf, need,
    live, ex: { ...be.ex, sub: cb => be.ex.sub(m => { need(Object.values(m).flatMap(x => [x.a, x.b])); cb(m) }) }, here: be.here, report: be.report, signOut: be.signOut,
    deleteAccount: async () => { store.cancelAll(); const was = frozen; frozen = 'deleting'; try { await be.deleteAccount() } catch (e) { frozen = was; throw e } },
  };
  let started = false, gotPeople = false, gotCfg = false, cfg = {}, maintShown = false;
  step('参加者を読み込んでいます…');
  // 手元に残しておいた人と画像ですぐ開き、交換した相手だけを（古いものだけ）読み直す
  pkey = 'ppl3:' + be.uid; pmeId = be.uid; pfetch = be.getProfiles;
  try { pcache = JSON.parse(localStorage.getItem(pkey) || '{}') || {} } catch (e) { pcache = {} }
  for (const k of Object.keys(pcache)) if (!UID_RE.test(k) || !pcache[k] || typeof pcache[k] !== 'object') delete pcache[k];
  const pf = be.profDoc || {};
  const myRefs = [pf.img, pf.bg && pf.bg.src, ...(Array.isArray(pf.garage) ? pf.garage.map(c => c && c.img) : [])];
  const logIds = (Array.isArray((be.privDoc || {}).log2) ? be.privDoc.log2 : []).map(l => l && l.pid);
  (async () => {
    await idbLoadAll();
    await needImgs(myRefs);
    const firstTime = !Object.keys(pcache).length;
    const p = need(logIds);
    if (firstTime) await Promise.race([p, new Promise(r => setTimeout(r, 6000))]);
    setPeople(pMap(), be.uid);
    gotPeople = true; start();
  })().catch(e => { clearTimeout(slow); showError('参加者の一覧を読み込めませんでした。', e) });
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
      if (maintShown) return;
      if (started) store.flushAll();   // 押した直後の記録は先に保存してから止める
      store.cancelAll(); frozen = frozen || 'maint'; maintShown = true; clearTimeout(slow);
      showGate(`<h1>ただいまメンテナンス中です</h1><p>${esc(cfg.msg || 'アプリの更新作業をしています。終わると自動で開き直します。')}</p><p>これまでの記録はそのまま残っています。</p><div class="gspin"></div>`);
      return;
    }
    if (maintShown) { location.reload(); return }
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

  be.official(m => { OFF = m; setPeople(pMap(), be.uid) });
  be.subMyProf(d => { if (d && d.dev !== DEV && !(d.dev === f0.dev && d.wv === f0.wv && d.upd === f0.upd)) stale() });
}
