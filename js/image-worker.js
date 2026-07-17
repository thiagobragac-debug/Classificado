self.onmessage = async (e) => {
  const { file, maxWidth, quality, watermarkText } = e.data;
  if (!file) {
    self.postMessage({ error: 'No file' });
    return;
  }
  
  try {
    const bitmap = await createImageBitmap(file);
    let width = bitmap.width;
    let height = bitmap.height;
    
    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }
    
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    
    if (watermarkText) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = 'bold ' + Math.max(16, width * 0.04) + 'px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillText(watermarkText, width - (width * 0.02), height - (height * 0.02));
    }
    
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: quality });
    self.postMessage({ blob, fileName: file.name });
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};
