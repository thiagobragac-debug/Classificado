import sys
with open('painel.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add currentAdsPage variable globally if not exists
if 'let currentAdsPage = 1;' not in content:
    content = content.replace('let _myAds=[];', 'let _myAds=[];\n  let currentAdsPage = 1;')

# 2. Update onchange for the select
content = content.replace('onchange="renderAds()"', 'onchange="currentAdsPage=1;renderAds()"')

# 3. Add changeAdsPage function
if 'window.changeAdsPage =' not in content:
    changeAdsPage_fn = '''
    window.changeAdsPage = function(dir) {
      currentAdsPage += dir;
      renderAds();
      window.scrollTo({top: 0, behavior: 'smooth'});
    };
    '''
    content = content.replace('window.scrollSimilarAds = function', changeAdsPage_fn + '\n    window.scrollSimilarAds = function')

# 4. Modify renderAds slicing and paginationHtml
if 'const pagedAds =' not in content:
    old_line = '''c.innerHTML = analyticsHtml + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:1.5rem;padding:0 0 1.5rem 0">' + filteredAds.map(renderAdCard).join('') + '</div>';'''
    
    new_block = '''
    const itemsPerPage = 12;
    const totalPages = Math.ceil(filteredAds.length / itemsPerPage);
    if (currentAdsPage > totalPages && totalPages > 0) currentAdsPage = totalPages;
    const pagedAds = filteredAds.slice((currentAdsPage - 1) * itemsPerPage, currentAdsPage * itemsPerPage);

    let paginationHtml = '';
    if (totalPages > 1) {
        paginationHtml = <div style="display:flex;align-items:center;justify-content:center;gap:1rem;margin-top:1.5rem;padding-top:1.5rem;border-top:1px solid #f1f5f9">
            <button onclick="changeAdsPage(-1)" style="padding:0.6rem 1rem;border-radius:0.5rem;border:1px solid #e2e8f0;background:;color:;font-weight:600;cursor:" >Anterior</button>
            <span style="font-size:0.9rem;font-weight:600;color:#64748b">Página  de </span>
            <button onclick="changeAdsPage(1)" style="padding:0.6rem 1rem;border-radius:0.5rem;border:1px solid #e2e8f0;background:;color:;font-weight:600;cursor:" >Próxima</button>
        </div>;
    }

    c.innerHTML = analyticsHtml + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:1.5rem;padding:0 0 1.5rem 0">' + pagedAds.map(renderAdCard).join('') + '</div>' + paginationHtml;
    '''
    content = content.replace(old_line, new_block)

with open('painel.html', 'w', encoding='utf-8') as f:
    f.write(content)
