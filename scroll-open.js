/* scroll-open.js — phones & tablets (hover:none or ≤860px): the row whose top crosses mid-screen opens,
   one at a time — the touch version of hovering down a list. Used by the UI/UX case-study rows (home #pj,
   project-ui-ux.html via admin.js), the Skills set rows (onOpen drives its accordion) and Experience (keep()).
   No-jitter rules:
   - nothing writes the scroll position while the user is scrolling or touching;
   - a newly opened row only grows downward, and the row it replaces stays open (.is-open) while it's on
     screen, so nothing above the reader changes height mid-scroll (no cascades, no anchoring fights);
   - kept rows fold once they are fully off-screen AND scrolling has stopped — instantly, with the view
     compensated in one step, so the fold is invisible.
   watch(list, rowSel, onOpen(row), {mark:true}) — mark adds .is-on (hover look) + .is-open (text open);
   mark:false only reports the row (the page opens it itself). keep(list, rowSel, activeCls) — rows a page
   marks .is-open itself get the same off-screen fold (activeCls = the class of the row in use). */
(function(){
  if(window.AK_SCROLL_OPEN) return;
  var MQ=matchMedia('(hover:none),(max-width:860px)'), lists=[], keeps=[], raf=0, idleT=0, touching=0, wasOn=false;
  try{ var st=document.createElement('style'); st.setAttribute('data-ak-transient','');
    st.textContent='[data-so-snap],[data-so-snap] *{transition:none!important}';
    (document.head||document.documentElement).appendChild(st); }catch(e){}
  function groups(){ var g=[]; lists.forEach(function(L){ if(L.mark) g.push({el:L.el,sel:L.sel,act:'is-on'}); }); return g.concat(keeps); }
  function reset(){
    lists.forEach(function(L){ if(L.on&&L.mark) L.on.classList.remove('is-on'); L.on=null; L.cur=-1; });
    groups().forEach(function(G){ [].forEach.call(G.el.querySelectorAll(G.sel+'.is-open'),function(r){ r.classList.remove('is-open'); }); });
  }
  function run(){
    raf=0;
    if(!MQ.matches){ if(wasOn){ wasOn=false; reset(); } return; }
    wasOn=true;
    var vh=innerHeight, de=document.documentElement, atEnd=scrollY+vh>=de.scrollHeight-2, ops=[];
    // read every list first, then write — no forced layout between lists
    lists.forEach(function(L){
      if(L.on&&!L.on.isConnected){ L.on=null; L.cur=-1; }
      if(!L.el.isConnected) return;
      var b=L.el.getBoundingClientRect(); if(!b.height||b.bottom<0||b.top>vh) return;
      var rs=L.el.querySelectorAll(L.sel), n=rs.length, k=0; if(!n) return;
      // opens when its top crosses 50% of the screen; the open one holds until 58% (no flicker at the line)
      for(var i=0;i<n;i++){ if(rs[i].getBoundingClientRect().top<=vh*(i<=L.cur?0.58:0.5)) k=i; else break; }
      if(k<n-1&&atEnd&&rs[n-1].getBoundingClientRect().bottom<=vh+1) k=n-1; // page end: last row
      if(rs[k]!==L.on) ops.push({L:L,r:rs[k],k:k});
    });
    ops.forEach(function(o){
      var L=o.L;
      if(L.mark){ if(L.on) L.on.classList.remove('is-on'); o.r.classList.add('is-on'); o.r.classList.add('is-open'); }
      L.on=o.r; L.cur=o.k;
      if(L.fn) try{ L.fn(o.r); }catch(e){}
    });
  }
  // a visible, non-fixed/sticky element to hold still while off-screen rows fold
  function refEl(){
    var vh=innerHeight, x=innerWidth/2, ys=[.5,.35,.65,.2,.8];
    for(var i=0;i<ys.length;i++){
      var e=document.elementFromPoint(x,vh*ys[i]), ok=!!e&&e!==document.body&&e!==document.documentElement;
      for(var n=e;ok&&n&&n!==document.documentElement;n=n.parentElement){ var p=getComputedStyle(n).position; if(p==='fixed'||p==='sticky') ok=false; }
      if(ok) return e;
    }
    return null;
  }
  function sweep(){
    idleT=0;
    if(!MQ.matches||touching||document.hidden) return;
    var vh=innerHeight, fold=[];
    groups().forEach(function(G){
      if(!G.el.isConnected) return;
      [].forEach.call(G.el.querySelectorAll(G.sel+'.is-open'),function(r){
        if(r.classList.contains(G.act)) return;
        var b=r.getBoundingClientRect(); if(b.bottom<=0||b.top>=vh) fold.push(r);
      });
    });
    if(!fold.length) return;
    var html=document.documentElement, ref=refEl(), y0=ref?ref.getBoundingClientRect().top:0;
    html.style.overflowAnchor='none'; html.style.scrollBehavior='auto'; // html has scroll-behavior:smooth — the fix-up must be instant
    fold.forEach(function(r){ r.setAttribute('data-so-snap',''); r.classList.remove('is-open'); });
    if(ref){ var d=ref.getBoundingClientRect().top-y0; if(Math.abs(d)>0.5) window.scrollBy({top:d,left:0,behavior:'instant'}); }
    var done=function(){ if(!fold) return; fold.forEach(function(r){ r.removeAttribute('data-so-snap'); }); fold=null; html.style.overflowAnchor=''; html.style.scrollBehavior=''; };
    requestAnimationFrame(function(){ requestAnimationFrame(done); }); setTimeout(done,150);
  }
  function req(){ if(!raf) raf=requestAnimationFrame(run); clearTimeout(idleT); idleT=setTimeout(sweep,200); }
  function tch(e){ touching=e.touches?e.touches.length:0; if(!touching) req(); }
  addEventListener('scroll',req,{passive:true});
  addEventListener('resize',req,{passive:true});
  addEventListener('touchstart',tch,{passive:true});
  addEventListener('touchend',tch,{passive:true});
  addEventListener('touchcancel',tch,{passive:true});
  if(MQ.addEventListener) MQ.addEventListener('change',req); else if(MQ.addListener) MQ.addListener(req);
  window.AK_SCROLL_OPEN={
    watch:function(el,sel,fn,opt){
      if(!el) return;
      var mark=!(opt&&opt.mark===false);
      for(var i=0;i<lists.length;i++) if(lists[i].el===el){ lists[i].sel=sel; lists[i].fn=fn; lists[i].mark=mark; req(); return; }
      lists.push({el:el,sel:sel,fn:fn,mark:mark,on:null,cur:-1}); req();
    },
    keep:function(el,sel,act){ if(el&&!keeps.some(function(K){ return K.el===el; })) keeps.push({el:el,sel:sel,act:act||'active'}); },
    refresh:req,
    active:function(){ return MQ.matches; }
  };
})();
