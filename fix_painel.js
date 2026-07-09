const fs = require('fs');
let html = fs.readFileSync('c:/classificado/painel.html', 'utf8');

// 1. Move panel-verification inside p-content
// Extract panel-verification
const panelVerifMatch = html.match(/(<!-- TAB 5: VERIFICATION -->\s*<div id="panel-verification".*?)(?=\s*<div id="toast")/s);
if (panelVerifMatch) {
  let panelHTML = panelVerifMatch[1];
  
  // Add p-panel class to panel-verification
  panelHTML = panelHTML.replace('<div id="panel-verification" style="display:none">', '<div id="panel-verification" class="p-panel" style="display:none">');

  // Remove the old panel-verification from its place
  html = html.replace(panelVerifMatch[1], '');
  
  // Insert it before the closing of p-content
  // The structure is:
  //           </form>
  //         </div>
  //       </div>
  //
  //     </div>
  //   </div><!-- /painel-wrap -->
  // 
  // We want to insert it right before the second to last </div> which is the end of p-content.
  const targetInsertion = /<\/form>\s*<\/div>\s*<\/div>\s*<\/div>/;
  html = html.replace(targetInsertion, match => {
    return `</form>
        </div>
      </div>
${panelHTML}
    </div>`;
  });
}

// 2. Add loadVerification() to loadTab
const loadTabRegex = /if\(tab==='favorites'\)loadFavorites\(\);/;
html = html.replace(loadTabRegex, `if(tab==='favorites')loadFavorites();
    if(tab==='verification')loadVerification();`);

fs.writeFileSync('c:/classificado/painel.html', html);
console.log('Painel UI fixes applied');
