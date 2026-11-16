document.querySelectorAll('button[data-style]').forEach(button=>button.addEventListener('click',()=>{
  document.body.dataset.style=button.dataset.style;
  document.querySelectorAll('button[data-style]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
}));
document.getElementById('preview').addEventListener('click',()=>{
  const launcher=document.querySelector('[data-wheel-embed]')?.shadowRoot?.querySelector('button');
  if(launcher?.getAttribute('aria-expanded')==='false')launcher.click();
});
