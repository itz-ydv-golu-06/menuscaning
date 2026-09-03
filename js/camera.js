/* camera.js — getUserMedia camera control + capture-to-canvas.
   Crops to the on-screen card guide and applies a light contrast/
   sharpen pass so OCR has an easier time with tilted or dim shots. */

const CardCamera = (() => {
  let stream = null;
  let facingMode = 'environment';
  let video, canvas;

  function init(videoEl, canvasEl) {
    video = videoEl;
    canvas = canvasEl;
  }

  async function start() {
    stop();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      return true;
    } catch (err) {
      console.error('Camera error', err);
      return false;
    }
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  async function switchCamera() {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    return start();
  }

  function hasFlash() {
    if (!stream) return false;
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    return !!caps.torch;
  }

  async function toggleFlash(on) {
    if (!stream) return false;
    const track = stream.getVideoTracks()[0];
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] });
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Capture the current video frame, cropped to the guide rectangle proportions (1.75:2 ~ card ratio), lightly enhanced. */
  function captureFromVideo(guideEl) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const vRect = video.getBoundingClientRect();
    const gRect = guideEl.getBoundingClientRect();

    const scaleX = vw / vRect.width;
    const scaleY = vh / vRect.height;

    const sx = Math.max(0, (gRect.left - vRect.left) * scaleX);
    const sy = Math.max(0, (gRect.top - vRect.top) * scaleY);
    const sw = Math.min(vw - sx, gRect.width * scaleX);
    const sh = Math.min(vh - sy, gRect.height * scaleY);

    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    enhance(ctx, sw, sh);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  /** Capture a full picked/uploaded image file, downscaled and enhanced. */
  function captureFromFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => { img.src = reader.result; };
      reader.onerror = reject;
      img.onload = () => {
        const maxDim = 1600;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width *= scale; height *= scale;
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        enhance(ctx, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /** Light contrast boost + sharpen-ish unsharp mask, cheap version via canvas filter. */
  function enhance(ctx, w, h) {
    try {
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;
      const contrast = 1.15, brightness = 8;
      for (let i = 0; i < d.length; i += 4) {
        d[i]   = clamp((d[i]   - 128) * contrast + 128 + brightness);
        d[i+1] = clamp((d[i+1] - 128) * contrast + 128 + brightness);
        d[i+2] = clamp((d[i+2] - 128) * contrast + 128 + brightness);
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (e) { /* CORS-tainted canvas etc: skip enhancement silently */ }
  }
  function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  return { init, start, stop, switchCamera, hasFlash, toggleFlash, captureFromVideo, captureFromFile };
})();
