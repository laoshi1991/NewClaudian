import { setIcon } from 'obsidian';

export interface FileChipsViewCallbacks {
  onRemoveAttachment: (path: string) => void;
  onOpenFile: (path: string) => void;
}

export class FileChipsView {
  private containerEl: HTMLElement;
  private callbacks: FileChipsViewCallbacks;
  private fileIndicatorEl: HTMLElement;

  constructor(containerEl: HTMLElement, callbacks: FileChipsViewCallbacks) {
    this.containerEl = containerEl;
    this.callbacks = callbacks;

    const firstChild = this.containerEl.firstChild;
    this.fileIndicatorEl = this.containerEl.createDiv({ cls: 'claudian-file-indicator' });
    if (firstChild) {
      this.containerEl.insertBefore(this.fileIndicatorEl, firstChild);
    }
  }

  destroy(): void {
    this.fileIndicatorEl.remove();
  }

  renderFileChips(currentNotePath: string | null, attachedFiles: string[]): void {
    this.fileIndicatorEl.empty();

    const allFiles = new Set<string>();
    if (currentNotePath) allFiles.add(currentNotePath);
    for (const file of attachedFiles) allFiles.add(file);

    if (allFiles.size === 0) {
      this.fileIndicatorEl.style.display = 'none';
      return;
    }

    this.fileIndicatorEl.style.display = 'flex';
    this.fileIndicatorEl.style.flexWrap = 'wrap';
    this.fileIndicatorEl.style.gap = '8px';

    for (const filePath of allFiles) {
      this.renderFileChip(filePath, () => {
        this.callbacks.onRemoveAttachment(filePath);
      });
    }
  }

  private getIconForFile(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
      // Images
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp':
      case 'svg':
      case 'bmp':
      case 'ico':
        return 'image';
      // Audio/Video
      case 'mp3':
      case 'mp4':
      case 'wav':
      case 'avi':
      case 'mov':
      case 'mkv':
        return 'file-audio';
      // Archives
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz':
      case 'bz2':
        return 'file-archive';
      // Code
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
      case 'json':
      case 'html':
      case 'css':
        return 'file-code';
      // Documents
      case 'pdf':
      case 'doc':
      case 'docx':
      case 'xls':
      case 'xlsx':
      case 'ppt':
      case 'pptx':
      case 'csv':
        return 'file-text';
      // Default Obsidian Notes
      case 'md':
        return 'file-text'; // Or consider 'document' if you want it distinct from default file
      default:
        return 'file';
    }
  }

  private renderFileChip(filePath: string, onRemove: () => void): void {
    const chipEl = this.fileIndicatorEl.createDiv({ cls: 'claudian-file-chip' });

    const isFolder = filePath.endsWith('/');
    const displayPath = isFolder ? filePath.slice(0, -1) : filePath;
    const normalizedPath = displayPath.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop() || displayPath;

    const iconWrapperEl = chipEl.createDiv({ cls: 'claudian-file-chip-icon-wrapper' });
    
    const iconEl = iconWrapperEl.createSpan({ cls: 'claudian-file-chip-icon' });
    setIcon(iconEl, isFolder ? 'folder' : this.getIconForFile(filename));

    const removeEl = iconWrapperEl.createSpan({ cls: 'claudian-file-chip-remove' });
    setIcon(removeEl, 'x');
    removeEl.setAttribute('aria-label', 'Remove');

    const nameEl = chipEl.createSpan({ cls: 'claudian-file-chip-name' });
    nameEl.setText(filename);
    nameEl.setAttribute('title', displayPath);

    chipEl.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.claudian-file-chip-remove')) {
        if (!isFolder) {
          this.callbacks.onOpenFile(displayPath);
        }
      }
    });

    removeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove();
    });
  }
}
