window.addEventListener('error', function(e) { const b = document.getElementById('global-error-banner'); if(b) { b.style.display = 'block'; b.innerHTML += e.message + '<br>'; } }); window.addEventListener('unhandledrejection', function(e) { const b = document.getElementById('global-error-banner'); if(b) { b.style.display = 'block'; b.innerHTML += e.reason + '<br>'; } });


  renderSidebar('/admin/leiloes.html');

  // File Upload Handlers
  function handleFileUpload(inputId, hiddenId) {
    const input = document.getElementById(inputId);
    input.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if(!file) {
        document.getElementById(hiddenId).value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = function(evt) {
        document.getElementById(hiddenId).value = evt.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  handleFileUpload('auCover', 'auCoverBase64');
  handleFileUpload('auCatalog', 'auCatalogBase64');
  handleFileUpload('lotImage', 'lotImageBase64');

  function generateId() { return Date.now().toString(36) + Math.random().toString(36).substring(2); }

  function seedMockData() {
  let auctions = [];
  let lots = [];
  let currentAuctionId = null;

  function formatDate(isoString) {
    if(!isoString) return '--';
    const d = new Date(isoString);
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
  }

  function getStatusBadge(status) {
    if(status === 'aovivo') return '<span class="status-badge status-aovivo">Ao Vivo</span>';
    if(status === 'finalizado') return '<span class="status-badge status-finalizado">Finalizado</span>';
    return '<span class="status-badge status-agendado">Agendado</span>';
  }

  function renderAuctions() {
    const tbody = document.getElementById('auctions-tbody');
    tbody.innerHTML = '';
    
    if(auctions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 3rem; color: var(--adm-text-muted);">Nenhum leilão cadastrado.</td></tr>`;
      return;
    }

    auctions.forEach(au => {
      const auLots = lots.filter(l => l.auctionId === au.id).length;
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="font-weight:600; color:white;">${au.title}</div>
        </td>
        <td style="color:var(--adm-text-muted)">${formatDate(au.date)}</td>
        <td>${getStatusBadge(au.status)}</td>
        <td><span style="background:rgba(255,255,255,0.1); padding: 0.2rem 0.6rem; border-radius: 1rem; font-size: 0.8rem;">${auLots} lotes</span></td>
        <td style="text-align:right">
          <button class="adm-btn adm-btn--outline" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; margin-right: 0.5rem;" onclick="openLotsModal('${au.id}')">Gerenciar Lotes</button>
          <button class="adm-btn adm-btn--outline" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; border-color: rgba(239,68,68,0.3); color: #ef4444;" onclick="editAuction('${au.id}')">Editar</button>
          <button class="adm-btn adm-btn--outline" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; border-color: rgba(239,68,68,0.3); color: #ef4444;" onclick="deleteAuction('${au.id}')">Excluir</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Modals
  function openAuctionModal() {
    document.getElementById('auctionForm').reset();
    document.getElementById('auId').value = '';
    document.getElementById('auCoverBase64').value = '';
    document.getElementById('auCatalogBase64').value = '';
    document.getElementById('auAcceptsBids').checked = true;
    document.getElementById('auctionModalTitle').innerText = 'Novo Leilão';
    document.getElementById('auctionModal').classList.add('open');
  }

  function editAuction(id) {
    const a = auctions.find(au => au.id === id);
    if (!a) return;
    document.getElementById('auId').value = a.id;
    document.getElementById('auTitle').value = a.title || '';
    // Format date string to match datetime-local input YYYY-MM-DDThh:mm
    let localDate = '';
    if (a.date) {
      const d = new Date(a.date);
      localDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    }
    document.getElementById('auDate').value = localDate;
    document.getElementById('auStatus').value = a.status || 'agendado';
    document.getElementById('auYt').value = a.youtube || '';
    document.getElementById('auCoverBase64').value = a.cover || '';
    document.getElementById('auCatalogBase64').value = a.catalog || '';
    document.getElementById('auMinBid').value = a.minBid || '';
    document.getElementById('auStep').value = a.step || '';
    document.getElementById('auComm').value = a.commission || '';
    document.getElementById('auAcceptsBids').checked = a.acceptsBids !== false;

    document.getElementById('auctionModalTitle').innerText = 'Editar Leilão';
    document.getElementById('auctionModal').classList.add('open');
  }

  async function saveAuction() {
    const id = document.getElementById('auId').value;
    const au = {
      title: document.getElementById('auTitle').value,
      date: document.getElementById('auDate').value ? new Date(document.getElementById('auDate').value).toISOString() : null,
      status: document.getElementById('auStatus').value,
      youtube: document.getElementById('auYt').value,
      cover: document.getElementById('auCoverBase64').value,
      catalog: document.getElementById('auCatalogBase64').value,
      min_bid: parseFloat(document.getElementById('auMinBid').value) || 0,
      step: parseFloat(document.getElementById('auStep').value) || 0,
      commission: parseFloat(document.getElementById('auComm').value) || 0,
      accepts_bids: document.getElementById('auAcceptsBids').checked
    };

    if(!au.title || !au.date) {
      showToast('Preencha os campos obrigatórios', 'error');
      return;
    }

    try {
      const session = JSON.parse(sessionStorage.getItem('tc_admin_session') || '{}');
      const headers = { 'apikey': ADM_SB_ANON, 'Authorization': `Bearer ${session.token || ADM_SB_ANON}`, 'Content-Type': 'application/json' };
      
      let res;
      if (id) {
         res = await fetch(`${ADM_SB_URL}/rest/v1/auction_events?id=eq.${id}`, { method: 'PATCH', headers, body: JSON.stringify(au) });
      } else {
         res = await fetch(`${ADM_SB_URL}/rest/v1/auction_events`, { method: 'POST', headers, body: JSON.stringify(au) });
      }
      
      if (!res.ok) throw new Error('Erro ao salvar');
      closeModal('auctionModal');
      showToast('Leilão salvo com sucesso!', 'success');
      fetchAndRenderAuctions();
    } catch (e) {
      console.error(e);
      showToast('Erro ao salvar no banco', 'error');
    }
  }

  async function deleteAuction(id) {
    if(!(await admConfirm('Tem certeza que deseja excluir este evento? Todos os lotes associados também serão removidos.'))) return;
    try {
      const session = JSON.parse(sessionStorage.getItem('tc_admin_session') || '{}');
      const headers = { 'apikey': ADM_SB_ANON, 'Authorization': `Bearer ${session.token || ADM_SB_ANON}` };
      await fetch(`${ADM_SB_URL}/rest/v1/auction_events?id=eq.${id}`, { method: 'DELETE', headers });
      showToast('Leilão removido', 'info');
      fetchAndRenderAuctions();
    } catch (e) {
      console.warn('Erro ao excluir no banco', e);
      showToast('Erro ao excluir', 'error');
    }
  }

  // Lots Management
  function openLotsModal(auctionId) {
    currentAuctionId = auctionId;
    const au = auctions.find(a => a.id === auctionId);
    document.getElementById('lotsEventTitle').innerText = au.title;
    
    document.getElementById('lotMinBid').value = au.minBid || '';
    document.getElementById('lotNumber').value = String(lots.filter(l => l.auctionId === auctionId).length + 1).padStart(2, '0');
    document.getElementById('lotTitle').value = '';
    document.getElementById('lotImage').value = '';
    document.getElementById('lotImageBase64').value = '';
    document.getElementById('lotVideo').value = '';
    document.getElementById('lotSire').value = '';
    document.getElementById('lotDam').value = '';
    document.getElementById('lotDesc').value = '';

    renderLots();
    document.getElementById('lotsModal').classList.add('open');
  }

  function renderLots() {
    const tbody = document.getElementById('lots-tbody');
    tbody.innerHTML = '';
    
    const auLots = lots.filter(l => l.auctionId === currentAuctionId).sort((a,b) => a.number.localeCompare(b.number));

    if(auLots.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem; color: var(--adm-text-muted);">Nenhum lote adicionado a este evento.</td></tr>`;
      return;
    }

    auLots.forEach(lot => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 700; color: white;">#${lot.number}</td>
        <td>${lot.title}</td>
        <td>R$ ${parseFloat(lot.minBid || 0).toLocaleString('pt-BR')}</td>
        <td style="text-align:right">
          <button class="adm-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background: transparent; color: #ef4444;" onclick="deleteLot('${lot.id}')">X Remover</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  window.addLot = async function() {
    const lot = {
      auction_id: currentAuctionId,
      lot_number: document.getElementById('lotNumber').value,
      title: document.getElementById('lotTitle').value,
      min_bid: parseFloat(document.getElementById('lotMinBid').value) || 0,
      image: document.getElementById('lotImageBase64').value,
      video: document.getElementById('lotVideo').value,
      sire: document.getElementById('lotSire').value,
      dam: document.getElementById('lotDam').value,
      description: document.getElementById('lotDesc').value
    };

    if (!lot.lot_number || !lot.title) {
      showToast('Preencha os campos obrigatórios do lote.', 'error');
      return;
    }

    try {
      const session = JSON.parse(sessionStorage.getItem('tc_admin_session') || '{}');
      const headers = { 'apikey': ADM_SB_ANON, 'Authorization': `Bearer ${session.token || ADM_SB_ANON}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${ADM_SB_URL}/rest/v1/auction_lots`, { method: 'POST', headers, body: JSON.stringify(lot) });
      if (!res.ok) throw new Error('Erro');
      showToast('Lote adicionado', 'success');
      
      document.getElementById('lotTitle').value = '';
      document.getElementById('lotImage').value = '';
      document.getElementById('lotImageBase64').value = '';
      document.getElementById('lotVideo').value = '';
      document.getElementById('lotSire').value = '';
      document.getElementById('lotDam').value = '';
      document.getElementById('lotDesc').value = '';
      
      fetchAndRenderAuctions();
    } catch(e) {
      showToast('Erro ao salvar lote', 'error');
    }
  }

  window.deleteLot = async function(id) {
    if(!(await admConfirm('Deseja excluir este lote?'))) return;
    try {
      const session = JSON.parse(sessionStorage.getItem('tc_admin_session') || '{}');
      const headers = { 'apikey': ADM_SB_ANON, 'Authorization': `Bearer ${session.token || ADM_SB_ANON}` };
      await fetch(`${ADM_SB_URL}/rest/v1/auction_lots?id=eq.${id}`, { method: 'DELETE', headers });
      fetchAndRenderAuctions();
    } catch(e) {
      showToast('Erro ao remover lote', 'error');
    }
  }

  async function fetchAndRenderAuctions() {
    const headers = { 'apikey': ADM_SB_ANON, 'Authorization': `Bearer ${ADM_SB_ANON}` };
    try {
      const resAuctions = await fetch(`${ADM_SB_URL}/rest/v1/auction_events?order=date.asc`, { headers });
      if (resAuctions.ok) {
        const data = await resAuctions.json();
        auctions = data.map(au => ({
          id: au.id, title: au.title, date: au.date, status: au.status, youtube: au.youtube,
          cover: au.cover, catalog: au.catalog, minBid: au.min_bid, step: au.step, commission: au.commission, acceptsBids: au.accepts_bids
        }));
      }
      const resLots = await fetch(`${ADM_SB_URL}/rest/v1/auction_lots?order=lot_number.asc`, { headers });
      if (resLots.ok) {
        const ldata = await resLots.json();
        lots = ldata.map(l => ({
          id: l.id, auctionId: l.auction_id, number: l.lot_number, title: l.title, minBid: l.min_bid,
          image: l.image, video: l.video, sire: l.sire, dam: l.dam, description: l.description
        }));
      }
      renderAuctions();
      if (document.getElementById('lotsModal').classList.contains('open')) {
        renderLots();
      }
    } catch (err) {
      console.warn('Erro ao buscar dados:', err);
    }
  }

  fetchAndRenderAuctions();
