import { playSound } from './utils.js';

export class CameraController {
  constructor(videoElement, canvasElement, overlayCanvas) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.overlayCanvas = overlayCanvas;
    this.ctx = canvasElement.getContext('2d');
    this.overlayCtx = overlayCanvas.getContext('2d');
    
    this.stream = null;
    this.activeFilter = 'none';
    this.captionText = '';
    this.selectedTimer = 10; // Default 10 second snap view duration
    this.isDrawing = false;
    this.drawColor = '#FFFC00';
    
    this.setupDrawingListeners();
  }

  async startCamera(facingMode = 'user') {
    try {
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }

      // Constraints optimized for iPad 4:3 screen ratio
      const constraints = {
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1440 },
          aspectRatio: { ideal: 4 / 3 }
        },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      await this.video.play();
      
      this.resizeCanvas();
    } catch (err) {
      console.error('[Camera] Access failed:', err);
    }
  }

  resizeCanvas() {
    const width = this.video.videoWidth || window.innerWidth;
    const height = this.video.videoHeight || window.innerHeight;
    
    this.canvas.width = width;
    this.canvas.height = height;
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;
  }

  setFilter(filterName) {
    this.activeFilter = filterName;
    this.video.className = `filter-${filterName}`;
  }

  setCaption(text) {
    this.captionText = text;
  }

  setTimer(seconds) {
    this.selectedTimer = parseInt(seconds, 10);
  }

  setDrawColor(color) {
    this.drawColor = color;
  }

  setupDrawingListeners() {
    const getPos = (e) => {
      const rect = this.overlayCanvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * (this.overlayCanvas.width / rect.width),
        y: (clientY - rect.top) * (this.overlayCanvas.height / rect.height)
      };
    };

    const startDraw = (e) => {
      this.isDrawing = true;
      const pos = getPos(e);
      this.overlayCtx.beginPath();
      this.overlayCtx.moveTo(pos.x, pos.y);
      this.overlayCtx.strokeStyle = this.drawColor;
      this.overlayCtx.lineWidth = 8;
      this.overlayCtx.lineCap = 'round';
    };

    const moveDraw = (e) => {
      if (!this.isDrawing) return;
      const pos = getPos(e);
      this.overlayCtx.lineTo(pos.x, pos.y);
      this.overlayCtx.stroke();
    };

    const stopDraw = () => {
      this.isDrawing = false;
    };

    this.overlayCanvas.addEventListener('mousedown', startDraw);
    this.overlayCanvas.addEventListener('mousemove', moveDraw);
    this.overlayCanvas.addEventListener('mouseup', stopDraw);
    
    this.overlayCanvas.addEventListener('touchstart', startDraw, { passive: true });
    this.overlayCanvas.addEventListener('touchmove', moveDraw, { passive: true });
    this.overlayCanvas.addEventListener('touchend', stopDraw);
  }

  clearDrawing() {
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
  }

  captureSnap() {
    playSound('shutter');
    this.resizeCanvas();

    // 1. Draw video frame with active filter
    this.ctx.filter = getComputedStyle(this.video).filter;
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    this.ctx.filter = 'none';

    // 2. Composite overlay canvas drawings
    this.ctx.drawImage(this.overlayCanvas, 0, 0);

    // 3. Render classic Snapchat caption bar if present
    if (this.captionText.trim().length > 0) {
      const barHeight = 60;
      const yPos = this.canvas.height / 2;

      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      this.ctx.fillRect(0, yPos - barHeight / 2, this.canvas.width, barHeight);

      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.font = 'bold 24px -apple-system, Helvetica Neue, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(this.captionText, this.canvas.width / 2, yPos);
    }

    // Return compressed image blob base64
    return {
      mediaUrl: this.canvas.toDataURL('image/jpeg', 0.85),
      duration: this.selectedTimer
    };
  }
}
