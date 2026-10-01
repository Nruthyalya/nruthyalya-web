/* Nruthyalya: show repo content to everyone, and publish browser changes to GitHub */
(function(){
var REPO='Nruthyalya/nruthyalya-web',BR='main',API='https://api.github.com/repos/'+REPO+'/contents/',TK='nr_gh_token';
function ld(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function sv(k,v){localStorage.setItem(k,JSON.stringify(v))}
function hs(s){var n=5381;for(var i=0;i<s.length;i++)n=((n<<5)+n+s.charCodeAt(i))>>>0;return n}
function im(s){return /^(data:|https?:|images\/)/.test(s)?s:'images/'+s}

/* 1. Merge content/notes.json from the repo into this browser before the page draws */
try{
  var x=new XMLHttpRequest();x.open('GET','content/notes.json?t='+Date.now(),false);x.send();
  if(x.status===200){
    var r=JSON.parse(x.responseText),F=ld('nr_folders',null)||[],N=ld('nr_notes',[]),P=ld('nr_photos',[]);
    (r.folders||[]).forEach(function(f){if(!F.some(function(g){return g.id===f.id}))F.push(f)});
    var fid=function(p){var par=null;p.split('/').forEach(function(nm){nm=nm.trim();if(!nm)return;
      var id='p:'+(par||'')+'/'+nm;if(!F.some(function(f){return f.id===id}))F.push({id:id,name:nm,parent:par});par=id});return par};
    (r.notes||[]).forEach(function(n){
      if(!n.id)n.id=hs(n.title||'');
      if(N.some(function(m){return String(m.id)===String(n.id)}))return;
      if(!F.some(function(f){return f.id===n.folder}))n.folder=fid(String(n.folder||'Notes'));
      n.links=n.links||[];n.images=(n.images||[]).map(im);N.push(n)});
    (r.photos||[]).forEach(function(p){
      if(typeof p==='string')p={src:p,cap:''};p.src=im(p.src);
      if(!P.some(function(q){return q.src===p.src}))P.push(p)});
    if(F.length)sv('nr_folders',F);sv('nr_notes',N);sv('nr_photos',P);
  }
}catch(e){}

/* 2. Publish to GitHub */
function tok(){return localStorage.getItem(TK)||''}
function gh(path,o){o=o||{};o.headers={Authorization:'Bearer '+tok(),Accept:'application/vnd.github+json'};
  return fetch(API+path,o).then(function(r){return r.json().then(function(j){
    if(!r.ok){var e=new Error(j.message||('Error '+r.status));e.status=r.status;throw e}return j})})}
function put(path,b64,msg,sha){var b={message:msg,content:b64,branch:BR};if(sha)b.sha=sha;
  return gh(path,{method:'PUT',body:JSON.stringify(b)})}
var cnt=0;
async function up(s,tick){
  if(!/^data:/.test(s))return s;
  var name='images/'+Date.now()+'-'+(cnt++)+'.jpg';
  await put(name,s.split(',')[1],'Add image');tick();return name}
async function publish(btn){
  var F=ld('nr_folders',[]),N=ld('nr_notes',[]),P=ld('nr_photos',[]),total=0,done=0;
  var count=function(s){if(/^data:/.test(s))total++};
  N.forEach(function(n){(n.images||[]).forEach(count)});P.forEach(function(p){count(p.src)});
  var tick=function(){done++;btn.textContent='Uploading '+done+' of '+total+'...'};
  btn.textContent='Publishing...';
  for(var n of N){var o=[];for(var s of (n.images||[]))o.push(await up(s,tick));n.images=o}
  for(var p of P)p.src=await up(p.src,tick);
  var sha;try{sha=(await gh('content/notes.json?ref='+BR)).sha}catch(e){if(e.status!==404)throw e}
  var json=JSON.stringify({folders:F,notes:N,photos:P},null,1);
  await put('content/notes.json',btoa(unescape(encodeURIComponent(json))),'Update site content',sha);
  sv('nr_folders',F);sv('nr_notes',N);sv('nr_photos',P);
  alert('Published. The live site updates in about a minute. This page will now reload.');
  location.reload();
}
function askToken(){
  var t=prompt('Paste your GitHub token (leave empty to remove the saved one).');
  if(t===null)return false;
  t=t.trim();if(t)localStorage.setItem(TK,t);else localStorage.removeItem(TK);return !!t}

var box=document.createElement('div');
box.style.cssText='position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:15;display:flex;gap:8px;align-items:center';
box.innerHTML='<button class="btn red" type="button" id="pubB">Publish to site</button><button class="btn" type="button" id="pubT" title="Change or remove the GitHub token">Token</button>';
document.body.appendChild(box);
var B=document.getElementById('pubB');
document.getElementById('pubT').addEventListener('click',askToken);
B.addEventListener('click',async function(){
  if(!tok()&&!askToken())return;
  if(!confirm('Publish all notes and photos in this browser to the website?'))return;
  B.disabled=true;
  try{await publish(B)}
  catch(e){
    alert(e.status===401?'GitHub did not accept the token. Use the Token button to paste a new one.':
      (e.status===403||e.status===404)?'The token cannot write to this repository. It needs Contents: Read and write on nruthyalya-web.':
      'Publishing failed: '+e.message)}
  B.disabled=false;B.textContent='Publish to site';
});
})();
