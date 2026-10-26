/* Approved raster art, shared across four class materials. No new libraries. */
(function(global){
 'use strict';
 let serial=0;
 const geometry=/*GEOMETRY_START*/{"frame_base_charm":{"cx":49.939,"cy":50.609,"rx":31.137,"ry":30.493,"textRx":33.137,"textRy":32.493},"frame_base_expl":{"cx":49.921,"cy":49.494,"rx":28.209,"ry":27.513,"textRx":30.209,"textRy":29.513},"frame_base_faith":{"cx":49.816,"cy":50.731,"rx":31.135,"ry":30.101,"textRx":33.135,"textRy":32.101},"frame_base_luck":{"cx":49.871,"cy":50.118,"rx":31.461,"ry":30.381,"textRx":33.461,"textRy":32.381},"frame_base_run":{"cx":49.855,"cy":50.633,"rx":32.166,"ry":30.376,"textRx":34.166,"textRy":32.376},"frame_base_trip":{"cx":49.897,"cy":50.706,"rx":31.348,"ry":30.17,"textRx":33.348,"textRy":32.17},"frame_t3_charm":{"cx":49.927,"cy":50.643,"rx":31.753,"ry":31.055,"textRx":33.753,"textRy":33.055},"frame_t3_expl":{"cx":49.895,"cy":49.486,"rx":28.928,"ry":28.17,"textRx":30.928,"textRy":30.17},"frame_t3_faith":{"cx":49.816,"cy":50.701,"rx":31.712,"ry":30.661,"textRx":33.712,"textRy":32.661},"frame_t3_luck":{"cx":49.858,"cy":50.091,"rx":32.069,"ry":30.924,"textRx":34.069,"textRy":32.924},"frame_t3_run":{"cx":49.852,"cy":50.649,"rx":32.846,"ry":31.035,"textRx":34.846,"textRy":33.035},"frame_t3_trip":{"cx":49.885,"cy":50.736,"rx":31.919,"ry":30.717,"textRx":33.919,"textRy":32.717},"season_halloween":{"cx":49.845,"cy":50.291,"rx":30.467,"ry":29.735,"textRx":32.467,"textRy":31.735},"season_ny":{"cx":49.82,"cy":50.07,"rx":28.467,"ry":27.994,"textRx":30.467,"textRy":29.994},"season_sakura":{"cx":49.877,"cy":51.055,"rx":29.369,"ry":29.109,"textRx":31.369,"textRy":31.109},"season_summer":{"cx":49.884,"cy":49.878,"rx":31.553,"ry":30.697,"textRx":33.553,"textRy":32.697},"season_xmas":{"cx":49.914,"cy":48.41,"rx":33.238,"ry":32.066,"textRx":35.238,"textRy":34.066}}/*GEOMETRY_END*/;
 const names={run:'STREET RACER',trip:'TRAVELER',faith:'PILGRIM',expl:'EXPLORER',charm:'SOCIALITE',luck:'GAMBLER'};
 const seasons={ny:['HAPPY NEW YEAR','#fff0b3'],sakura:['SAKURA DRIVE','#642a3b'],summer:['SUMMER DRIVE','#062a4b'],halloween:['HALLOWEEN','#472139'],xmas:['MERRY CHRISTMAS','#fff2ba']};
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const image=(src,attrs='')=>`<image href="${escape(src)}" x="0" y="0" width="100" height="100" ${attrs}/>`;
 function materialFrame(f,ring='#e8551c',options={}){
  if(!/^t[1-4]:(run|trip|faith|expl|charm|luck)$/.test(f))return '';
  const tier=+f[1],key=f.slice(3),id='pfa'+(++serial),asset=(tier<3?'frame_base_':'frame_t3_')+key,src=(options.base||'frames/')+asset+'.webp';
  const g=geometry[asset]||{cx:50,cy:50,rx:32,ry:32,textRx:34,textRy:34};
  const colour=/^#[0-9a-f]{6}$/i.test(ring)?ring:'#e8551c';
  const rgb=[1,3,5].map(i=>parseInt(colour.slice(i,i+2),16)/255);
  const tint=rgb.map((c,i)=>`<feFunc${'RGB'[i]} type="table" tableValues="${(c*.18).toFixed(3)} ${(c*.6).toFixed(3)} ${c.toFixed(3)} ${(c+(1-c)*.78).toFixed(3)}"/>`).join('');
  const filter=tier===1?`<feColorMatrix type="saturate" values="0"/><feComponentTransfer>${tint}</feComponentTransfer>`:'<feColorMatrix type="saturate" values="0"/>';
  // Crown-free tiers have complete purpose-made artwork, without splicing sectors.
  let body=tier<3?image(src,`filter="url(#${id}material)"`):image(src);
  if(tier===4){body=`<g style="isolation:isolate">${image(src,'filter="url(#'+id+'material)"')}<g mask="url(#${id}alpha)" style="mix-blend-mode:color"><g class="frholo"><rect x="-25" y="-25" width="150" height="150" fill="url(#${id}holo)" opacity=".82"/></g></g></g><g clip-path="url(#${id}crown)">${image(src)}</g>`;}
  const label=(tier===4?'LEGEND ':tier===3?'ACE ':'')+names[key];
  const text=options.label===false?'':`<text font-family="Arial,Helvetica,sans-serif" font-size="4.1" font-weight="800" fill="${tier===1?'#fff':tier===4?'#241d42':'#422b0e'}" text-anchor="middle" textLength="${Math.min(label.length*2.05,48)}" lengthAdjust="spacingAndGlyphs"><textPath href="#${id}arc" startOffset="50%">${label}</textPath></text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-hole-x="${g.cx}" data-hole-y="${g.cy}" data-hole-r="${Math.max(g.rx,g.ry)+.7}" aria-hidden="true"><defs><clipPath id="${id}crown"><rect x="37" width="26" height="14.5"/></clipPath><filter id="${id}material" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">${filter}</filter><mask id="${id}alpha" style="mask-type:alpha">${image(src)}</mask><linearGradient id="${id}holo" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff65c9"/><stop offset=".2" stop-color="#b497ff"/><stop offset=".4" stop-color="#78ddff"/><stop offset=".6" stop-color="#82efb7"/><stop offset=".8" stop-color="#fff19a"/><stop offset="1" stop-color="#ff9478"/></linearGradient><path id="${id}arc" d="M${g.cx-g.textRx} ${g.cy}a${g.textRx} ${g.textRy} 0 0 1 ${2*g.textRx} 0"/></defs>${body}${text}</svg>`;
 }
 function seasonFrame(key,year,options={}){
  if(!seasons[key])return '';
  const id='pfs'+(++serial),asset='season_'+key,src=(options.base||'frames/')+asset+'.webp',[title,colour]=seasons[key],g=geometry[asset]||{cx:50,cy:50,rx:32,ry:32,textRx:34,textRy:34};
  const label=title+(year?' '+year:'');
  // The New Year image has a broad inner gold bevel. Place its lettering
  // farther into the red enamel and keep the ends away from the petal valleys.
  const layout=key==='ny'?{...g,textRx:g.rx+6,textRy:g.ry+6}:g;
  const textWidth=key==='ny'?Math.min(label.length*1.8,35):Math.min(label.length*2.05,48);
  const text=options.label===false?'':`<text font-family="Arial,Helvetica,sans-serif" font-size="${key==='ny'?3.9:4.1}" font-weight="800" fill="${colour}" text-anchor="middle" textLength="${textWidth}" lengthAdjust="spacingAndGlyphs"><textPath href="#${id}arc" startOffset="50%">${escape(label)}</textPath></text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-hole-x="${g.cx}" data-hole-y="${g.cy}" data-hole-r="${Math.max(g.rx,g.ry)+.7}" aria-hidden="true"><defs><path id="${id}arc" d="M${g.cx-layout.textRx} ${g.cy}a${layout.textRx} ${layout.textRy} 0 0 1 ${2*layout.textRx} 0"/></defs>${image(src)}${text}</svg>`;
 }
 async function inlineImages(svg){
  const copy=svg.cloneNode(true),cache=new Map();
  await Promise.all([...copy.querySelectorAll('image')].map(async node=>{
   const url=node.getAttribute('href');if(!url||url.startsWith('data:'))return;
   if(!cache.has(url))cache.set(url,fetch(url).then(r=>{if(!r.ok)throw Error('Frame image '+r.status);return r.blob()}).then(blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)})));
   node.setAttribute('href',await cache.get(url));
  }));return copy;
 }
 function trophy(b,size=46,icons={},tierNames={}){
  const legend=b.tier==='lg',id='pft'+(++serial),src='frames/trophy_platinum.webp',ink=legend?'#fff0b0':'#263e58';
  const img=image(src);
  const body=legend?`${img}<g mask="url(#${id}alpha)" style="mix-blend-mode:color"><rect width="100" height="100" fill="url(#${id}holo)" opacity=".76"/></g>`:img;
  const icon=icons[b.ic]?`<g transform="translate(39 24) scale(.92)" fill="none" stroke="${ink}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${icons[b.ic]}</g>`:'';
  const num=b.num?`<text x="50" y="85.2" font-family="sans-serif" font-weight="800" font-size="5.8" text-anchor="middle" fill="#17263b">${escape(b.num)}</text>`:'';
  const motion=`<style>
   .peta-trophy .peta-glint{transform-box:fill-box;transform-origin:center;animation:peta-trophy-glint 3.8s ease-in-out infinite}
   .peta-trophy-lg .peta-glint{animation-duration:2.8s}
   .peta-trophy .peta-sheen{animation:peta-trophy-sheen 5.6s ease-in-out infinite}
   .peta-trophy-lg .peta-sheen{animation-duration:4.5s}
   @keyframes peta-trophy-glint{0%,100%{opacity:.32;transform:scale(.65) rotate(-12deg)}18%{opacity:1;transform:scale(1.15) rotate(0)}38%,72%{opacity:.08;transform:scale(.35) rotate(16deg)}}
   @keyframes peta-trophy-sheen{0%,25%{transform:translateX(-120px);opacity:0}35%{opacity:.5}65%{transform:translateX(120px);opacity:0}100%{transform:translateX(120px);opacity:0}}
   @media(prefers-reduced-motion:reduce){.peta-trophy .peta-glint{animation:none;opacity:.55;transform:none}.peta-trophy .peta-sheen{animation:none;opacity:0}}
  </style>`;
  const points=legend?[[28,12,5.5,'#fff',-.2],[86,27,4.8,'#dcfcff',-1.2],[66,86,4,'#fff3bc',-2.1],[12,31,3.5,'#f9d8ff',-.8],[48,58,3,'#fff',-1.7]]:[[28,12,4.8,'#fff',-.1],[86,27,4,'#e6f4ff',-1.5],[66,86,3.5,'#fff',-2.6]];
  const glints=points.map(([x,y,r,c,delay])=>`<g transform="translate(${x} ${y})"><g class="peta-glint" style="animation-delay:${delay}s"><path d="M0 ${-r}Q.7 -.7 ${r} 0Q.7 .7 0 ${r}Q-.7 .7 ${-r} 0Q-.7 -.7 0 ${-r}Z" fill="${c}"/><circle r="${r*.15}" fill="#fff"/></g></g>`).join('');
  const sheen=`<g mask="url(#${id}alpha)"><g class="peta-sheen"><rect x="42" y="-40" width="16" height="180" transform="rotate(-18 50 50)" fill="url(#${id}shine)"/></g></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="peta-trophy peta-trophy-${b.tier}" width="${Math.round(size*1.15)}" height="${Math.round(size*1.15)}" role="img" aria-label="${escape(b.t||'')}（${escape(tierNames[b.tier]?.n||'')}）">${motion}<defs><mask id="${id}alpha" style="mask-type:alpha">${img}</mask><linearGradient id="${id}shine"><stop stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="${id}holo" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff7ed4"/><stop offset=".23" stop-color="#9c8bff"/><stop offset=".48" stop-color="#6edbff"/><stop offset=".7" stop-color="#87f3c0"/><stop offset=".86" stop-color="#ffe889"/><stop offset="1" stop-color="#ff96ba"/></linearGradient></defs><g style="isolation:isolate">${body}</g>${sheen}${icon}${num}${glints}</svg>`;
 }
 function holeOf(svg){const get=k=>{const m=String(svg).match(new RegExp('data-hole-'+k+'="([^"]+)"'));return m?+m[1]:null};const cx=get('x'),cy=get('y'),r=get('r');return cx!==null&&cy!==null&&r!==null?{cx,cy,r}:null}
 function photoStyle(svg){const h=holeOf(svg);return h?`inset:auto;left:${h.cx-h.r}%;top:${h.cy-h.r}%;width:${h.r*2}%;height:${h.r*2}%`:''}
 function medal(b,size=46,icons={},tierNames={}){
  const file={br:'badge_silver',si:'badge_silver',go:'badge_gold'}[b.tier];if(!file)return '';
  const src='frames/'+file+'.webp',id='pfm'+(++serial),ink={br:'#512812',si:'#283a4d',go:'#60400b'}[b.tier],num=String(b.num||''),width=Math.min(54,Math.max(20,num.length*6+12));
  const bronze=b.tier==='br'?`<defs><filter id="${id}bronze" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="table" tableValues=".20 .47 .78 .98"/><feFuncG type="table" tableValues=".09 .25 .51 .83"/><feFuncB type="table" tableValues=".035 .12 .28 .62"/></feComponentTransfer></filter></defs>`:'';
  const icon=icons[b.ic]?`<g transform="${num?'translate(35 24) scale(1.25)':'translate(32 32) scale(1.5)'}" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[b.ic]}</g>`:'';
  const tag=num?`<rect x="${50-width/2}" y="63" width="${width}" height="12" rx="6" fill="${ink}"/><text x="50" y="72" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8.5" font-weight="800" fill="#fff9e9">${escape(num)}</text>`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" class="md md-${b.tier}" role="img" aria-label="${escape(b.t||'')}（${escape(tierNames[b.tier]?.n||'')}）">${bronze}${image(src,b.tier==='br'?`filter="url(#${id}bronze)"`:'')}${icon}${tag}</svg>`;
 }
 global.PetaFrames={materialFrame,seasonFrame,inlineImages,trophy,medal,holeOf,photoStyle};
})(window);
