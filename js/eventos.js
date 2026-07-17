// ───────────────────────────────────────────────────────────────
// EVENTOS JS
// Localização, filtro geo via RPC e Modal de Eventos
// ───────────────────────────────────────────────────────────────

// Utilitário de escape XSS — reutiliza o global de main.js se disponível
function _esc(str) {
  if (typeof escapeHTML === 'function') return escapeHTML(str || '');
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Haversine local — usado apenas como fallback quando a RPC get_events_near falha
function _haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Estado de módulo — sem poluir window.*
let _realEvents = [];

document.addEventListener('DOMContentLoaded', async () => {
  const featuredGrid   = document.getElementById('featured-events-grid');
  const localGrid      = document.getElementById('local-events-grid');
  const locationPrompt = document.getElementById('location-prompt');
  const locationBanner = document.getElementById('location-banner');
  const btnAllowGps    = document.getElementById('btn-allow-gps');
  const btnManualLoc   = document.getElementById('btn-manual-loc');
  const inputManual    = document.getElementById('manual-location');
  const btnChangeLoc   = document.getElementById('btn-change-location');
  const userCityName   = document.getElementById('user-city-name');
  const noLocalEvents  = document.getElementById('no-local-events');

  // AbortController para limpeza de listeners globais
  const ac = new AbortController();
  const { signal } = ac;

  // Busca eventos do banco (só futuros, limit 200)
  if (typeof fetchEventsFromDB === 'function') {
    const rawEvents = await fetchEventsFromDB();
    _realEvents = rawEvents.map(e => ({ ...e, locationStr: e.location_str || '' }));
  }

  // Renderiza destaques imediatamente (sem localização)
  renderEvents(_realEvents.filter(e => e.featured), featuredGrid);

  // ─ GPS ──────────────────────────────────────────────────────────────
  btnAllowGps.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      alert('Seu navegador não suporta GPS.');
      return;
    }
    const originalHtml = btnAllowGps.innerHTML;
    btnAllowGps.innerHTML = '<span style="font-size:0.8rem;">...</span>';

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        // Feedback imediato na tela antes de ter o nome da cidade
        showLocalEvents(lat, lng, 'Buscando cidade...');
        btnAllowGps.innerHTML = originalHtml;

        // Reverse-geocoding via Nominatim
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt`);
          if (res.ok) {
            const geo = await res.json();
            if (geo?.address) {
              const city  = geo.address.city || geo.address.town || geo.address.village;
              const state = geo.address.state || '';
              if (city) {
                const locationName = state ? `${city}, ${state}` : city;
                document.getElementById('user-city-name').textContent = locationName;
              }
            }
          }
        } catch (e) {

          console.warn('[eventos] reverse-geo falhou:', e.message);
          document.getElementById('user-city-name').textContent = 'Localização GPS';
        }
      },
      (error) => {
        console.error('[eventos] GPS error:', error);
        alert('Não foi possível obter sua localização. Tente digitar a cidade.');
        btnAllowGps.innerHTML = originalHtml;
      }
    );
  });

  // ─ Autocomplete de cidade ──────────────────────────────────────────
  let searchTimeout;
  let searchAbortController = null;
  const autocompleteBox = document.getElementById('autocomplete-results');
  document.body.appendChild(autocompleteBox); // foge do overflow:hidden do hero

  inputManual.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(searchTimeout);
    if (searchAbortController) searchAbortController.abort();
    if (query.length < 3) { autocompleteBox.style.display = 'none'; return; }

    searchAbortController = new AbortController();
    const signal = searchAbortController.signal;

    searchTimeout = setTimeout(async () => {
      try {
        const lang = localStorage.getItem('tc_lang') || 'pt';
        const allowedCountries = lang === 'pt'
          ? ['BR']
          : ['AR','UY','PY','CL','CO','PE','BO','VE','EC'];

        // Photon API para autocomplete de cidades
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&osm_tag=place:city&osm_tag=place:municipality&osm_tag=place:town&limit=5`,
          { signal }
        );
        if (!res.ok) throw new Error('Photon indisponível');
        const rawData = await res.json();

        const data = (rawData.features || [])
          .filter(f => allowedCountries.includes(f.properties.countrycode))
          .slice(0, 5);

        if (data.length > 0) {
          autocompleteBox.innerHTML = '';
          data.forEach(feature => {
            const place = feature.properties;
            const city  = _esc(place.name);
            const state = _esc(place.state || place.country || '');

            const div = document.createElement('div');
            div.style.cssText = 'padding:12px 16px;cursor:pointer;border-bottom:1px solid #f3f4f6;color:#333;font-size:0.9rem;';
            div.innerHTML = `<strong>${city}</strong> <span style="color:#6b7280;font-size:0.8rem">${state}</span>`;
            div.addEventListener('mouseenter', () => { div.style.backgroundColor = '#f9fafb'; });
            div.addEventListener('mouseleave', () => { div.style.backgroundColor = 'transparent'; });
            div.addEventListener('click', () => {
              inputManual.value = `${place.name}${place.state ? ', ' + place.state : ''}`;
              autocompleteBox.style.display = 'none';
              const [lon, lat] = feature.geometry.coordinates;
              showLocalEvents(lat, lon, inputManual.value);
            });
            autocompleteBox.appendChild(div);
          });
          positionAutocomplete();
          autocompleteBox.style.display = 'block';
        } else {
          autocompleteBox.style.display = 'none';
        }
      } catch (err) {
        console.warn('[eventos] autocomplete erro:', err.message);
        autocompleteBox.style.display = 'none';
      }
    }, 500);
  });

  function positionAutocomplete() {
    const rect = document.getElementById('location-prompt').getBoundingClientRect();
    autocompleteBox.style.width  = rect.width + 'px';
    autocompleteBox.style.top    = (rect.bottom + window.scrollY + 8) + 'px';
    autocompleteBox.style.left   = (rect.left + window.scrollX) + 'px';
  }

  // Listeners globais com AbortController para limpeza automática
  window.addEventListener('resize', () => {
    if (autocompleteBox.style.display === 'block') positionAutocomplete();
  }, { signal });

  document.addEventListener('click', (e) => {
    const prompt = document.getElementById('location-prompt');
    if (!prompt?.contains(e.target) && !autocompleteBox.contains(e.target)) {
      autocompleteBox.style.display = 'none';
    }
  }, { signal });

  // Botão manual — instrui o usuário sem alert bloqueante
  btnManualLoc.addEventListener('click', () => {
    inputManual.focus();
    inputManual.placeholder = 'Digite e selecione uma cidade da lista...';
  });

  btnChangeLoc.addEventListener('click', () => {
    locationBanner.style.display = 'none';
    localGrid.innerHTML = '';
    noLocalEvents.style.display = 'none';
    locationPrompt.style.display = 'flex';
    document.getElementById('section-featured').style.display = 'block';
    document.getElementById('section-local').style.display = 'none';
  });

  // ─ showLocalEvents — usa RPC get_events_near (Haversine no banco) ──────────
  async function showLocalEvents(userLat, userLng, locationName) {
    locationPrompt.style.display = 'none';
    locationBanner.style.display = 'flex';
    userCityName.textContent = locationName;
    document.getElementById('section-featured').style.display = 'none';
    document.getElementById('section-local').style.display = 'block';

    let local = null;

    // Tenta RPC primeiro (Haversine no banco)
    if (typeof getEventsNear === 'function') {
      local = await getEventsNear(userLat, userLng, 100);
    }

    // Fallback: Haversine local se RPC não estiver disponível ou falhar
    if (local === null) {
      local = _realEvents
        .filter(ev => ev.lat != null && ev.lng != null)
        .map(ev => ({ ...ev, distance_km: _haversine(userLat, userLng, ev.lat, ev.lng) }))
        .filter(ev => ev.distance_km <= 100)
        .sort((a, b) => a.distance_km - b.distance_km);
    }

    if (local.length > 0) {
      noLocalEvents.style.display = 'none';
      renderEvents(local, localGrid, true);
    } else {
      localGrid.innerHTML = '';
      noLocalEvents.style.display = 'block';
    }
  }

  // ─ renderEvents — com escapeHTML para prevenir XSS ──────────────────────
  function renderEvents(events, container, showDistance = false) {
    container.innerHTML = '';
    events.forEach(ev => {
      const card = document.createElement('div');
      card.className = 'event-card';
      card.onclick = () => openEventModal(ev);

      const distHtml = showDistance && ev.distance_km != null
        ? `<div class="event-dist-badge"><span style="color:var(--clr-text-light);font-size:0.8rem">Distância:</span><span class="dist-text">${Number(ev.distance_km).toFixed(1)} km daqui</span></div>`
        : '';

      // Todos os campos do banco passam por _esc() para prevenir XSS
      card.innerHTML = `
        <img src="${_esc(ev.image)}" alt="${_esc(ev.title)}" class="event-card-img">
        <div class="event-card-body">
          ${ev.featured ? '<span class="event-card-tag">Destaque Oficial</span>' : ''}
          <h3 class="event-card-title">${_esc(ev.title)}</h3>
          <div class="event-card-info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            ${_esc(ev.date)}
          </div>
          <div class="event-card-info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            ${_esc(ev.locationStr || ev.location_str || '')}
          </div>
          ${distHtml}
        </div>
      `;
      container.appendChild(card);
    });
  }

  // ─ MODAL ──────────────────────────────────────────────────────────────────
  const modal        = document.getElementById('event-modal');
  const modalCloseBtn = document.getElementById('modal-close');
  const modalBody    = document.getElementById('modal-event-body');

  function openEventModal(ev) {
    // Todos os campos do banco passam por _esc() para prevenir XSS
    // O link usa atributo href separado (não via innerHTML) para segurança extra
    modalBody.innerHTML = `
      <img src="${_esc(ev.image)}" class="modal-cover" alt="Capa">
      <div class="modal-body-content">
        ${ev.featured ? '<span class="event-card-tag">Destaque Oficial</span>' : ''}
        <h2 class="modal-title">${_esc(ev.title)}</h2>
        <div class="modal-meta">
          <div class="modal-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <span><strong>Data:</strong> ${_esc(ev.date)}</span>
          </div>
          <div class="modal-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span><strong>Local:</strong> ${_esc(ev.locationStr || ev.location_str || '')}</span>
          </div>
          <div class="modal-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            <span><strong>Organização:</strong> ${_esc(ev.organizer)}</span>
          </div>
        </div>
        <p style="color:var(--clr-text-light); line-height: 1.6;">
          Participe deste grande evento do setor agropecuário. Venha fazer negócios, assistir leilões, conferir inovações tecnológicas em máquinas e estar próximo aos maiores criadores do Brasil.
        </p>
        <div class="modal-actions" id="modal-link-container">
        </div>
      </div>
    `;
    // Link criado via DOM (não via innerHTML) para segurança extra contra XSS em URLs
    const linkContainer = document.getElementById('modal-link-container');
    if (linkContainer && ev.link) {
      const a = document.createElement('a');
      a.href   = ev.link;
      a.target = '_blank';
      a.rel    = 'noopener noreferrer';
      a.className = 'btn btn--primary';
      a.style.cssText = 'flex:1;justify-content:center;display:flex;';
      a.textContent = 'Acessar Site Oficial';
      linkContainer.appendChild(a);
    }
    modal.classList.add('active');
  }

  modalCloseBtn.addEventListener('click', () => modal.classList.remove('active'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

  // Limpa listeners globais ao desmontar (navegação SPA ou hot-reload)
  window.addEventListener('beforeunload', () => ac.abort(), { once: true });
});

