const fs = require('fs');
let c = fs.readFileSync('c:/classificado/painel.html', 'utf8');

c = c.replace(
  /<p style="font-size:0.9rem;color:#64748b;margin-bottom:1.5rem;">Seus anúncios tiveram um total de <strong>\${totalViews} visualizações<\/strong>\. Veja os mais populares:<\/p>/,
  `
  <div style="display:flex; gap:16px; margin-bottom:1.5rem; flex-wrap:wrap;">
    <div style="flex:1; min-width:200px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; display:flex; flex-direction:column; justify-content:center;">
      <div style="color:#64748b; font-size:0.85rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Visualizações Totais</div>
      <div style="color:#0f172a; font-size:2rem; font-weight:800;">\${totalViews}</div>
    </div>
    <div style="flex:1; min-width:200px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; display:flex; flex-direction:column; justify-content:center;">
      <div style="color:#64748b; font-size:0.85rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Anúncios Ativos</div>
      <div style="color:#0f172a; font-size:2rem; font-weight:800;">\${activeAds.length}</div>
    </div>
  </div>
  <p style="font-size:0.9rem;color:#64748b;margin-bottom:1rem;">Ranking dos seus anúncios mais populares:</p>
  `
);

fs.writeFileSync('c:/classificado/painel.html', c, 'utf8');
