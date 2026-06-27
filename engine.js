/* ============================================================================
 * engine.js — Jianpu parse → semitone intervals → stats → contour/staff/score/
 *             histogram/audio.  Verified core extracted from interval-analyzer.html.
 * Classic script (no ES modules) so it runs on file:// AND GitHub Pages.
 * Renderers take a container element + options (not fixed DOM ids), so the same
 * engine drives the per-melody page and the side-by-side comparison landing.
 * Exposes a single global:  window.JP
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ---- color palette (self-contained; no CSS-var dependency) ---- */
  var COLORS = {
    rep:'#9aa5b1', step:'#2e9e8f', third:'#3b78c3', leap:'#e8743b', big:'#c0392b',
    ink:'#23262b', muted:'#6b7280'
  };

  /* ---- music model ---- */
  var SCALE = {1:0,2:2,3:4,4:5,5:7,6:9,7:11};                  // major scale, semitones from do
  var REV   = {0:'1',2:'2',4:'3',5:'4',7:'5',9:'6',11:'7'};
  var NAMES = {0:['Unison','U'],1:['minor 2nd','m2'],2:['Major 2nd','M2'],3:['minor 3rd','m3'],
               4:['Major 3rd','M3'],5:['Perfect 4th','P4'],6:['Tritone','TT'],7:['Perfect 5th','P5'],
               8:['minor 6th','m6'],9:['Major 6th','M6'],10:['minor 7th','m7'],11:['Major 7th','M7'],12:['Octave','P8']};

  function intervalName(abs){
    if(abs<=12) return NAMES[abs];
    var oct=Math.floor(abs/12), rem=abs%12;
    return [NAMES[rem][0]+' + '+oct+' oct', NAMES[rem][1]+'+'+oct+'8ve'];
  }
  function leapColor(abs){
    if(abs===0) return COLORS.rep;
    if(abs<=2)  return COLORS.step;
    if(abs<=4)  return COLORS.third;
    if(abs<=7)  return COLORS.leap;
    return COLORS.big;
  }
  function octMarks(o){ return o>0 ? "'".repeat(o) : o<0 ? ",".repeat(-o) : ""; }
  function noteLabel(n){
    if(n.rest) return '0';
    var a = n.acc>0 ? '#'.repeat(n.acc) : n.acc<0 ? 'b'.repeat(-n.acc) : '';
    return a + n.pitch + octMarks(n.octave);
  }

  /* ---- key / meter strings ("1=D", "4/4") -> numbers ---- */
  var KEYMAP = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  function keyToOffset(k){
    if(typeof k==='number') return k;
    if(k==null) return 0;
    var m=String(k).toUpperCase().match(/([A-G])\s*$/);
    var base = m ? (KEYMAP[m[1]]||0) : 0;
    if(/B(?![A-G])/i.test(String(k)) && /[A-G]B/i.test(String(k))) {} // (no flat keys in the samples)
    return base;
  }
  function meterToBeats(m){
    if(typeof m==='number') return m;
    if(m==null) return 4;
    var mm=String(m).match(/(\d+)/);
    return mm ? +mm[1] : 4;
  }

  /* ---- parser: jianpu text -> note objects ---- */
  function parseJianpu(text){
    var notes=[], cur=null, acc=0;
    var s=String(text||'');
    for(var k=0;k<s.length;k++){
      var ch=s[k];
      if(ch==='#'||ch==='♯'){ acc+=1; }
      else if(ch==='b'||ch==='♭'){ acc-=1; }
      else if(/[0-7]/.test(ch)){
        if(cur) notes.push(cur);
        cur = (ch==='0') ? {rest:true, octave:0, acc:0, under:0, dots:0, dashes:0}
                         : {pitch:+ch, octave:0, acc:acc, under:0, dots:0, dashes:0};
        acc=0;
      }
      else if(ch==="'"){ if(cur&&!cur.rest) cur.octave++; }
      else if(ch===","){ if(cur&&!cur.rest) cur.octave--; }
      else if(ch==="_"){ if(cur) cur.under++; }
      else if(ch==="."){ if(cur) cur.dots++; }
      else if(ch==="-"){ if(cur) cur.dashes++; }
      else if(ch==="|"){ if(cur) cur.barAfter=true; }
    }
    if(cur) notes.push(cur);
    notes.forEach(function(n,i){
      n.idx=i;
      if(!n.rest) n.semitone = SCALE[n.pitch] + 12*n.octave + (n.acc||0);
      var base   = Math.pow(0.5, n.under||0);
      var dotMul = (n.dots>0) ? (2 - Math.pow(0.5, n.dots)) : 1;
      n.beats = base*dotMul + (n.dashes||0);
    });
    return notes;
  }

  function computeIntervals(notes){
    var out=[], prev=null;
    notes.forEach(function(n){
      if(n.rest){ prev=null; return; }
      if(prev){
        var semi = n.semitone - prev.semitone;
        out.push({fromIdx:prev.idx, toIdx:n.idx, from:prev, to:n,
                  semitones:semi, abs:Math.abs(semi), dir:Math.sign(semi),
                  name:intervalName(Math.abs(semi))});
      }
      prev=n;
    });
    return out;
  }

  function computeStats(iv){
    if(!iv.length) return null;
    var a=iv.map(function(i){return i.abs;});
    var sum=a.reduce(function(x,y){return x+y;},0);
    var repeat = iv.filter(function(i){return i.abs===0;}).length;
    var steps  = iv.filter(function(i){return i.abs>=1 && i.abs<=2;}).length;
    var thirds = iv.filter(function(i){return i.abs>=3 && i.abs<=4;}).length;
    var leaps  = iv.filter(function(i){return i.abs>=5 && i.abs<=7;}).length;
    var wide   = iv.filter(function(i){return i.abs>=8;}).length;
    // oscillating leaps: adjacent ≥P4 leaps that REVERSE direction (the Shaanxi orange/red zigzag)
    var osc=0;
    for(var k=0;k<iv.length-1;k++){ if(iv[k].abs>=5 && iv[k+1].abs>=5 && iv[k].dir!==iv[k+1].dir) osc++; }
    return {n:iv.length, mean:sum/iv.length, max:Math.max.apply(null,a),
            repeat:repeat, steps:steps, thirds:thirds, leaps:leaps, wide:wide, osc:osc,
            leapPct:(leaps+wide)/iv.length*100, smallPct:(steps+thirds)/iv.length*100};
  }

  function computeBarlines(notes, meter){
    var onset=0, onsetOf={}, endOf={};
    notes.forEach(function(n){ onsetOf[n.idx]=onset; onset+=n.beats; endOf[n.idx]=onset; });
    var total=onset;
    var explicit=notes.filter(function(n){return n.barAfter;}).map(function(n){return n.idx;});
    var after={}, has=function(i){return after[i]===true;}, measureXs=[];
    after.has=has;
    if(explicit.length){
      explicit.forEach(function(i){ after[i]=true; });
      measureXs = explicit.map(function(i){return endOf[i];}).filter(function(x){return x>1e-6 && x<total-1e-6;});
    } else {
      notes.forEach(function(n){
        var e=endOf[n.idx];
        if(n.idx<notes.length-1 && Math.abs(e/meter - Math.round(e/meter))<1e-6 && e>1e-6) after[n.idx]=true;
      });
      for(var b=meter; b<total-1e-6; b+=meter) measureXs.push(b);
    }
    return {after:after, measureXs:measureXs, onsetOf:onsetOf, endOf:endOf, total:total};
  }

  /* ---- melody DB (melody.txt) -> array of entry objects ---- */
  function slug(s){
    var t=String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    return t || ('m'+Math.random().toString(36).slice(2,7));
  }
  function parseMelodyDB(text){
    var blocks=String(text||'').split(/^\s*---\s*$/m), out=[];
    blocks.forEach(function(blk){
      var obj={};
      blk.split(/\r?\n/).forEach(function(line){
        var t=line.trim();
        if(!t || t.charAt(0)==='#') return;
        var ci=line.indexOf(':');
        if(ci<0) return;
        var key=line.slice(0,ci).trim(), val=line.slice(ci+1).trim();
        if(key) obj[key]=val;
      });
      if(obj.title||obj.id){
        if(!obj.id) obj.id=slug(obj.title);
        obj.hasJianpu = !!(obj.jianpu && obj.jianpu.trim() && obj.jianpu.trim().toUpperCase()!=='TODO');
        out.push(obj);
      }
    });
    return out;
  }
  function loadDB(url){
    return fetch(url||'./melody.txt').then(function(r){
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.text();
    }).then(parseMelodyDB);
  }
  // Prefer the live melody.txt (fresh, used on a server / GitHub Pages); if fetch is blocked
  // (opening the file by double-click, file://), fall back to the window.MELODIES mirror (melodies.js).
  function getMelodies(url){
    return loadDB(url).catch(function(){
      if (global.MELODIES) return global.MELODIES;
      throw new Error('fetch blocked (file://) and no melodies.js fallback — run `node examples/build.js`, or use a local server');
    });
  }

  /* ---- analyze a DB entry ---- */
  function analyzeMelody(melody){
    var has = !!(melody.jianpu && melody.jianpu.trim() && melody.jianpu.trim().toUpperCase()!=='TODO');
    if(!has) return {pending:true, melody:melody};
    var notes=parseJianpu(melody.jianpu);
    var iv=computeIntervals(notes);
    var meter=meterToBeats(melody.meter||'4/4');
    var keyOffset=keyToOffset(melody.key||'1=C');
    return {pending:false, melody:melody, notes:notes, intervals:iv,
            stats:computeStats(iv), bars:computeBarlines(notes,meter),
            meter:meter, keyOffset:keyOffset};
  }

  /* ============================ RENDERERS ================================= */
  function renderScore(el, notes, bars){
    el.classList.add('jp-score'); el.innerHTML='';
    notes.forEach(function(n){
      var g=document.createElement('span'); g.className='ng'; g.setAttribute('data-i',n.idx);
      var html='';
      if(!n.rest && n.acc) html+='<span class="acc">'+(n.acc>0?'#'.repeat(n.acc):'b'.repeat(-n.acc))+'</span>';
      var cls = n.rest?'' : n.octave===1?'hi':n.octave>=2?'hi2':n.octave===-1?'lo':n.octave<=-2?'lo2':'';
      var uls = (n.under>0) ? '<span class="uls">'+'<i></i>'.repeat(n.under)+'</span>' : '';
      html+='<span class="num '+cls+'">'+(n.rest?'0':n.pitch)+uls+'</span>';
      for(var i=0;i<(n.dots||0);i++) html+='<span class="dotr">·</span>';
      g.innerHTML=html;
      for(var j=0;j<(n.dashes||0);j++){var d=document.createElement('span'); d.className='dash'; d.textContent='–'; g.appendChild(d);}
      el.appendChild(g);
      if(bars && bars.after.has(n.idx)){ var bl=document.createElement('span'); bl.className='barline'; el.appendChild(bl); }
    });
  }

  /* staff helpers */
  var LETTERS=['C','D','E','F','G','A','B'];
  var LETTER_PC={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  var TONIC={0:{l:'C',i:0},2:{l:'D',i:1},4:{l:'E',i:2},5:{l:'F',i:3},7:{l:'G',i:4},9:{l:'A',i:5},11:{l:'B',i:6}};
  var KEYSIG={0:[],7:[['F',1]],2:[['F',1],['C',1]],9:[['F',1],['C',1],['G',1]],
              4:[['F',1],['C',1],['G',1],['D',1]],11:[['F',1],['C',1],['G',1],['D',1],['A',1]],5:[['B',-1]]};
  var SIG_STEP={F:38,C:35,G:39,D:36,A:33,E:37,B:34};
  function noteStaff(n, keyOffset){
    var t=TONIC[keyOffset]||TONIC[0];
    var raw=t.i+(n.pitch-1);
    var letterIdx=((raw%7)+7)%7, letter=LETTERS[letterIdx];
    var absFromC4=keyOffset+n.semitone, naturalPC=LETTER_PC[letter];
    var octave=4+Math.round((absFromC4-naturalPC)/12);
    var acc=absFromC4-(naturalPC+12*(octave-4));
    return {letter:letter, octave:octave, acc:acc, step:octave*7+letterIdx};
  }
  function renderStaff(el, notes, bars, keyOffset, meter){
    el.classList.add('jp-staff');
    if(!notes.length){ el.innerHTML=''; return; }
    var W=1000, gap=12, top=46, STEM=gap*2.7, BEAMW=2.5, BEAMGAP=4.4;
    var Y=function(step){ return top+(38-step)*(gap/2); };
    var lineSteps=[38,36,34,32,30], yTop=Y(38), yBot=Y(30);
    var ledger=function(cx,y){ return '<line x1="'+(cx-9).toFixed(1)+'" y1="'+y.toFixed(1)+'" x2="'+(cx+9).toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="#3a3f46" stroke-width="1"/>'; };
    var sigList=KEYSIG[keyOffset]||[];
    var clefW=54, sigW=sigList.length*11+(sigList.length?8:0), tsW=24;
    var x0=18+clefW+sigW+tsW+8;
    var onset=0, on={}; notes.forEach(function(n){ on[n.idx]=onset; onset+=n.beats; }); var total=onset||1;
    // semi-proportional horizontal layout: each note gets a minimum slot (longer notes a little more),
    // then scaled to fill the width — avoids the overlap that strict time-proportional spacing caused.
    var BASE=15, SCALE=15, slot={}, slotsum=0;
    notes.forEach(function(n){ var w=BASE+SCALE*Math.sqrt(Math.min(n.beats,4)); slot[n.idx]=w; slotsum+=w; });
    var avail=W-x0-30, fit=slotsum>0?Math.min(1.7, avail/slotsum):1, px={}, run=x0;
    notes.forEach(function(n){ var w=slot[n.idx]*fit; px[n.idx]=run+w/2; run+=w; });
    var rightX=run;
    // per-note geometry + overall extent
    var I={}, minStep=30, maxStep=38;
    notes.forEach(function(n){ if(n.rest) return; var ns=noteStaff(n,keyOffset); I[n.idx]={ns:ns, x:px[n.idx], y:Y(ns.step), step:ns.step}; minStep=Math.min(minStep,ns.step); maxStep=Math.max(maxStep,ns.step); });
    var vbTop=Math.min(yTop,Y(maxStep))-STEM-14, vbBot=Math.max(yBot,Y(minStep))+STEM+14, H=vbBot-vbTop;
    var g='';
    lineSteps.forEach(function(s){ var y=Y(s).toFixed(1); g+='<line x1="14" y1="'+y+'" x2="'+(W-14)+'" y2="'+y+'" stroke="#3a3f46" stroke-width="1"/>'; });
    g+='<text x="18" y="'+(Y(30)).toFixed(1)+'" font-size="'+(gap*4.6).toFixed(0)+'" fill="#23262b" font-family="Bravura,\'Noto Music\',serif">𝄞</text>';
    var sx=18+clefW;
    sigList.forEach(function(p){ g+='<text x="'+sx+'" y="'+(Y(SIG_STEP[p[0]])+6).toFixed(1)+'" font-size="21" fill="#23262b">'+(p[1]>0?'♯':'♭')+'</text>'; sx+=11; });
    var tsx=18+clefW+sigW+11;
    g+='<text x="'+tsx+'" y="'+(Y(36)+5).toFixed(1)+'" font-size="18" font-weight="700" text-anchor="middle" fill="#23262b">'+meter+'</text>';
    g+='<text x="'+tsx+'" y="'+(Y(32)+5).toFixed(1)+'" font-size="18" font-weight="700" text-anchor="middle" fill="#23262b">4</text>';
    var sig={}; sigList.forEach(function(p){ sig[p[0]]=p[1]; });

    // ---- beam groups: runs of consecutive eighth/shorter notes within one beat ----
    var groups=[], cur=null, inBeam={};
    notes.forEach(function(n){
      if(!n.rest && (n.under||0)>=1){
        var beat=Math.floor(on[n.idx]+1e-6);
        if(cur && cur.beat===beat) cur.list.push(n); else { cur={beat:beat, list:[n]}; groups.push(cur); }
      } else cur=null;
    });
    var beamGroups=groups.filter(function(grp){ return grp.list.length>=2; });
    beamGroups.forEach(function(grp){
      grp.up = (grp.list.reduce(function(a,n){return a+I[n.idx].step;},0)/grp.list.length) < 34;
      grp.list.forEach(function(n){ inBeam[n.idx]=true; });
    });

    // ---- noteheads / ledgers / accidentals / dots; stems+flags only when NOT beamed ----
    notes.forEach(function(n){
      var cx=px[n.idx];
      if(n.rest){ g+='<text x="'+cx.toFixed(1)+'" y="'+(Y(34)+7).toFixed(1)+'" font-size="22" text-anchor="middle" fill="#6b7280">𝄽</text>'; return; }
      var ns=I[n.idx].ns, y=I[n.idx].y;
      g+='<g class="st" data-i="'+n.idx+'">';
      for(var s1=40;s1<=ns.step;s1+=2) g+=ledger(cx,Y(s1));
      for(var s2=28;s2>=ns.step;s2-=2) g+=ledger(cx,Y(s2));
      var open=n.beats>=2;
      g+='<ellipse cx="'+cx.toFixed(1)+'" cy="'+y.toFixed(1)+'" rx="5.6" ry="4.3" transform="rotate(-18 '+cx.toFixed(1)+' '+y.toFixed(1)+')" fill="'+(open?'#fff':'#23262b')+'" stroke="#23262b" stroke-width="1.6"/>';
      if(!inBeam[n.idx] && n.beats<4){
        var up=ns.step<34, sX=cx+(up?5.0:-5.0), sY=y+(up?-STEM:STEM);
        g+='<line x1="'+sX.toFixed(1)+'" y1="'+y.toFixed(1)+'" x2="'+sX.toFixed(1)+'" y2="'+sY.toFixed(1)+'" stroke="#23262b" stroke-width="1.6"/>';
        for(var f=0; f<(n.under||0); f++){
          var bY=sY+(up?f*6:-f*6), eY=bY+(up?13:-13);
          g+='<path d="M'+sX.toFixed(1)+' '+bY.toFixed(1)+' Q '+(sX+11).toFixed(1)+' '+((bY+eY)/2).toFixed(1)+' '+(sX+7).toFixed(1)+' '+eY.toFixed(1)+'" fill="none" stroke="#23262b" stroke-width="2"/>';
        }
      }
      // augmentation dot(s): right of the notehead; lifted into the space when the note sits on a line
      for(var d=0; d<(n.dots||0); d++)
        g+='<circle cx="'+(cx+9+d*4).toFixed(1)+'" cy="'+(y-((((ns.step%2)+2)%2===0)?gap/2:0)).toFixed(1)+'" r="2.1" fill="#23262b"/>';
      var expected=sig[ns.letter]||0;
      if(ns.acc!==expected){
        var gl=ns.acc>=1?'♯':ns.acc<=-1?'♭':'♮';
        g+='<text x="'+(cx-13).toFixed(1)+'" y="'+(y+5).toFixed(1)+'" font-size="18" text-anchor="middle" fill="#23262b">'+gl+'</text>';
      }
      g+='</g>';
    });

    // ---- beams: shared stems + horizontal beam bars (drawn over the noteheads) ----
    function beamBar(x1,x2,yy){ return '<line x1="'+x1.toFixed(1)+'" y1="'+yy.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+yy.toFixed(1)+'" stroke="#23262b" stroke-width="'+BEAMW+'"/>'; }
    beamGroups.forEach(function(grp){
      var up=grp.up, list=grp.list;
      var stemX=function(n){ return I[n.idx].x + (up?5.0:-5.0); };
      var beamY = up ? Math.min.apply(null, list.map(function(n){return I[n.idx].y;})) - STEM
                     : Math.max.apply(null, list.map(function(n){return I[n.idx].y;})) + STEM;
      list.forEach(function(n){ var X1=stemX(n); g+='<line x1="'+X1.toFixed(1)+'" y1="'+I[n.idx].y.toFixed(1)+'" x2="'+X1.toFixed(1)+'" y2="'+beamY.toFixed(1)+'" stroke="#23262b" stroke-width="1.6"/>'; });
      g+=beamBar(stemX(list[0]), stemX(list[list.length-1]), beamY);   // primary beam
      for(var lvl=2; lvl<=3; lvl++){                                    // secondary (16th) / tertiary (32nd)
        var by=beamY + (up?1:-1)*(lvl-1)*BEAMGAP, i=0;
        while(i<list.length){
          if((list[i].under||0)>=lvl){
            var j=i; while(j+1<list.length && (list[j+1].under||0)>=lvl) j++;
            if(i===j){ var stub=(i>0?-7:7); g+=beamBar(stemX(list[i]), stemX(list[i])+stub, by); }
            else g+=beamBar(stemX(list[i]), stemX(list[j]), by);
            i=j+1;
          } else i++;
        }
      }
    });

    // ---- barlines: sit in the gap before each downbeat, clear of the noteheads ----
    (bars.measureXs||[]).forEach(function(b){
      if(b>=total-1e-6) return;   // the final barline (below) already closes the end
      var pId=null,nId=null,pO=-1,nO=1e9;
      notes.forEach(function(n){ var o=on[n.idx]; if(o<b-1e-6&&o>pO){pO=o;pId=n.idx;} if(o>=b-1e-6&&o<nO){nO=o;nId=n.idx;} });
      var bx;
      if(pId!=null&&nId!=null) bx=(px[pId]+px[nId])/2;
      else if(nId!=null) bx=px[nId]-12;
      else if(pId!=null) bx=px[pId]+14;
      else return;
      g+='<line x1="'+bx.toFixed(1)+'" y1="'+yTop.toFixed(1)+'" x2="'+bx.toFixed(1)+'" y2="'+yBot.toFixed(1)+'" stroke="#a9a89d" stroke-width="1"/>';
    });
    var fx=Math.min(W-14, rightX+2).toFixed(1);
    g+='<line x1="'+fx+'" y1="'+yTop.toFixed(1)+'" x2="'+fx+'" y2="'+yBot.toFixed(1)+'" stroke="#23262b" stroke-width="2.4"/>';
    el.innerHTML='<svg viewBox="0 '+vbTop.toFixed(1)+' '+W+' '+H.toFixed(1)+'" xmlns="http://www.w3.org/2000/svg">'+g+'</svg>';
  }

  function renderStats(el, st, opts){
    opts=opts||{};
    if(!st){ el.innerHTML='<div class="stat"><div class="v">—</div><div class="k">no intervals</div></div>'; return; }
    var cards=[
      [st.n,'intervals'],
      [st.mean.toFixed(2),'mean leap (semitones)'],
      [st.max,'max leap (semitones)'],
      [st.leapPct.toFixed(0)+'%','leaps &ge; 4th'],
      [st.osc,'oscillating leaps (reversing &ge;4th)'],
      [st.smallPct.toFixed(0)+'%','steps &amp; thirds (2nd/3rd)']
    ];
    if(opts.repeats!==false) cards.push([st.repeat,'repeats (unison)']);
    var html='<div class="stats">'+cards.map(function(c){ return '<div class="stat"><div class="v">'+c[0]+'</div><div class="k">'+c[1]+'</div></div>'; }).join('')+'</div>';
    if(opts.verdict){
      var tone;
      if(st.osc>=2 && st.leapPct>=20)
        tone='Wide leaps that chain and <b>reverse direction</b> — the orange/red zigzag — i.e. the <b>oscillating-leap signature of Northern Shaanxi (陕北)</b>: bold, far-carrying, heroic.';
      else if(st.leapPct>=30)
        tone='Plenty of wide leaps, but mostly <b>isolated</b> (not answered by an opposite leap) — leap-heavy without the 陕北 saw-tooth.';
      else if(st.smallPct>=55 && st.osc===0)
        tone='Mostly 3rds and small steps with little or no leap-chaining — the smooth, gentle texture of <b>Jiangnan (江南)</b>.';
      else
        tone='Between the poles — some leaps, but limited chaining.';
      html+='<div class="verdict"><b>Reading:</b> '+tone+' &nbsp;(leaps &ge; 4th = '+st.leapPct.toFixed(0)+'%, oscillating = '+st.osc+', steps+thirds = '+st.smallPct.toFixed(0)+'%, max = '+st.max+' st)</div>';
    }
    el.innerHTML=html;
  }

  function renderContour(el, notes, iv, measureXs){
    el.classList.add('jp-contour');
    var W=1000, H=420, m={t:34,r:34,b:46,l:78};
    var pitched=notes.filter(function(n){return !n.rest;});
    if(!pitched.length){ el.innerHTML='<svg viewBox="0 0 '+W+' 80"></svg>'; return; }
    var onset=0, on={}, end={};
    notes.forEach(function(n){ on[n.idx]=onset; onset+=n.beats; end[n.idx]=onset; });
    var totalBeats=onset;
    var semis=pitched.map(function(n){return n.semitone;});
    var lo=Math.min.apply(null,semis), hi=Math.max.apply(null,semis);
    lo=Math.floor(lo)-1; hi=Math.ceil(hi)+1;
    var X=function(b){ return m.l+(b/totalBeats)*(W-m.l-m.r); };
    var Y=function(s){ return m.t+(1-(s-lo)/(hi-lo))*(H-m.t-m.b); };
    var g='';
    for(var s=lo;s<=hi;s++){
      var within=((s%12)+12)%12, isScale=REV.hasOwnProperty(within), y=Y(s).toFixed(1);
      g+='<line x1="'+m.l+'" y1="'+y+'" x2="'+(W-m.r)+'" y2="'+y+'" stroke="'+(isScale?'#e9e6dd':'#f4f2ec')+'" stroke-width="1"/>';
      if(isScale){ var oct=Math.floor(s/12), lab=REV[within]+octMarks(oct);
        g+='<text x="'+(m.l-10)+'" y="'+(+y+4)+'" text-anchor="end" font-size="13" fill="#9aa">'+lab+'</text>'; }
    }
    (measureXs||[]).forEach(function(b){ var x=X(b).toFixed(1);
      g+='<line x1="'+x+'" y1="'+m.t+'" x2="'+x+'" y2="'+(H-m.b)+'" stroke="#d9d5ca" stroke-width="1" stroke-dasharray="3 3"/>'; });
    g+='<line x1="'+m.l+'" y1="'+(H-m.b)+'" x2="'+(W-m.r)+'" y2="'+(H-m.b)+'" stroke="#d8d5cc"/>';
    notes.forEach(function(n){
      if(n.rest) return;
      var x1=X(on[n.idx]), x2=X(end[n.idx]), y=Y(n.semitone);
      g+='<g class="cn" data-i="'+n.idx+'">';
      g+='<line x1="'+x1.toFixed(1)+'" y1="'+y.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="#3a3f46" stroke-width="3" stroke-linecap="round"/>';
      g+='<circle cx="'+x1.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="4.5" fill="#3a3f46"/>';
      g+='<text x="'+x1.toFixed(1)+'" y="'+(y-12).toFixed(1)+'" text-anchor="middle" font-size="13" font-weight="600" fill="#23262b">'+noteLabel(n)+'</text>';
      g+='</g>';
    });
    iv.forEach(function(it){
      var x=X(on[it.toIdx]), y1=Y(it.from.semitone), y2=Y(it.to.semitone), col=leapColor(it.abs);
      g+='<line x1="'+x.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+x.toFixed(1)+'" y2="'+y2.toFixed(1)+'" stroke="'+col+'" stroke-width="'+(it.abs===0?2:2.5+Math.min(it.abs,8)*0.6)+'" opacity="0.9"/>';
      if(it.abs>0){ var my=(y1+y2)/2;
        g+='<rect x="'+(x+5)+'" y="'+(my-9)+'" width="'+(String(it.semitones).length*8+22)+'" height="18" rx="9" fill="'+col+'"/>';
        g+='<text x="'+(x+16)+'" y="'+(my+4)+'" font-size="12" font-weight="700" fill="#fff">'+(it.semitones>0?'+':'')+it.semitones+'</text>'; }
    });
    g+='<text x="'+m.l+'" y="'+(H-12)+'" font-size="12" fill="#9aa">← time (beats) →    number = semitone distance</text>';
    el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg">'+g+'</svg>';
  }

  // legend of interval abbreviations (built from NAMES) — shown by the ⓘ toggle next to the histogram title
  function intervalKeyHTML(){
    var s='<p class="ik-intro">Each bar is the pitch gap between two consecutive notes, measured in semitones (st):</p><ul class="ik-list">';
    for(var k=0;k<=12;k++) s+='<li><b>'+NAMES[k][1]+'</b> '+NAMES[k][0]+' <span class="ik-st">'+k+' st</span></li>';
    return s+'</ul>';
  }
  function renderHistogram(el, iv){
    var W=1000, H=340, m={t:24,r:24,b:64,l:54};
    var maxShown=Math.max(7, iv.reduce(function(mx,i){return Math.max(mx,i.abs);},0));
    var counts=new Array(maxShown+1).fill(0);
    iv.forEach(function(i){ counts[i.abs]++; });
    var maxCount=Math.max.apply(null,[1].concat(counts));
    var n=counts.length, bw=(W-m.l-m.r)/n;
    var X=function(i){ return m.l+i*bw; };
    var Y=function(c){ return m.t+(1-c/maxCount)*(H-m.t-m.b); };
    var g='';
    for(var c=0;c<=maxCount;c++){ var y=Y(c).toFixed(1);
      g+='<line x1="'+m.l+'" y1="'+y+'" x2="'+(W-m.r)+'" y2="'+y+'" stroke="#eee" stroke-width="1"/>';
      g+='<text x="'+(m.l-8)+'" y="'+(+y+4)+'" text-anchor="end" font-size="11" fill="#9aa">'+c+'</text>'; }
    for(var sv=0;sv<n;sv++){
      var cnt=counts[sv], x=X(sv)+bw*0.16, w=bw*0.68, col=leapColor(sv);
      if(cnt>0){ var yy=Y(cnt), h=(H-m.b)-yy;
        g+='<rect x="'+x.toFixed(1)+'" y="'+yy.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="4" fill="'+col+'"/>';
        g+='<text x="'+(x+w/2).toFixed(1)+'" y="'+(yy-6).toFixed(1)+'" text-anchor="middle" font-size="13" font-weight="700" fill="'+col+'">'+cnt+'</text>';
      } else { g+='<rect x="'+x.toFixed(1)+'" y="'+(H-m.b-3)+'" width="'+w.toFixed(1)+'" height="3" rx="1.5" fill="#e6e3db"/>'; }
      var nm=intervalName(sv);
      g+='<text x="'+(x+w/2).toFixed(1)+'" y="'+(H-m.b+18)+'" text-anchor="middle" font-size="12" font-weight="600" fill="#3a3f46">'+sv+'</text>';
      g+='<text x="'+(x+w/2).toFixed(1)+'" y="'+(H-m.b+34)+'" text-anchor="middle" font-size="11" fill="#9aa">'+nm[1]+'</text>';
    }
    g+='<text x="'+(W/2)+'" y="'+(H-6)+'" text-anchor="middle" font-size="12" fill="#9aa">semitone distance  ·  bar height = count</text>';
    var zx=X(5), zw=bw*3;
    g='<rect x="'+zx.toFixed(1)+'" y="'+m.t+'" width="'+zw.toFixed(1)+'" height="'+(H-m.t-m.b)+'" fill="'+COLORS.leap+'" opacity="0.06"/>'+g;
    g+='<text x="'+(zx+zw/2).toFixed(1)+'" y="'+(m.t+14)+'" text-anchor="middle" font-size="11" fill="'+COLORS.leap+'" font-weight="600">4th–5th leap zone</text>';
    el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg">'+g+'</svg>';
  }

  function renderTable(el, iv){
    if(!iv.length){ el.innerHTML='<p style="color:'+COLORS.muted+'">No intervals.</p>'; return; }
    var rows=iv.map(function(i,k){
      var col=leapColor(i.abs), arrow=i.dir>0?'↑':i.dir<0?'↓':'→';
      return '<tr><td>'+(k+1)+'</td><td class="mono">'+noteLabel(i.from)+' '+arrow+' '+noteLabel(i.to)+
             '</td><td class="mono">'+(i.semitones>0?'+':'')+i.semitones+'</td>'+
             '<td><span class="pill" style="background:'+col+'">'+i.name[1]+'</span> '+i.name[0]+'</td></tr>';
    }).join('');
    el.innerHTML='<details><summary>show / hide ('+iv.length+' intervals)</summary>'+
      '<table><thead><tr><th>#</th><th>from → to</th><th>semitones</th><th>interval</th></tr></thead><tbody>'+
      rows+'</tbody></table></details>';
  }

  /* ============================ AUDIO ==================================== */
  var actx=null, activePlayer=null;   // only one player sounds at a time (across the whole page)
  function createPlayer(container, notes, opts){
    opts=opts||{}; var playing=false, timer=null;
    function clearHi(){
      container.querySelectorAll('[data-i].active').forEach(function(e){ e.classList.remove('active'); });
      container.querySelectorAll('.jp-contour circle').forEach(function(c){ c.setAttribute('r','4.5'); });
    }
    function setHi(idx){
      container.querySelectorAll('[data-i="'+idx+'"]').forEach(function(e){ e.classList.add('active'); });
      // grow only the contour's playhead dot — NOT the staff's augmentation dots (also <circle>)
      container.querySelectorAll('.jp-contour [data-i="'+idx+'"] circle').forEach(function(c){ c.setAttribute('r','7'); });
    }
    function tone(f,ms){
      var o=actx.createOscillator(), gn=actx.createGain();
      o.type='sine'; o.frequency.value=f;
      var t=actx.currentTime, d=ms/1000;
      gn.gain.setValueAtTime(0,t); gn.gain.linearRampToValueAtTime(0.7,t+0.03);
      gn.gain.setValueAtTime(0.7,t+Math.max(0.04,d-0.06)); gn.gain.linearRampToValueAtTime(0,t+d);
      o.connect(gn); gn.connect(actx.destination); o.start(); o.stop(t+d);
    }
    async function play(){
      if(playing) return;
      if(activePlayer && activePlayer!==api) activePlayer.stop();   // stop whatever else is playing
      activePlayer=api; playing=true;
      if(!actx) actx=new (global.AudioContext||global.webkitAudioContext)();
      // iOS: resume() must finish inside the tap before notes are scheduled, and a 1-sample silent
      // buffer is played to fully unlock the audio output (otherwise iPhone stays silent off-mute).
      if(actx.state==='suspended'){ try{ await actx.resume(); }catch(e){} }
      try{ var _ub=actx.createBuffer(1,1,22050), _us=actx.createBufferSource(); _us.buffer=_ub; _us.connect(actx.destination); _us.start(0); }catch(e){}
      if(!playing) return;   // stop() may have fired during the await
      var bpm=opts.bpm||100, key=(opts.keyOffset||0), beat=60/bpm*1000, i=0;
      (function step(){
        if(!playing || i>=notes.length){ playing=false; clearHi(); if(activePlayer===api) activePlayer=null; if(opts.onEnd) opts.onEnd(); return; }
        var n=notes[i], dur=n.beats*beat;
        clearHi(); setHi(n.idx);
        if(!n.rest) tone(261.63*Math.pow(2,(n.semitone+key)/12), dur);
        i++; timer=setTimeout(step, dur);
      })();
    }
    function stop(){ playing=false; if(timer) clearTimeout(timer); clearHi(); if(activePlayer===api) activePlayer=null; }
    var api={play:play, stop:stop};
    return api;
  }

  /* ===================== HIGH-LEVEL MOUNTS =============================== */
  // Compact, read-only panel: stats (+verdict) + contour + histogram. For comparison view.
  function mountMini(root, melody, opts){
    opts=opts||{};
    var a=analyzeMelody(melody);
    if(a.pending){
      root.innerHTML='<div class="pending">'+(melody.title||'?')+' — transcription pending<br><span>'+(melody.source||'')+'</span></div>';
      return null;
    }
    root.innerHTML='<div class="mini-stats"></div><div class="mini-contour"></div><div class="mini-hist"></div>';
    renderStats(root.querySelector('.mini-stats'), a.stats, {verdict:opts.verdict!==false, repeats:false});
    renderContour(root.querySelector('.mini-contour'), a.notes, a.intervals, a.bars.measureXs);
    renderHistogram(root.querySelector('.mini-hist'), a.intervals);
    return a;
  }

  // Full interactive analyzer (per-melody page). Builds controls + all panels.
  function mountAnalyzer(root, melody, opts){
    opts=opts||{}; melody=melody||{};
    // per-melody opt-out of the auto "Reading" verdict (e.g. reciting-tone/rap pieces it would misread)
    var showVerdict = !(melody.reading && /^(off|no|false|none)$/i.test(String(melody.reading).trim()));
    var keyOffset=keyToOffset(melody.key||'1=C'), meter=meterToBeats(melody.meter||'4/4');
    var bpm=+(String(melody.bpm||'').match(/\d+/)||[100])[0] || 100;
    var jianpu=(melody.hasJianpu===false || (melody.jianpu||'').trim().toUpperCase()==='TODO') ? '' : (melody.jianpu||'');
    root.innerHTML=
      '<div class="card controls-card">'+
        '<label>Jianpu (numbered notation) <span class="hint">(1–7 notes · <code>\'</code> octave up, <code>,</code> down · <code>_</code> eighth, <code>__</code> sixteenth · <code>.</code> dotted · <code>-</code> hold +1 beat · <code>0</code> rest · <code>#</code>/<code>b</code> accidental · <code>|</code> bar line)</span></label>'+
        '<textarea class="jp-in" spellcheck="false">'+jianpu.replace(/</g,'&lt;')+'</textarea>'+
        '<div class="controls">'+
          '<div class="grp"><label>Key</label><select class="jp-key">'+
            '<option value="0">1=C</option><option value="2">1=D</option><option value="4">1=E</option>'+
            '<option value="5">1=F</option><option value="7">1=G</option><option value="9">1=A</option><option value="11">1=B</option></select></div>'+
          '<div class="grp"><label>Meter</label><select class="jp-meter">'+
            '<option value="2">2/4</option><option value="3">3/4</option><option value="4">4/4</option></select></div>'+
          '<div class="grp"><label>Tempo (BPM)</label><input type="range" class="jp-bpm" min="50" max="200" value="'+bpm+'"><span class="jp-bpmv">'+bpm+'</span></div>'+
          '<button class="jp-analyze">Analyze</button>'+
          '<button class="ghost jp-play">▶ Play</button>'+
          '<button class="stop jp-stop">⏹ Stop</button>'+
        '</div>'+
      '</div>'+
      '<div class="pending-msg"></div>'+
      '<div class="card"><h2>Numbered score (Jianpu 简谱)</h2><div class="o-score score"></div>'+
        '<div class="rule"></div><h2 style="margin-top:0">Staff notation</h2><div class="o-staff"></div></div>'+
      '<div class="card"><h2>Summary</h2><div class="o-stats"></div></div>'+
      '<div class="card"><h2>Melodic contour &amp; intervals</h2><div class="o-contour"></div>'+
        '<div class="legend">'+
          '<span class="it"><span class="sw" style="background:'+COLORS.rep+'"></span>unison (0)</span>'+
          '<span class="it"><span class="sw" style="background:'+COLORS.step+'"></span>2nd · step (1–2)</span>'+
          '<span class="it"><span class="sw" style="background:'+COLORS.third+'"></span>3rd (3–4)</span>'+
          '<span class="it"><span class="sw" style="background:'+COLORS.leap+'"></span>4th/5th · leap (5–7)</span>'+
          '<span class="it"><span class="sw" style="background:'+COLORS.big+'"></span>6th+ (8+)</span>'+
        '</div></div>'+
      '<div class="card"><h2 class="hist-h">Interval distribution <button type="button" class="info-toggle" aria-expanded="false" aria-label="What the interval labels mean">ⓘ</button></h2>'+
        '<div class="interval-key" hidden>'+intervalKeyHTML()+'</div><div class="o-hist"></div></div>'+
      '<div class="card"><h2>Interval-by-interval</h2><div class="o-table"></div></div>';

    var $=function(s){ return root.querySelector(s); };
    $('.jp-key').value=String(keyOffset); $('.jp-meter').value=String(meter);
    (function(){ var ik=$('.interval-key'), itog=$('.info-toggle');
      if(itog&&ik) itog.addEventListener('click', function(){ var open=ik.hidden; ik.hidden=!open;
        itog.setAttribute('aria-expanded', String(open)); itog.classList.toggle('on', open); }); })();
    var player=null;
    function run(){
      var txt=$('.jp-in').value;
      var ko=+$('.jp-key').value, mt=+$('.jp-meter').value;
      var pmsg=$('.pending-msg');
      if(!txt.trim()){
        pmsg.innerHTML='<div class="pending">No transcription yet — paste Jianpu above and press Analyze to preview.</div>';
        ['.o-score','.o-staff','.o-stats','.o-contour','.o-hist','.o-table'].forEach(function(s){ $(s).innerHTML=''; });
        return;
      }
      pmsg.innerHTML='';
      var notes=parseJianpu(txt), iv=computeIntervals(notes), bars=computeBarlines(notes,mt);
      renderScore($('.o-score'), notes, bars);
      renderStaff($('.o-staff'), notes, bars, ko, mt);
      renderStats($('.o-stats'), computeStats(iv), {verdict:showVerdict});
      renderContour($('.o-contour'), notes, iv, bars.measureXs);
      renderHistogram($('.o-hist'), iv);
      renderTable($('.o-table'), iv);
      if(player) player.stop();
      player=createPlayer(root, notes, {bpm:+$('.jp-bpm').value, keyOffset:ko});
    }
    $('.jp-analyze').addEventListener('click', run);
    $('.jp-play').addEventListener('click', function(){ if(player) player.play(); });
    $('.jp-stop').addEventListener('click', function(){ if(player) player.stop(); });
    $('.jp-bpm').addEventListener('input', function(e){ $('.jp-bpmv').textContent=e.target.value; });
    run();
    return {run:run};
  }

  /* ---- expose ---- */
  global.JP = {
    COLORS:COLORS, SCALE:SCALE, NAMES:NAMES,
    intervalName:intervalName, leapColor:leapColor, noteLabel:noteLabel,
    keyToOffset:keyToOffset, meterToBeats:meterToBeats,
    parseJianpu:parseJianpu, computeIntervals:computeIntervals, computeStats:computeStats, computeBarlines:computeBarlines,
    parseMelodyDB:parseMelodyDB, loadDB:loadDB, getMelodies:getMelodies, analyzeMelody:analyzeMelody,
    renderScore:renderScore, renderStaff:renderStaff, renderStats:renderStats,
    renderContour:renderContour, renderHistogram:renderHistogram, renderTable:renderTable, intervalKeyHTML:intervalKeyHTML,
    createPlayer:createPlayer, mountMini:mountMini, mountAnalyzer:mountAnalyzer
  };
})(window);
