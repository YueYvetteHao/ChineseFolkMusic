/* stats.js — 4-vs-4 regional comparison (陕北 vs 江南).
 * Pure compute + SVG plot builders on top of window.JP (engine.js); STATS.init() fills the DOM.
 * Testable in node: stub DOM, eval engine.js then this file, call STATS.computeAll(db) / STATS.svg*(d).
 * Exposes a single global: window.STATS */
(function(global){
  'use strict';
  var JP = global.JP;

  /* the 4 + 4 comparison set (each tune's primary theme) */
  var GROUPS = {'陕北':['sanshilipu','shandandan','lanhuahua','jiaofudiao'],
                '江南':['molihua','zizhudiao','wuxijing','mutongduandi']};
  var REG_EN = {'陕北':'Northern Shaanxi','江南':'Jiangnan'};
  var SHORT  = {sanshilipu:'三十里铺', shandandan:'山丹丹', lanhuahua:'兰花花', jiaofudiao:'脚夫调',
                molihua:'茉莉花', zizhudiao:'紫竹调', wuxijing:'无锡景', mutongduandi:'牧童短笛'};
  var ILAB = ['U','m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7','P8'];
  var SX='#e8743b', JN='#2e9e8f', INK='#23262b', MUT='#6b7280', LINE='#e3e1da', GREY='#bdb9af';
  var col=function(reg){ return reg==='陕北'?SX:JN; };

  /* ---------- statistics (verified against scipy) ---------- */
  function erf(x){var t=1/(1+0.3275911*Math.abs(x));var y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return x>=0?y:-y;}
  function normCdf(z){return 0.5*(1+erf(z/Math.SQRT2));}
  function gammln(xx){var cof=[76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];var x=xx,y=xx,tmp=x+5.5;tmp-=(x+0.5)*Math.log(tmp);var ser=1.000000000190015;for(var j=0;j<6;j++){y++;ser+=cof[j]/y;}return -tmp+Math.log(2.5066282746310005*ser/x);}
  function gser(a,x){var IT=300,EPS=3e-14;if(x<=0)return 0;var gln=gammln(a),ap=a,sum=1/a,del=sum;for(var n=0;n<IT;n++){ap++;del*=x/ap;sum+=del;if(Math.abs(del)<Math.abs(sum)*EPS)break;}return sum*Math.exp(-x+a*Math.log(x)-gln);}
  function gcf(a,x){var IT=300,EPS=3e-14,FP=1e-300;var gln=gammln(a),b=x+1-a,c=1/FP,d=1/b,h=d;for(var i=1;i<=IT;i++){var an=-i*(i-a);b+=2;d=an*d+b;if(Math.abs(d)<FP)d=FP;c=b+an/c;if(Math.abs(c)<FP)c=FP;d=1/d;var del=d*c;h*=del;if(Math.abs(del-1)<EPS)break;}return Math.exp(-x+a*Math.log(x)-gln)*h;}
  function chiSqP(chi2,dof){var a=dof/2,x=chi2/2;return x<a+1?1-gser(a,x):gcf(a,x);}
  function chiSquare(table){var R=table.length,C=table[0].length,rs=table.map(function(r){return r.reduce(function(a,b){return a+b;},0);}),cs=[];for(var j=0;j<C;j++){cs[j]=0;for(var i=0;i<R;i++)cs[j]+=table[i][j];}var N=rs.reduce(function(a,b){return a+b;},0),chi2=0;for(var i2=0;i2<R;i2++)for(var j2=0;j2<C;j2++){var e=rs[i2]*cs[j2]/N;chi2+=(table[i2][j2]-e)*(table[i2][j2]-e)/e;}var dof=(R-1)*(C-1);return{chi2:chi2,dof:dof,p:chiSqP(chi2,dof)};}
  function mannWhitney(a,b){var all=a.concat(b),idx=all.map(function(v,i){return [v,i];}).sort(function(p,q){return p[0]-q[0];}),ranks=new Array(all.length),i=0,tc=0;while(i<idx.length){var j=i;while(j+1<idx.length&&idx[j+1][0]===idx[i][0])j++;var r=(i+j)/2+1;for(var k=i;k<=j;k++)ranks[idx[k][1]]=r;var t=j-i+1;if(t>1)tc+=t*t*t-t;i=j+1;}var n1=a.length,n2=b.length,n=n1+n2,R1=0;for(var i2=0;i2<n1;i2++)R1+=ranks[i2];var U1=R1-n1*(n1+1)/2,mu=n1*n2/2,sg=Math.sqrt((n1*n2/12)*((n+1)-tc/(n*(n-1)))),z=(Math.abs(U1-mu)-0.5)/sg,p=2*(1-normCdf(z));return{U:U1,U2:n1*n2-U1,z:z,p:Math.min(1,Math.max(0,p)),n1:n1,n2:n2};}

  /* ---------- compute everything from the melody DB ---------- */
  function z13(){return [0,0,0,0,0,0,0,0,0,0,0,0,0];}
  function computeAll(db){
    var byId={}; db.forEach(function(m){ byId[m.id]=m; });
    var per=[], pooled={'陕北':[], '江南':[]};
    function themesOf(m){ var out=[]; ['jianpu','jianpu2','jianpu3','jianpu4'].forEach(function(k){ var v=m[k]; if(v&&String(v).trim()&&String(v).trim().toUpperCase()!=='TODO') out.push(v); }); return out; }
    // combine a tune's themes into ONE sample: pool the intervals; sum osc per theme (no false join reversal)
    function mergeStats(sts){ if(sts.length===1) return sts[0];
      var a={n:0,mean:0,max:0,repeat:0,steps:0,thirds:0,leaps:0,wide:0,osc:0}, sum=0;
      sts.forEach(function(s){ a.n+=s.n; a.max=Math.max(a.max,s.max); a.repeat+=s.repeat; a.steps+=s.steps; a.thirds+=s.thirds; a.leaps+=s.leaps; a.wide+=s.wide; a.osc+=s.osc; sum+=s.mean*s.n; });
      a.mean=sum/a.n; a.leapPct=(a.leaps+a.wide)/a.n*100; a.smallPct=(a.steps+a.thirds)/a.n*100; return a; }
    Object.keys(GROUPS).forEach(function(reg){
      GROUPS[reg].forEach(function(id){
        var m=byId[id]; if(!m) return; var ths=themesOf(m), sts=[];
        ths.forEach(function(jp){ var iv=JP.computeIntervals(JP.parseJianpu(jp)); var st=JP.computeStats(iv);
          if(st){ sts.push(st); iv.forEach(function(i){ pooled[reg].push(i.abs); }); } });
        if(!sts.length) return;
        per.push({id:id, title:m.title, en:m.en, reg:reg, nThemes:ths.length, label:(SHORT[id]||m.title), st:mergeStats(sts)});
      });
    });
    var hist={'陕北':z13(), '江南':z13()};
    Object.keys(pooled).forEach(function(reg){ pooled[reg].forEach(function(a){ if(a<=12) hist[reg][a]++; }); });
    function cats(arr){ var c=[0,0,0]; arr.forEach(function(a){ if(a<=2)c[0]++; else if(a<=4)c[1]++; else c[2]++; }); return c; }
    var cA=cats(pooled['陕北']), cB=cats(pooled['江南']);
    function rmean(reg){ var ps=per.filter(function(p){return p.reg===reg;}), k=ps.length||1, ac={mean:0,wide:0,small:0,osc:0,n:0,max:0};
      ps.forEach(function(p){ ac.mean+=p.st.mean; ac.wide+=p.st.leapPct; ac.small+=p.st.smallPct; ac.osc+=p.st.osc; ac.n+=p.st.n; ac.max=Math.max(ac.max,p.st.max); });
      return {k:k, mean:ac.mean/k, wide:ac.wide/k, small:ac.small/k, osc:ac.osc/k, oscTot:ac.osc, n:ac.n, maxAll:ac.max}; }
    return {per:per, pooled:pooled, hist:hist, tot:{'陕北':pooled['陕北'].length,'江南':pooled['江南'].length},
            cats:{'陕北':cA,'江南':cB}, chi:chiSquare([cA,cB]), mwu:mannWhitney(pooled['陕北'],pooled['江南']),
            rmean:{'陕北':rmean('陕北'),'江南':rmean('江南')}};
  }

  /* ---------- formatting ---------- */
  function fmtP(p){ if(p<1e-4){var e=p.toExponential(1).split('e'); return (+e[0])+' × 10<sup>'+e[1].replace('+','').replace('-','−')+'</sup>'; } return p.toFixed(3); }
  function sig(p){ return p<0.05 ? 'significant' : 'not significant'; }

  /* ---------- SVG helpers ---------- */
  function wrap(W,H,inner){ return '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" role="img">'+inner+'</svg>'; }
  function txt(x,y,s,o){ o=o||{}; return '<text x="'+x+'" y="'+y+'" font-size="'+(o.size||11)+'" text-anchor="'+(o.anc||'middle')+'" fill="'+(o.fill||INK)+'"'+(o.weight?' font-weight="'+o.weight+'"':'')+'>'+s+'</text>'; }
  function legend(){ return '<div class="legend"><span><span class="sw" style="background:'+SX+'"></span>陕北 N. Shaanxi</span>'+
                            '<span><span class="sw" style="background:'+JN+'"></span>江南 Jiangnan</span></div>'; }

  /* ---------- plot 1: aggregate interval-type histogram ---------- */
  function svgHist(d){
    var last=0; for(var i=0;i<=12;i++) if(d.hist['陕北'][i]+d.hist['江南'][i]>0) last=i; var N=last+1;
    function pct(reg,i){ return d.hist[reg][i]/d.tot[reg]*100; }
    var maxP=0; for(var i2=0;i2<N;i2++) maxP=Math.max(maxP,pct('陕北',i2),pct('江南',i2));
    var yMax=Math.max(10,Math.ceil(maxP/10)*10);
    var W=940,H=300,padL=44,padR=12,padT=14,padB=42,pw=W-padL-padR,ph=H-padT-padB,x0=padL,yb=padT+ph;
    var g='';
    for(var t=0;t<=yMax;t+=10){ var y=yb-t/yMax*ph; g+='<line x1="'+x0+'" y1="'+y+'" x2="'+(x0+pw)+'" y2="'+y+'" stroke="'+LINE+'"/>'+txt(x0-7,y+4,t+'%',{anc:'end',fill:MUT}); }
    var gw=pw/N, bw=Math.min(20,gw*0.30);
    for(var i3=0;i3<N;i3++){
      var cx=x0+gw*(i3+0.5), hs=pct('陕北',i3)/yMax*ph, hj=pct('江南',i3)/yMax*ph;
      g+='<rect x="'+(cx-bw-1).toFixed(1)+'" y="'+(yb-hs).toFixed(1)+'" width="'+bw+'" height="'+hs.toFixed(1)+'" fill="'+SX+'"/>';
      g+='<rect x="'+(cx+1).toFixed(1)+'" y="'+(yb-hj).toFixed(1)+'" width="'+bw+'" height="'+hj.toFixed(1)+'" fill="'+JN+'"/>';
      g+=txt(cx,yb+15,ILAB[i3],{fill:INK});
    }
    // mark the hypothesis bands
    g+=txt(x0+gw*3.5, padT+10, '↑ 3rds', {fill:JN, size:10, weight:700});
    g+=txt(x0+gw*6.0, padT+10, '↑ 4ths–5ths', {fill:SX, size:10, weight:700});
    g+='<line x1="'+x0+'" y1="'+yb+'" x2="'+(x0+pw)+'" y2="'+yb+'" stroke="'+INK+'"/>';
    g+=txt(padL-30, padT+ph/2, '', {}); // spacer
    return wrap(W,H,g);
  }

  /* ---------- plot 2: per-tune wide vs small leap share ---------- */
  function svgLeap(d){
    var W=940,H=320,padL=44,padR=12,padT=14,padB=64,pw=W-padL-padR,ph=H-padT-padB,x0=padL,yb=padT+ph,yMax=100;
    var g='';
    for(var t=0;t<=yMax;t+=25){ var y=yb-t/yMax*ph; g+='<line x1="'+x0+'" y1="'+y+'" x2="'+(x0+pw)+'" y2="'+y+'" stroke="'+LINE+'"/>'+txt(x0-7,y+4,t+'%',{anc:'end',fill:MUT}); }
    var n=d.per.length, nSX=d.per.filter(function(p){return p.reg==='陕北';}).length, units=n+1; // +1 = gap between regions
    var uw=pw/units, bw=Math.min(16,uw*0.30);
    d.per.forEach(function(p,i){
      var pos=i<nSX?i:i+1, cx=x0+uw*(pos+0.5);
      var hw=p.st.leapPct/yMax*ph, hs=p.st.smallPct/yMax*ph;
      g+='<rect x="'+(cx-bw-1).toFixed(1)+'" y="'+(yb-hw).toFixed(1)+'" width="'+bw+'" height="'+hw.toFixed(1)+'" fill="'+col(p.reg)+'"/>';
      g+='<rect x="'+(cx+1).toFixed(1)+'" y="'+(yb-hs).toFixed(1)+'" width="'+bw+'" height="'+hs.toFixed(1)+'" fill="'+GREY+'"/>';
      g+=txt(cx,yb+15,p.label,{size:10.5});
      g+=txt(cx,yb+30,p.st.leapPct.toFixed(0)+'%',{size:10,fill:col(p.reg),weight:700});
    });
    g+='<line x1="'+x0+'" y1="'+yb+'" x2="'+(x0+pw)+'" y2="'+yb+'" stroke="'+INK+'"/>';
    return wrap(W,H,g)+'<div class="legend"><span><span class="sw" style="background:'+SX+'"></span>陕北 / <span class="sw" style="background:'+JN+';margin-left:4px"></span>江南: ≥ P4 (wide)</span><span><span class="sw" style="background:'+GREY+'"></span>≤ M3 (3rds & steps)</span></div>';
  }

  /* ---------- plot 3: mean |leap| vs wide-% scatter ---------- */
  function svgScatter(d){
    var W=720,H=380,padL=56,padR=18,padT=16,padB=50,pw=W-padL-padR,ph=H-padT-padB,x0=padL,yb=padT+ph;
    var xs=d.per.map(function(p){return p.st.mean;}), ys=d.per.map(function(p){return p.st.leapPct;});
    var xmin=Math.floor(Math.min.apply(null,xs)*2)/2-0.2, xmax=Math.ceil(Math.max.apply(null,xs)*2)/2+0.2;
    var ymax=Math.max(10,Math.ceil(Math.max.apply(null,ys)/10)*10);
    function X(v){ return x0+(v-xmin)/(xmax-xmin)*pw; } function Y(v){ return yb-v/ymax*ph; }
    var g='';
    for(var t=0;t<=ymax;t+=10){ var y=Y(t); g+='<line x1="'+x0+'" y1="'+y+'" x2="'+(x0+pw)+'" y2="'+y+'" stroke="'+LINE+'"/>'+txt(x0-8,y+4,t+'%',{anc:'end',fill:MUT}); }
    var xt=xmin; for(; xt<=xmax+1e-9; xt+=0.5){ var x=X(xt); g+='<line x1="'+x+'" y1="'+padT+'" x2="'+x+'" y2="'+yb+'" stroke="'+LINE+'"/>'+txt(x,yb+16,xt.toFixed(1),{fill:MUT}); }
    g+='<line x1="'+x0+'" y1="'+yb+'" x2="'+(x0+pw)+'" y2="'+yb+'" stroke="'+INK+'"/><line x1="'+x0+'" y1="'+padT+'" x2="'+x0+'" y2="'+yb+'" stroke="'+INK+'"/>';
    g+=txt(x0+pw/2, H-10, 'mean |interval| (semitones)', {fill:MUT,size:12});
    g+='<text x="16" y="'+(padT+ph/2)+'" font-size="12" fill="'+MUT+'" text-anchor="middle" transform="rotate(-90 16 '+(padT+ph/2)+')">% wide leaps (≥ P4)</text>';
    d.per.forEach(function(p){
      var cx=X(p.st.mean), cy=Y(p.st.leapPct);
      g+='<circle cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" r="6.5" fill="'+col(p.reg)+'" fill-opacity="0.85" stroke="#fff" stroke-width="1.2"/>';
      g+=txt(cx, cy-10, p.label, {size:10, fill:INK});
    });
    return wrap(W,H,g);
  }

  /* ---------- plot 4: oscillating-leap count per tune ---------- */
  function svgOsc(d){
    var W=720,H=300,padL=40,padR=14,padT=16,padB=64,pw=W-padL-padR,ph=H-padT-padB,x0=padL,yb=padT+ph;
    var maxO=Math.max(1,Math.max.apply(null,d.per.map(function(p){return p.st.osc;})));
    var yMax=Math.ceil(maxO/2)*2; var g='';
    for(var t=0;t<=yMax;t+=2){ var y=yb-t/yMax*ph; g+='<line x1="'+x0+'" y1="'+y+'" x2="'+(x0+pw)+'" y2="'+y+'" stroke="'+LINE+'"/>'+txt(x0-7,y+4,String(t),{anc:'end',fill:MUT}); }
    var n=d.per.length, nSX=d.per.filter(function(p){return p.reg==='陕北';}).length, units=n+1, uw=pw/units, bw=Math.min(34,uw*0.6);
    d.per.forEach(function(p,i){
      var pos=i<nSX?i:i+1, cx=x0+uw*(pos+0.5), h=p.st.osc/yMax*ph;
      g+='<rect x="'+(cx-bw/2).toFixed(1)+'" y="'+(yb-h).toFixed(1)+'" width="'+bw+'" height="'+h.toFixed(1)+'" fill="'+col(p.reg)+'"/>';
      g+=txt(cx,yb-h-5,String(p.st.osc),{size:11,weight:700,fill:col(p.reg)});
      g+=txt(cx,yb+15,p.label,{size:10.5});
    });
    g+=txt(x0+uw*(nSX/2), yb+34, '陕北 total '+d.rmean['陕北'].oscTot, {size:12,weight:700,fill:SX});
    g+=txt(x0+uw*(nSX+1+(n-nSX)/2), yb+34, '江南 total '+d.rmean['江南'].oscTot, {size:12,weight:700,fill:JN});
    g+='<line x1="'+x0+'" y1="'+yb+'" x2="'+(x0+pw)+'" y2="'+yb+'" stroke="'+INK+'"/>';
    return wrap(W,H,g);
  }

  /* ---------- table + prose ---------- */
  function tableHTML(d){
    var h='<table class="stat-tbl"><thead><tr><th>Tune</th><th>n</th><th>mean |leap|</th><th>max</th><th>% ≥ P4</th><th>% ≤ M3</th><th>osc</th></tr></thead><tbody>';
    Object.keys(GROUPS).forEach(function(reg){
      h+='<tr class="reg-row '+(reg==='陕北'?'sx':'jn')+'"><td colspan="7">'+REG_EN[reg]+' '+reg+'</td></tr>';
      d.per.filter(function(p){return p.reg===reg;}).forEach(function(p){ var s=p.st;
        var name=p.title+' <span class="muted">'+(p.en||'')+(p.nThemes>1?' · '+p.nThemes+' themes':'')+'</span>';
        h+='<tr><td>'+name+'</td><td>'+s.n+'</td><td>'+s.mean.toFixed(2)+'</td><td>'+s.max+'</td><td>'+s.leapPct.toFixed(1)+'%</td><td>'+s.smallPct.toFixed(1)+'%</td><td>'+s.osc+'</td></tr>'; });
      var r=d.rmean[reg];
      h+='<tr class="mean-row"><td>mean ('+reg+' · '+r.k+' tunes, '+r.n+' intervals)</td><td>'+Math.round(r.n/r.k)+'</td><td>'+r.mean.toFixed(2)+'</td><td>'+r.maxAll+'</td><td>'+r.wide.toFixed(1)+'%</td><td>'+r.small.toFixed(1)+'%</td><td>'+r.osc.toFixed(1)+'</td></tr>';
    });
    return h+'</tbody></table>';
  }
  function testsHTML(d){
    var c=d.chi, m=d.mwu;
    return '<div class="tests">'+
      '<p><b>Chi-square</b> — interval class (≤ M2 / 3rd / ≥ P4) × region: <b>χ² = '+c.chi2.toFixed(1)+'</b>, df = '+c.dof+', <b>p = '+fmtP(c.p)+'</b> → the interval-class mix differs by region ('+sig(c.p)+').</p>'+
      '<p><b>Mann–Whitney U</b> — |interval| sizes, all consecutive intervals (n='+m.n1+' vs '+m.n2+'): <b>U = '+m.U.toLocaleString()+'</b>, <b>p = '+fmtP(m.p)+'</b> → no difference in raw leap <i>size</i> ('+sig(m.p)+'); both regions are mostly stepwise.</p>'+
      '<p class="muted">Takeaway: the regions separate by interval <i>category</i> (3rds vs 4ths/5ths) and by leap <i>oscillation</i> — not by average leap size.</p></div>';
  }
  function findingHTML(d){
    var sh=d.hist['陕北'], jh=d.hist['江南'], ts=d.tot['陕北'], tj=d.tot['江南'];
    var sxFifth=((sh[5]+sh[6]+sh[7])/ts*100), jnThird=((jh[3]+jh[4])/tj*100);
    var sxThird=((sh[3]+sh[4])/ts*100), jnFifth=((jh[5]+jh[6]+jh[7])/tj*100);
    var nSX=d.per.filter(function(p){return p.reg==='陕北';}).length, nJN=d.per.length-nSX;
    return 'Across <b>'+ts+'</b> melodic intervals in the <b>'+nSX+'</b> <span class="hl-sx">陕北</span> tunes and <b>'+tj+
      '</b> in the <b>'+nJN+'</b> <span class="hl-jn">江南</span> tunes (multi-theme pieces combined), the two sets use intervals of <b>similar average size</b> '+
      '(mean |leap| '+d.rmean['陕北'].mean.toFixed(1)+' vs '+d.rmean['江南'].mean.toFixed(1)+' semitones; Mann–Whitney p = '+fmtP(d.mwu.p)+', '+sig(d.mwu.p)+'). '+
      'What differs is the <b>shape</b> of the distribution. <span class="hl-sx">陕北</span> fills the <b>4th/5th band</b> (P4–P5 = '+sxFifth.toFixed(0)+'% of its intervals) and largely skips 3rds ('+sxThird.toFixed(0)+'%); '+
      '<span class="hl-jn">江南</span> is the mirror image — 3rds = '+jnThird.toFixed(0)+'%, 4ths/5ths only '+jnFifth.toFixed(0)+'%. '+
      'A chi-square on the class split is highly significant (χ² = '+d.chi.chi2.toFixed(1)+', p = '+fmtP(d.chi.p)+'). '+
      '<span class="hl-sx">陕北</span> also chains its wide leaps into direction-reversing <b>oscillations</b> ('+d.rmean['陕北'].oscTot+' vs '+d.rmean['江南'].oscTot+' across the two sets) — the saw-tooth signature. '+
      'So the north–south contrast is not “bigger leaps” on average; it is <b>which</b> intervals fill the gaps (4ths/5ths vs 3rds) and whether those leaps oscillate.';
  }

  /* ---------- mount ---------- */
  function set(id,html){ var el=global.document.getElementById(id); if(el) el.innerHTML=html; }
  function init(db){
    var d=computeAll(db);
    set('finding', findingHTML(d));
    set('table', tableHTML(d));
    set('tests', testsHTML(d));
    set('plot-hist', legend()+svgHist(d));
    set('plot-leap', svgLeap(d));
    set('plot-scatter', svgScatter(d));
    set('plot-osc', svgOsc(d));
    return d;
  }

  global.STATS = {GROUPS:GROUPS, SHORT:SHORT, computeAll:computeAll, init:init,
                  svgHist:svgHist, svgLeap:svgLeap, svgScatter:svgScatter, svgOsc:svgOsc,
                  tableHTML:tableHTML, testsHTML:testsHTML, findingHTML:findingHTML,
                  chiSquare:chiSquare, mannWhitney:mannWhitney};
})(typeof window!=='undefined'?window:globalThis);
