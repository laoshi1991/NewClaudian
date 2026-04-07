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

  private renderFileChip(filePath: string, onRemove: () => void): void {
    const chipEl = this.fileIndicatorEl.createDiv({ cls: 'claudian-file-chip' });

    const iconWrapperEl = chipEl.createDiv({ cls: 'claudian-file-chip-icon-wrapper' });
    
    const iconEl = iconWrapperEl.createSpan({ cls: 'claudian-file-chip-icon' });
    setIcon(iconEl, 'file-text');

    const removeEl = iconWrapperEl.createSpan({ cls: 'claudian-file-chip-remove' });
    setIcon(removeEl, 'x');
    removeEl.setAttribute('aria-label', 'Remove');

    const normalizedPath = filePath.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop() || filePath;
    const nameEl = chipEl.createSpan({ cls: 'claudian-file-chip-name' });
    nameEl.setText(filename);
    nameEl.setAttribute('title', filePath);

    chipEl.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.claudian-file-chip-remove')) {
        this.callbacks.onOpenFile(filePath);
      }
    });

    removeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove();
    });
  }
}
