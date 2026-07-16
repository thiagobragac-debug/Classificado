const fs = require('fs');
let mainJS = fs.readFileSync('c:/classificado/js/main.js', 'utf8');

const oldToggle = `async function toggleFavorite(event, adId) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  // Verificar login antes de fazer qualquer coisa
  if (typeof getSession === 'function') {
    const sess = await getSession();
    if (!sess) {
      window.location.href = 'login.html';
      return false;
    }
  }`;

const newToggle = `async function toggleFavorite(event, adId) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  // Verificar login sem redirecionar
  let sess = null;
  if (typeof getSession === 'function') {
    sess = await getSession();
  }`;

if (mainJS.includes(oldToggle)) {
    mainJS = mainJS.replace(oldToggle, newToggle);
}

const oldSyncCall = `
  // 3. Sincroniza com banco
  let finalState = !isFav;
  if (typeof _rpcToggleFav === 'function') {`;

const newSyncCall = `
  // Toast offline se não estiver logado
  if (!sess) {
    if (!isFav && typeof window.showToast === 'function') {
      window.showToast('Anúncio salvo localmente! Faça login para não perder seus favoritos.', 'info', 4000);
    }
    return true; // termina aqui, não tenta ir pro banco
  }

  // 3. Sincroniza com banco
  let finalState = !isFav;
  if (typeof _rpcToggleFav === 'function') {`;

if (mainJS.includes(oldSyncCall) && !mainJS.includes('Toast offline')) {
    mainJS = mainJS.replace(oldSyncCall, newSyncCall);
}

fs.writeFileSync('c:/classificado/js/main.js', mainJS, 'utf8');
