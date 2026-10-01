/* Nruthyalya — Publish notes and photos to GitHub
 *
 * No localStorage. All data lives in content/notes.json and images/.
 * The page's in-memory `notes` and `photos` arrays (owned by index.html)
 * are the only runtime store. Publish commits them straight to GitHub.
 */
(function(){
var REPO='Nruthyalya/nruthyalya-web', BR='main';
var API='https://api.github.com/repos/'+REPO+'/contents/';
var TK_KEY='nr_gh_token'; // one allowed localStorage key: the auth token only

function tok(){return localStorage.getItem(TK_KEY)||''}

function gh(path,opts){
  opts=opts||{};
  opts.headers=Object.assign({Authorization:'Bearer '+tok(),Accept:'application/vnd.github+json'},opts.headers||{});
  return fetch(API+path,opts).then(function(r){
    return r.json().then(function(j){
      if(!r.ok){var e=new Error(j.message||('HTTP '+r.status));e.status=r.status;throw e}
      return j})})
}

function getSha(path){
  return gh(path+'?ref='+BR).then(function(j){return j.sha}).catch(function(e){if(e.status===404)return null;throw e})
}

function putFile(path,base64,msg,sha){
  var body={message:msg,content:base64,branch:BR};
  if(sha)body.sha=sha;
  return gh(path,{method:'PUT',body:JSON.stringify(body)})
}

/* Upload a data: URI as an image file; return the images/filename path */
var _imgCounter=0;
function uploadImage(dataUrl){
  var name='images/'+Date.now()+'-'+(++_imgCounter)+'.jpg';
  var base64=dataUrl.split(',')[1];
  return putFile(name,base64,'Add image').then(function(){return name})
}

/* Replace every data: URI in an array with an uploaded path */
async function uploadImages(arr,onProgress){
  var result=[];
  for(var i=0;i<arr.length;i++){
    var s=arr[i];
    if(/^data:/.test(s)){s=await uploadImage(s);if(onProgress)onProgress()}
    result.push(s);
  }
  return result;
}

/* Main publish routine — called with the live notes/photos arrays from the page */
async function publish(btn,notes,photos){
  // Count data: URIs to upload
  var total=0;
  notes.forEach(function(n){(n.images||[]).forEach(function(s){if(/^data:/.test(s))total++})});
  photos.forEach(function(p){if(/^data:/.test(p.src))total++});
  var done=0;
  function tick(){done++;btn.textContent='Uploading '+(done)+' of '+total+' image'+(total===1?'':'s')+'…'}

  btn.textContent='Publishing…';

  // Upload all inline images
  var processedNotes=[];
  for(var i=0;i<notes.length;i++){
    var n=Object.assign({},notes[i]);
    n.images=await uploadImages(n.images||[],tick);
    // Strip internal-only flags
    delete n._new;
    processedNotes.push(n);
  }

  var processedPhotos=[];
  for(var i=0;i<photos.length;i++){
    var p=Object.assign({},photos[i]);
    if(/^data:/.test(p.src)){p.src=await uploadImage(p.src);if(total)tick()}
    delete p._new;
    processedPhotos.push(p);
  }

  // Build notes.json
  var json=JSON.stringify({notes:processedNotes,gallery:processedPhotos},null,2);
  var sha=await getSha('content/notes.json');
  var b64=btoa(unescape(encodeURIComponent(json)));
  await putFile('content/notes.json',b64,'Update notes and gallery',sha);

  // Update the page's live arrays so they reflect the committed state
  // (replace data: URIs with the now-committed image paths)
  for(var i=0;i<notes.length;i++)notes[i].images=processedNotes[i].images;
  for(var i=0;i<photos.length;i++){photos[i].src=processedPhotos[i].src;delete photos[i]._new}

  alert('Published! The live site updates in about a minute. The page will now reload.');
  location.reload();
}

/* ── UI ── */
var box=document.createElement('div');
box.style.cssText='position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:15;display:flex;gap:8px;align-items:center';
box.innerHTML='<button class="btn red" type="button" id="pubB">Publish to site</button>'
  +'<button class="btn" type="button" id="pubT" title="Set or remove your GitHub token">Token</button>';
document.body.appendChild(box);

document.getElementById('pubT').addEventListener('click',function(){
  var t=prompt('Paste your GitHub personal access token (leave empty to remove the saved one).');
  if(t===null)return;
  t=t.trim();
  if(t)localStorage.setItem(TK_KEY,t);
  else localStorage.removeItem(TK_KEY);
});

var B=document.getElementById('pubB');
B.addEventListener('click',async function(){
  if(!tok()){
    var t=prompt('Paste your GitHub personal access token to publish.');
    if(!t||!t.trim())return;
    localStorage.setItem(TK_KEY,t.trim());
  }
  if(!confirm('Publish all notes and photos to the website?'))return;

  // Access the page's live data via window globals exposed by index.html
  var notes=window._nrNotes||[];
  var photos=window._nrPhotos||[];
  if(!notes.length&&!photos.length){alert('Nothing to publish yet.');return}

  B.disabled=true;
  try{
    await publish(B,notes,photos);
  }catch(e){
    var msg=e.status===401
      ?'GitHub did not accept the token. Use the Token button to update it.'
      :(e.status===403||e.status===404)
      ?'The token cannot write to this repository. It needs Contents: Read and write on nruthyalya-web.'
      :'Publishing failed: '+e.message;
    alert(msg);
  }
  B.disabled=false;
  B.textContent='Publish to site';
});

})();
