import re

with open(r'c:\classificado\anuncio.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Add CSS link
if 'css/anuncio.css' not in html:
    html = html.replace('<link rel="stylesheet" href="css/style.css">', '<link rel="stylesheet" href="css/style.css">\n  <link rel="stylesheet" href="css/anuncio.css">')

# Update the product-grid block
match = re.search(r'(<div class="product-grid">)(.*?)(</main>)', html, re.DOTALL)
if match:
    new_grid = '''
    <div class="product-grid">
      <!-- Gallery Column -->
      <div class="product-gallery-area">
        <div class="gallery-main-wrapper">
          <img src="https://images.unsplash.com/photo-1592982537447-6f233481f9a2?auto=format&fit=crop&q=80" alt="Produto" class="gallery-main" id="ad-main-img">
        </div>
        <div class="gallery-thumbs" id="ad-thumbs-container">
          <!-- Dynamically populated -->
        </div>

        <div class="details-section">
          <h3>Descrição do Vendedor</h3>
          <p class="desc-text" id="ad-desc"></p>
        </div>
      </div>

      <!-- Info Column (Sticky) -->
      <div>
        <div class="product-info-panel">
          <div class="product-meta-top">
            <span class="tag-status" id="ad-condition">Condição: Usado</span>
            <span class="tag-date" id="ad-date">Publicado há 2 dias</span>
          </div>

          <h1 id="ad-title" class="product-title">Carregando...</h1>
          
          <div class="product-price" id="ad-price">
            R$ --
            <span class="tag-negotiable" id="ad-negotiable" style="display:none;">Negociável</span>
          </div>

          <div style="font-size:0.95rem; color:var(--clr-text-light); margin-top:-0.5rem;" id="ad-location">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-top:-2px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> <span>---</span>
          </div>

          <div class="seller-card-mini">
            <div class="seller-avatar-lg" id="seller-avatar">U</div>
            <div>
              <div class="seller-name" id="seller-name">Vendedor</div>
              <div class="seller-member" id="seller-date">Membro</div>
            </div>
          </div>

          <div class="action-column" style="display:flex; flex-direction:column; gap:0.8rem;">
            <a id="btn-whatsapp" href="#" target="_blank" class="btn-whatsapp-large" style="display:none;">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.413A9.953 9.953 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.95 7.95 0 0 1-4.031-1.094l-.29-.172-2.953.839.84-2.87-.19-.298A7.95 7.95 0 0 1 4 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z"/></svg>
              Falar pelo WhatsApp
            </a>
            
            <div class="action-row">
              <button onclick="shareOnWhatsApp()" class="btn-secondary-large" style="flex:1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Compartilhar
              </button>
              <button id="btn-favorite" class="btn-secondary-large" style="flex:1" title="Salvar anúncio">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                Salvar
              </button>
            </div>
            
            <div id="msg-section" style="margin-top:0.5rem; background:rgba(0,0,0,0.02); border:1px solid rgba(0,0,0,0.06); border-radius:1rem; overflow:hidden;">
              <button id="btn-toggle-msg"
                      style="width:100%; display:flex; align-items:center; justify-content:space-between; padding:1.1rem; background:none; border:none; color:var(--clr-text); font-weight:700; font-size:1.05rem; cursor:pointer;"
                      onclick="(function(){
                        var body=document.getElementById('msg-body');
                        var arrow=document.getElementById('msg-arrow');
                        var open=body.style.display==='block';
                        body.style.display=open?'none':'block';
                        arrow.style.transform=open?'rotate(0deg)':'rotate(180deg)';
                      })()">
                <span style="display:flex;align-items:center;gap:0.5rem;">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Enviar Mensagem
                </span>
                <svg id="msg-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .25s;"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div id="msg-body" style="display:none; padding:0 1.1rem 1.1rem;">
                <div id="msg-alert" style="display:none; margin-bottom:0.75rem; padding:0.65rem 0.85rem; border-radius:0.6rem; font-size:0.88rem;"></div>
                <textarea id="msg-text"
                          rows="4"
                          placeholder="Olá! Tenho interesse no anúncio..."
                          style="width:100%; box-sizing:border-box; background:white; border:1px solid rgba(0,0,0,0.12); border-radius:0.7rem; color:var(--clr-text); padding:0.75rem 0.9rem; font-size:0.95rem; resize:vertical; outline:none; transition:border-color .2s;"
                          onfocus="this.style.borderColor='var(--clr-primary)'; this.style.boxShadow='0 0 0 2px rgba(22,163,74,0.1)'"
                          onblur="this.style.borderColor='rgba(0,0,0,0.12)'; this.style.boxShadow='none'"></textarea>
                <button id="btn-send-msg"
                        style="margin-top:0.65rem; width:100%; padding:0.75rem; border:none; border-radius:0.75rem; background:linear-gradient(135deg,var(--clr-primary-mid),var(--clr-primary)); color:#fff; font-weight:700; font-size:0.97rem; cursor:pointer; transition:opacity .2s;"
                        onmouseover="this.style.opacity='.88'" onmouseout="this.style.opacity='1'">
                  Enviar Mensagem
                </button>
              </div>
            </div>
            
            <div style="text-align:center; margin-top:0.5rem;">
              <a id="btn-report" href="#" style="color:var(--clr-text-light); font-size:0.85rem; text-decoration:none;"
                 onclick="(function(e){
                   e.preventDefault();
                   var reason=prompt('Motivo da denúncia (ex: Fraude, Conteúdo inadequado, Preço enganoso):');
                   if(!reason||!reason.trim()) return;
                   var adId=document.getElementById('btn-send-msg').dataset.adId;
                   if(typeof reportAd==='function' && adId){
                     reportAd(adId, reason.trim()).then(function(){
                       alert('Denúncia enviada. Obrigado!');
                     }).catch(function(err){
                       alert('Erro ao enviar denúncia: '+(err.message||err));
                     });
                   } else {
                     alert('Não foi possível enviar a denúncia. Tente novamente.');
                   }
                 })(event)">⚠ Denunciar Anúncio</a>
            </div>

          </div>
        </div>
      </div>
    </div>
    
    <!-- BANNER ANUNCIO SIDEBAR -->
    <div id="banner-anuncio-sidebar" style="margin-top: 2rem;"></div>
    
</main>'''
    html = html[:match.start()] + new_grid + html[match.end(3):]
    
    with open(r'c:\classificado\anuncio.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print('Updated HTML successfully.')
else:
    print('Failed to find match')
