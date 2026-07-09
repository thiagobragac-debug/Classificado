const fs = require('fs');
let html = fs.readFileSync('c:/classificado/admin.html', 'utf8');

const newSection = `
    <div class="card" style="margin-top:2rem;">
      <div class="card-header">Gerenciar Administradores</div>
      <p style="color:#64748b; font-size:0.9rem; margin-bottom:1rem;">Conceda permissão de administrador a outros usuários informando o e-mail cadastrado.</p>
      <div style="display:flex; gap:1rem; max-width:500px;">
        <input type="email" id="new-admin-email" placeholder="email@exemplo.com" style="flex:1; padding:0.75rem 1rem; border-radius:0.5rem; border:1px solid #e2e8f0; font-family:inherit; outline:none;">
        <button class="btn btn-approve" onclick="handleAddAdmin()">Adicionar Admin</button>
      </div>
    </div>
  </div>`;

if(!html.includes('Gerenciar Administradores')) {
    html = html.replace('  </div>\n  \n  <div class="container" id="loading-content"', newSection + '\n  \n  <div class="container" id="loading-content"');
}

const newScript = `
    window.handleAddAdmin = async () => {
      const email = document.getElementById('new-admin-email').value.trim();
      if(!email) {
        showToast('Digite um e-mail válido.', 'error');
        return;
      }
      try {
        const success = await grantAdmin(email);
        if(success) {
          showToast('Usuário promovido a Admin!', 'success');
          document.getElementById('new-admin-email').value = '';
        } else {
          showToast('Usuário não encontrado.', 'error');
        }
      } catch(e) {
        showToast('Erro: ' + e.message, 'error');
      }
    };
`;

if(!html.includes('handleAddAdmin')) {
    html = html.replace('    (async function init() {', newScript + '\n    (async function init() {');
}

fs.writeFileSync('c:/classificado/admin.html', html);
