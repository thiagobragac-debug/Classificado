const fs = require('fs');
let c = fs.readFileSync('c:/classificado/vendedor.html', 'utf8');
c = c.replace(/<title>.*?<\/title>/, '<title>Perfil do Vendedor - Tauze Class</title>');
c = c.replace(/<header class=\"search-header\">[\s\S]*?<\/header>/, `
<div class=\"seller-banner\" style=\"background:#fff; border-bottom:1px solid #e2e8f0; padding:3rem 1.5rem;\">
  <div class=\"container\" style=\"max-width:1200px; margin:0 auto; display:flex; align-items:center; gap:24px;\" id=\"seller-profile-container\">
    <div id=\"seller-avatar\" style=\"width:100px; height:100px; border-radius:50%; background:#e2e8f0; overflow:hidden;\"></div>
    <div style=\"flex:1;\">
      <h1 id=\"seller-name\" style=\"font-size:2rem; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:8px;\">Carregando...</h1>
      <div style=\"display:flex; align-items:center; gap:16px; margin-top:8px; flex-wrap:wrap;\">
        <span id=\"seller-member-since\" style=\"color:#64748b; font-size:0.95rem; display:flex; align-items:center; gap:4px;\"></span>
        <span id=\"seller-country\" style=\"color:#64748b; font-size:0.95rem; display:flex; align-items:center; gap:4px;\"></span>
        <a id=\"btn-contact-seller\" href=\"#\" style=\"display:none; background:#16a34a; color:#fff; padding:6px 16px; border-radius:99px; text-decoration:none; font-weight:600; font-size:0.85rem; align-items:center; gap:6px;\"><svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z\"></path></svg> Contatar Vendedor</a>
      </div>
    </div>
  </div>
</div>
`);

// Replace the loadAds script
c = c.replace(/async function loadAds\(\){[\s\S];?renderAds\(\);[s\S];?}/, `
  let _sellerId = new URLSearchParams(window.location.search).get('id');
  async function loadAds() {
    if(!_sellerId) {
      document.getElementById('ads-container').innerHTML = '<div style=\"padding:4rem; text-align:center; color:#64748b;\">Vendedor nao encontrado.</div>';
      return;
    }
    
    try {
      const profile = await getSellerProfile(_sellerId);
      if(!profile) throw new Error('Not found');
      
      const av = profile.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(profile.name||'U') + '&background=e2e8f0&color=64748b&size=200';
      document.getElementById('seller-avatar').innerHTML = `<img src=\"${av}\" style=\"width:100%;height:100%;object-fit:cover;\">`;
      
      let nameHtml = profile.name || profile.display_name || 'Vendedor';
      if(profile.verified) {
         nameHtml += `<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"#3b82f6\" style=\"margin-left:8px;\"><path d=\"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z\" fill=\"#fff\" stroke=\"#3b82f6\" stroke-width=\"1\"/><path d=\"M10 17l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z\"/></svg>`;
      }
      document.getElementById('seller-name').innerHTML = nameHtml;
      
      if(profile.created_at) {
        const year = new Date(profile.created_at).getFullYear();
        document.getElementById('seller-member-since').innerHTML = `<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"/><line x1=\"16\" y1=\"2\" x2=\"16\" y2=\"6\"/><line x1=\"8\" y1=\"2\" x2=\"8\" y2=\"6\"/><line x1=\"3\" y1=\"10\" x2=\"21\" y2=\"10\"/></svg> Membro desde ${year}`;
      }
      if(profile.country) {
        document.getElementById('seller-country').innerHTML = `<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 10c0 7-9 13-9 13s9-6 9-13a9 9 0 0 1 18 0z\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/></svg> ${profile.country.toUpperCase()}`;
      }
      
      // WhatsApp contact logic
      if(profile.phone_whatsapp) {
        const btn = document.getElementById('btn-contact-seller');
        btn.style.display = 'inline-flex';
        btn.href = 'https://wa.me/' + profile.phone_whatsapp.replace(/\\D/g, '');
        btn.target = '_blank';
      }
      
      _ads = await getSellerAds(_sellerId);
      
      if(document.getElementById('result-count')) {
         document.getElementById('result-count').textContent = `${_ads.length} anúncio${_ads.length !== 1 ? 's' : ''} deste vendedor`;
      }
    } catch(e) {
      document.getElementById('seller-name').textContent = 'Vendedor não encontrado';
      _ads = [];
    }
    renderAds();
  }
`);

// Adjust the top margin since there's no search header
c = c.replace('<div class=\"layout\">', '<div class=\"layout\" style=\"margin-top:0;\">');

fs.writeFileSync('c:/classificado/vendedor.html', c, 'utf8');
