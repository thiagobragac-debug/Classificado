const fs = require('fs');
let html = fs.readFileSync('c:/classificado/anuncio.html', 'utf8');

// 1. Video Support in Gallery
if(!html.includes('id="ad-video-container"')){
    html = html.replace(/<img src="https:\/\/images\.unsplash\.com\/photo-[^"]+" alt="Produto" class="gallery-main" id="ad-main-img">/,
      '<div id="ad-video-container" style="display:none; width:100%; height:100%; background:#000;"><video id="ad-main-video" controls style="width:100%; height:100%; object-fit:contain;"></video></div>\n          <img src="https://images.unsplash.com/photo-1592982537447-6f233481f9a2?auto=format&fit=crop&q=80" alt="Produto" class="gallery-main" id="ad-main-img">');
}

// 2. Banner Support in Seller Card
if(!html.includes('id="seller-banner"')){
    html = html.replace(/<div class="seller-card-mini">/,
      '<img id="seller-banner" src="" style="width:100%; height:80px; object-fit:cover; border-radius:1rem 1rem 0 0; display:none;">\n          <div class="seller-card-mini">');
}

// 3. Render logic in script
const renderLogicStart = `if (ad.profiles) {`;
const renderLogicReplace = `
        if(ad.video_url) {
            const vid = document.getElementById('ad-main-video');
            const vidCont = document.getElementById('ad-video-container');
            const mainImg = document.getElementById('ad-main-img');
            if(vid && vidCont) {
                vid.src = ad.video_url;
                vidCont.style.display = 'block';
                mainImg.style.display = 'none';
            }
        }
        if (ad.profiles) {
            const bannerImg = document.getElementById('seller-banner');
            if(bannerImg && ad.profiles.banner_url) {
                bannerImg.src = ad.profiles.banner_url;
                bannerImg.style.display = 'block';
                // Adjust border radius of seller-card-mini
                const sellerCard = document.querySelector('.seller-card-mini');
                if(sellerCard) {
                    sellerCard.style.borderRadius = '0 0 1rem 1rem';
                }
            }
`;

if(html.includes(renderLogicStart) && !html.includes('ad.video_url')) {
    html = html.replace(renderLogicStart, renderLogicReplace);
}

fs.writeFileSync('c:/classificado/anuncio.html', html);
