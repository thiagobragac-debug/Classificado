const fs = require('fs');
let html = fs.readFileSync('c:/classificado/admin/verificacoes.html', 'utf8');

// Update fetchVerifications query
html = html.replace(/fetch\(\`\$\{ADM_SB_URL\}\/rest\/v1\/user_verifications\?select=\*,profiles\(name\)&order=submitted_at\.desc\`/,
                    "fetch(`${ADM_SB_URL}/rest/v1/profiles?select=id,name,kyc_status,kyc_doc_url,kyc_selfie_url,updated_at&kyc_status=in.(pending,approved,rejected)&order=updated_at.desc`");

// Update renderTable
const oldRenderTable = /function renderTable\(data\) \{[\s\S]*?return \`/s;
const newRenderTable = `function renderTable(data) {
    const tbody = document.getElementById('verifications-tbody');
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">Nenhuma solicitação encontrada.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(v => {
      let statusBadge = '';
      if (v.kyc_status === 'pending') statusBadge = '<span class="adm-badge adm-badge--amber">Pendente</span>';
      else if (v.kyc_status === 'approved') statusBadge = '<span class="adm-badge adm-badge--featured">Aprovado</span>';
      else statusBadge = '<span class="adm-badge" style="background:var(--adm-red);color:white">Rejeitado</span>';

      const userName = v.name || 'Usuário ' + v.id.substring(0,6);
      const dateStr = v.updated_at ? new Date(v.updated_at).toLocaleDateString('pt-BR') : '-';
      const typeStr = 'Identidade';

      return \``;

html = html.replace(oldRenderTable, newRenderTable);

// Update openVerif
const oldOpenVerif = /function openVerif\(id\) \{[\s\S]*?openModal\('modal-verif'\);\s*\}/s;
const newOpenVerif = `function openVerif(id) {
    const v = verificationsData.find(x => x.id === id);
    if (!v) return;

    document.getElementById('verif-id').value = v.id;
    document.getElementById('verif-user-id').value = v.id; // user_id is id for profiles
    document.getElementById('verif-user-name').textContent = v.name || 'Desconhecido';
    document.getElementById('verif-type').textContent = 'Identidade KYC';
    document.getElementById('verif-date').textContent = v.updated_at ? new Date(v.updated_at).toLocaleString('pt-BR') : '-';

    document.getElementById('verif-doc-img').src = v.kyc_doc_url || 'https://via.placeholder.com/300x200?text=Sem+Documento';
    document.getElementById('verif-doc-link').href = v.kyc_doc_url || '#';
    
    document.getElementById('verif-selfie-img').src = v.kyc_selfie_url || 'https://via.placeholder.com/150x150?text=Sem+Selfie';
    document.getElementById('verif-selfie-link').href = v.kyc_selfie_url || '#';

    document.getElementById('verif-notes').value = ''; // We removed admin_notes for now or didn't add it to profiles

    openModal('modal-verif');
  }`;

html = html.replace(oldOpenVerif, newOpenVerif);

// Update updateStatus
const oldUpdateStatus = /async function updateStatus\(newStatus\) \{[\s\S]*?\}\s*<\/script>/s;
const newUpdateStatus = `async function updateStatus(newStatus) {
    const id = document.getElementById('verif-id').value;

    const headers = {
      'apikey': ADM_SB_ANON,
      'Authorization': \`Bearer \${ADM_SB_ANON}\`,
      'Content-Type': 'application/json'
    };

    try {
      const btn = event.currentTarget;
      const originalText = btn.textContent;
      btn.textContent = 'Processando...';
      btn.disabled = true;

      // Update kyc_status on profiles table
      const res = await fetch(\`\${ADM_SB_URL}/rest/v1/profiles?id=eq.\${id}\`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ 
          kyc_status: newStatus
        })
      });
      if (!res.ok) throw new Error('Erro ao atualizar perfil do usuário');

      showToast(\`Verificação \${newStatus === 'approved' ? 'aprovada' : 'rejeitada'} com sucesso!\`, 'success');
      closeModal('modal-verif');
      fetchVerifications();

    } catch (e) {
      console.error(e);
      showToast('Erro ao processar solicitação.', 'error');
    }
  }
</script>`;

html = html.replace(oldUpdateStatus, newUpdateStatus);

fs.writeFileSync('c:/classificado/admin/verificacoes.html', html);
console.log('Verificacoes UI updated');
