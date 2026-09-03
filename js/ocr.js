/* ocr.js — thin wrapper around Tesseract.js. Recognition runs on-device
   in a worker; the only network activity is a one-time download of the
   English traineddata file (cached by the browser after first use). */

const CardOCR = (() => {
  let worker = null;

  async function getWorker(onProgress) {
    if (worker) return worker;
    worker = await Tesseract.createWorker('eng', 1, {
      logger: (m) => { if (onProgress) onProgress(m); }
    });
    return worker;
  }

  async function recognize(dataUrl, onProgress) {
    const w = await getWorker(onProgress);
    const { data } = await w.recognize(dataUrl);
    return data.text || '';
  }

  return { recognize };
})();
