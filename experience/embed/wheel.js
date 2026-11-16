/* One-script player embed. No operator or management controls are exposed here. */
(()=>{
  const script=document.currentScript;
  if(document.querySelector('[data-wheel-embed]'))return;
  const origin=new URL(script.src).origin;
  const player=new URL('../player/',script.src);player.searchParams.set('parentOrigin',location.origin);
  const host=document.createElement('div');host.dataset.wheelEmbed='';document.body.append(host);
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>:host{all:initial;position:fixed;bottom:24px;right:24px;z-index:2147483000;font-family:system-ui,sans-serif}button{font:600 14px system-ui;cursor:pointer;color:var(--wheel-launcher-ink,#26331c);background:var(--wheel-accent,#d9ee96);border:1px solid var(--wheel-edge,#e4f3b8);padding:15px 22px;border-radius:40px;box-shadow:0 6px 30px #0003;display:flex;gap:12px;align-items:center}button:focus-visible{outline:3px solid var(--wheel-focus,#8ba94c);outline-offset:4px}button span{font-size:21px}section{display:none;width:378px;height:min(530px,calc(100dvh - 110px));margin-bottom:12px;border-radius:20px;overflow:hidden;box-shadow:none;background:transparent;border:0}section.open{display:block}iframe{display:block;width:100%;height:100%;border:0;background:transparent}button.open{margin-left:auto;font-size:12px;padding:10px 18px}@media(max-width:500px){:host{right:12px;bottom:12px;left:12px}section{width:100%;max-height:calc(100dvh - 95px);border-radius:20px}button{margin-left:auto}}</style><section id="panel" role="region" aria-label="Prize wheel" aria-hidden="true"><iframe title="Prize wheel — demo" referrerpolicy="strict-origin" sandbox="allow-scripts allow-same-origin"></iframe></section><button aria-expanded="false" aria-controls="panel"><span aria-hidden="true">◉</span> Play the wheel</button>`;
  const frame=root.querySelector('iframe'),panel=root.querySelector('section'),button=root.querySelector('button');
  let hostTheme=null;
  function sendTheme(){if(hostTheme&&frame.src)frame.contentWindow.postMessage({source:'wheel-host',type:'theme',payload:hostTheme},origin);}
  frame.addEventListener('load',sendTheme);
  function startTheme(){
    if(script.dataset.wheelTheme==='manual')return;
    const tools=globalThis.WheelHostTheme;if(!tools)return;
    tools.watch(document,window,host,value=>{
      hostTheme=value;const theme=tools.create(value);
      host.style.setProperty('--wheel-accent',theme.accent);host.style.setProperty('--wheel-launcher-ink',theme['accent-ink']);
      host.style.setProperty('--wheel-edge',theme.line);host.style.setProperty('--wheel-focus',theme.focus);sendTheme();
    },{accent:script.dataset.wheelAccent,background:script.dataset.wheelBackground});
  }
  if(globalThis.WheelHostTheme)startTheme();
  else if(script.dataset.wheelTheme!=='manual'){
    const helper=document.createElement('script');helper.src=new URL('../shared/host-theme.js',script.src).href;
    helper.async=true;if(script.nonce)helper.nonce=script.nonce;helper.onload=startTheme;document.head.append(helper);
  }
  let open=false;
  function toggle(value){open=value;panel.classList.toggle('open',open);panel.setAttribute('aria-hidden',String(!open));button.classList.toggle('open',open);button.setAttribute('aria-expanded',String(open));button.innerHTML=open?'Close wheel <span aria-hidden="true">×</span>':'<span aria-hidden="true">◉</span> Play the wheel';if(open){if(!frame.src)frame.src=player.href;frame.focus();}else button.focus();}
  button.onclick=()=>toggle(!open);
  window.addEventListener('message',event=>{if(event.origin!==origin||event.source!==frame.contentWindow||event.data?.source!=='wheel-player')return;if(event.data.type==='ready')sendTheme();if(event.data.type==='close')toggle(false);if(event.data.type==='spin.resolved')host.dispatchEvent(new CustomEvent('wheel:spin',{bubbles:true,detail:event.data.payload}));});
  root.addEventListener('keydown',event=>{if(event.key==='Escape')toggle(false);});
})();
