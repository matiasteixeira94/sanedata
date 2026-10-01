/* tema antes do primeiro desenho da página (sem "piscar" claro): escolha salva pelo
   usuário ou, na falta dela, o tema do sistema operacional */
(function(){
  var tema = null;
  try{ tema = localStorage.getItem('sanedata-tema'); }catch(e){}
  if(tema !== 'light' && tema !== 'dark') tema = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', tema);
})();
