const fs = require('fs');
let html = fs.readFileSync('c:/classificado/painel.html', 'utf8');

// Add button to sidebar
const profileBtnRegex = /(<button id=\"tab-profile\".*?<\/button>)/s;
html = html.replace(profileBtnRegex, `$1
        <button id=\"tab-verification\" onclick=\"switchTab('verification')\" style=\"display:flex;align-items:center;gap:.7rem;padding:.75rem 1rem;border-radius:.75rem;font-size:.9rem;font-weight:600;color:#64748b;cursor:pointer;border:none;background:transparent;width:100%;text-align:left;margin-bottom:.25rem;transition:background .15s,color .15s\">
          <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z\"></path></svg>
          Verificação KYC
        </button>`);

// Add panel section
const verificationPanel = `
      <!-- TAB 5: VERIFICATION -->
      <div id="panel-verification" style="display:none">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem">
          <h2 style="font-size:1.5rem;font-weight:800;color:var(--clr-text);letter-spacing:-.02em">Central de Verificação</h2>
        </div>
        <div style="background:#fff;border-radius:1rem;border:1px solid #e2e8f0;padding:2rem">
          <p style="color:var(--clr-text-muted);margin-bottom:2rem">Complete as verificações abaixo para ganhar o selo de Vendedor Ouro e aumentar suas vendas.</p>
          
          <div style="display:flex;gap:1.5rem;flex-direction:column">
            <!-- EMAIL -->
            <div style="display:flex;align-items:flex-start;gap:1rem;padding:1.5rem;border:1px solid #e2e8f0;border-radius:.75rem">
              <div style="background:#ecfdf5;padding:.75rem;border-radius:50%" id="icon-verify-email">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              </div>
              <div style="flex:1">
                <h3 style="font-weight:700;margin-bottom:.25rem">E-mail</h3>
                <p style="color:#64748b;font-size:.9rem;margin-bottom:1rem">Verifique seu endereço de e-mail para receber notificações e contatos.</p>
                <div id="kyc-email-status">Carregando...</div>
              </div>
            </div>

            <!-- WHATSAPP -->
            <div style="display:flex;align-items:flex-start;gap:1rem;padding:1.5rem;border:1px solid #e2e8f0;border-radius:.75rem">
              <div style="background:#ecfdf5;padding:.75rem;border-radius:50%" id="icon-verify-phone">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
              </div>
              <div style="flex:1">
                <h3 style="font-weight:700;margin-bottom:.25rem">WhatsApp</h3>
                <p style="color:#64748b;font-size:.9rem;margin-bottom:1rem">Confirme seu WhatsApp para que os compradores confiem em você.</p>
                <div id="kyc-phone-status">Carregando...</div>
              </div>
            </div>

            <!-- IDENTIDADE -->
            <div style="display:flex;align-items:flex-start;gap:1rem;padding:1.5rem;border:1px solid #e2e8f0;border-radius:.75rem">
              <div style="background:#ecfdf5;padding:.75rem;border-radius:50%" id="icon-verify-doc">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              </div>
              <div style="flex:1">
                <h3 style="font-weight:700;margin-bottom:.25rem">Identidade (Selo Ouro)</h3>
                <p style="color:#64748b;font-size:.9rem;margin-bottom:1rem">Envie seu RG/CNH e uma selfie para ganhar o selo de vendedor verificado.</p>
                <div id="kyc-doc-status">Carregando...</div>
              </div>
            </div>

          </div>
        </div>
      </div>
`;
// Replace using a marker
html = html.replace(/<div id="toast"/, verificationPanel + '\n      <div id="toast"');

// Update TABS array
html = html.replace(/const TABS=\['ads','messages','favorites','profile'\];/, "const TABS=['ads','messages','favorites','profile','verification'];");

// Update loadTab function
html = html.replace(/if\(tab==='profile'\)loadProfile\(\);/, "if(tab==='profile')loadProfile();\n    if(tab==='verification')loadVerification();");

fs.writeFileSync('c:/classificado/painel.html', html);
console.log('Painel UI updated');
