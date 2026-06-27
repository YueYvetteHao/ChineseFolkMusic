/* examples/build.js — regenerate standalone example pages from melody.txt.
 * Run:  node examples/build.js
 * For every corpus entry that has a real (non-TODO) jianpu, writes examples/<id>.html:
 * a self-contained page with the melody embedded that opens by DOUBLE-CLICK (no server),
 * loading ../engine.js + ../styles.css and calling JP.mountAnalyzer.
 * The canonical live pages remain melody.html?id=<id> (served on a server / GitHub Pages). */
var fs=require('fs'), path=require('path');
var root=path.join(__dirname,'..');

// load the engine to reuse parseMelodyDB (stub the few globals it references)
global.window={};
global.document={createElement:function(){return {};}, querySelectorAll:function(){return [];}, documentElement:{}};
eval(fs.readFileSync(path.join(root,'engine.js'),'utf8'));
var JP=global.window.JP;

var REG={ '陕北':['sx','Northern Shaanxi 陕北'], '陕西':['sx2','Shaanxi · modern 陕西'],
          '山东':['sd','Shandong 山东'], '江南':['jn','Jiangnan 江南'] };
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function tpl(m){
  var reg=REG[m.region]||['sx', m.region||''];
  var meta=esc(m.notes||'');   // one-sentence description only (Source/Key/Meter dropped)
  var data=JSON.stringify(m);   // embed the full entry (incl. jianpu2 … for multi-theme pieces)
  return '<!DOCTYPE html>\n'+
'<html lang="en">\n<head>\n<meta charset="UTF-8">\n'+
'<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'+
'<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎵</text></svg>">\n'+
'<title>'+esc(m.title)+' — example · Folk Melody Texture</title>\n'+
'<link rel="stylesheet" href="../styles.css">\n</head>\n<body>\n'+
'<header class="site-head">\n'+
'  <h1>'+esc(m.title)+(m.en?' <span class="en-title">'+esc(m.en)+'</span>':'')+' <span class="tag '+reg[0]+'" style="font-size:13px;vertical-align:middle">'+esc(reg[1])+'</span></h1>\n'+
'  <nav class="site-nav">\n'+
'    <a href="../index.html">← Samples</a>\n'+
'    <a href="../statistics.html">Stats</a>\n'+
'    <a href="../scale-wheels.html">Scales</a>\n'+
'    <a href="../interval-analyzer.html">Analyzer</a>\n'+
'  </nav>\n</header>\n'+
'<p class="sub">'+meta+' &nbsp;·&nbsp; <em>Standalone example — melody embedded; opens by double-click, no server.</em></p>\n'+
'<main class="wrap" id="app"></main>\n'+
'<footer class="foot">© 2026 <a href="https://github.com/YueYvetteHao" target="_blank" rel="noopener">Yue Hao</a>. All Rights Reserved.</footer>\n'+
'<script src="../engine.js"></script>\n'+
'<script>\n'+
'var M = '+data+';\n'+
'var app=document.getElementById("app");\n'+
'if(M.about||M.image){var ab=document.createElement("div");ab.className="card about-card";var hd=document.createElement("h2");hd.textContent="About this piece";ab.appendChild(hd);if(M.image){var im=document.createElement("img");im.className="about-img";im.src="../"+M.image;im.alt=M.title||"";ab.appendChild(im);}if(M.about){var tx=document.createElement("div");tx.className="about-text";tx.innerHTML=M.about;ab.appendChild(tx);}if(M.video){var vl=document.createElement("p");vl.className="about-video";var va=document.createElement("a");va.href=M.video;va.target="_blank";va.rel="noopener";va.textContent="▶ "+(M.video_title||"Listen on YouTube");vl.appendChild(va);vl.appendChild(document.createTextNode(" (YouTube)"));ab.appendChild(vl);}app.appendChild(ab);}\n'+
'var ks=["jianpu","jianpu2","jianpu3","jianpu4"], themes=[];\n'+
'ks.forEach(function(k,i){var v=M[k]; if(v&&String(v).trim()&&String(v).trim().toUpperCase()!=="TODO"){var s=(i===0?"":String(i+1));themes.push({label:"Theme "+(i+1),jianpu:v,key:M["key"+s]||M.key,meter:M["meter"+s]||M.meter,bpm:M["bpm"+s]||M.bpm});}});\n'+
'if(themes.length>1){themes.forEach(function(t){var h=document.createElement("h2");h.className="theme-h";h.textContent=t.label;app.appendChild(h);var b=document.createElement("div");app.appendChild(b);JP.mountAnalyzer(b,{key:t.key,meter:t.meter,bpm:t.bpm,jianpu:t.jianpu});});}\n'+
'else {var b0=document.createElement("div");app.appendChild(b0);JP.mountAnalyzer(b0, M);}\n'+
'</script>\n'+
'</body>\n</html>\n';
}

var db=JP.parseMelodyDB(fs.readFileSync(path.join(root,'melody.txt'),'utf8'));
var made=[];
db.filter(function(m){return m.hasJianpu;}).forEach(function(m){
  fs.writeFileSync(path.join(__dirname, m.id+'.html'), tpl(m));
  made.push(m.id);
});

// Also write ../melodies.js — the data mirror index.html / melody.html fall back to when
// fetch() is blocked (i.e. when the site is opened by double-click, file://).
fs.writeFileSync(path.join(root,'melodies.js'),
  '/* AUTO-GENERATED from melody.txt by examples/build.js — do not edit by hand.\n'+
  '   Lets index.html / melody.html work on double-click; on a server they read melody.txt live. */\n'+
  'window.MELODIES = [\n'+db.map(function(m){return JSON.stringify(m);}).join(',\n')+'\n];\n');

console.log('Generated '+made.length+' example page(s): '+(made.join(', ')||'(none yet)'));
console.log('Wrote melodies.js ('+db.length+' entries) for file:// fallback.');
