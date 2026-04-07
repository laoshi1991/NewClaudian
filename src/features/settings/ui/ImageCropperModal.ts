import Cropper from 'cropperjs';
import type { App} from 'obsidian';
import { Modal, Notice, setIcon } from 'obsidian';

/**
 * ImageCropperModal
 * 
 * Provides an intelligent image cropping system using cropperjs.
 * Enforces a 1:1 aspect ratio, provides touch/mouse dragging, zooming,
 * rotating, and grid lines for accurate avatar selection.
 * Outputs compressed, high-quality images between 200x200px and 500x500px.
 */
export class ImageCropperModal extends Modal {
  private imageSrc: string;
  private cropper: Cropper | null = null;
  private onCrop: (base64: string) => void;

  constructor(app: App, imageSrc: string, onCrop: (base64: string) => void) {
    super(app);
    this.imageSrc = imageSrc;
    this.onCrop = onCrop;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('claudian-cropper-modal');

    contentEl.createEl('h2', { text: 'Crop Avatar' });

    const cropperContainer = contentEl.createDiv({ cls: 'claudian-cropper-container' });
    const imgEl = cropperContainer.createEl('img', { attr: { src: this.imageSrc } });

    // Initialize Cropper after image is loaded to get correct dimensions
    imgEl.onload = () => {
      this.cropper = new Cropper(imgEl, {
        aspectRatio: 1, // Enforce 1:1 aspect ratio
        viewMode: 1, // Restrict the crop box to not exceed the size of the canvas
        dragMode: 'move', // Enable panning
        autoCropArea: 0.8,
        restore: false,
        guides: true, // Show grid lines
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
      });
    };

    const controlsEl = contentEl.createDiv({ cls: 'claudian-cropper-controls' });

    // Zoom controls
    const zoomInBtn = controlsEl.createEl('button', { attr: { 'aria-label': 'Zoom In' } });
    setIcon(zoomInBtn, 'zoom-in');
    zoomInBtn.addEventListener('click', () => this.cropper?.zoom(0.1));

    const zoomOutBtn = controlsEl.createEl('button', { attr: { 'aria-label': 'Zoom Out' } });
    setIcon(zoomOutBtn, 'zoom-out');
    zoomOutBtn.addEventListener('click', () => this.cropper?.zoom(-0.1));

    // Rotate controls
    const rotateLeftBtn = controlsEl.createEl('button', { attr: { 'aria-label': 'Rotate Left' } });
    setIcon(rotateLeftBtn, 'rotate-ccw');
    rotateLeftBtn.addEventListener('click', () => this.cropper?.rotate(-90));

    const rotateRightBtn = controlsEl.createEl('button', { attr: { 'aria-label': 'Rotate Right' } });
    setIcon(rotateRightBtn, 'rotate-cw');
    rotateRightBtn.addEventListener('click', () => this.cropper?.rotate(90));

    // Reset
    const resetBtn = controlsEl.createEl('button', { attr: { 'aria-label': 'Reset' } });
    setIcon(resetBtn, 'refresh-cw');
    resetBtn.addEventListener('click', () => this.cropper?.reset());

    const buttonContainer = contentEl.createDiv({ cls: 'claudian-avatar-modal-buttons' });

    const applyBtn = buttonContainer.createEl('button', {
      text: 'Apply Crop',
      cls: 'mod-cta'
    });
    applyBtn.addEventListener('click', () => {
      if (!this.cropper) return;
      
      // Get cropped canvas and compress to max 500x500
      const canvas = this.cropper.getCroppedCanvas({
        maxWidth: 500,
        maxHeight: 500,
        minWidth: 200,
        minHeight: 200,
        fillColor: '#fff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });

      if (canvas) {
        // Output as high-quality JPEG
        const base64 = canvas.toDataURL('image/jpeg', 0.9);
        this.onCrop(base64);
        this.close();
      } else {
        new Notice('Failed to crop image');
      }
    });

    const cancelBtn = buttonContainer.createEl('button', {
      text: 'Cancel'
    });
    cancelBtn.addEventListener('click', () => {
      this.close();
    });
  }

  onClose() {
    if (this.cropper) {
      this.cropper.destroy();
      this.cropper = null;
    }
    this.contentEl.empty();
  }
}