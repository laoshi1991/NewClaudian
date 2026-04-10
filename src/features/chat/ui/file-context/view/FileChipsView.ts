import { setIcon } from 'obsidian';
import { mount, unmount } from 'svelte';

import ChatFileIcon from '../../../../../components/ChatFileIcon.svelte';

export interface FileChipsViewCallbacks {
  onRemoveAttachment: (path: string) => void;
  onOpenFile: (path: string) => void;
}

export class FileChipsView {
  private containerEl: HTMLElement;
  private callbacks: FileChipsViewCallbacks;
  private fileIndicatorEl: HTMLElement;
  private svelteComponents: any[] = [];

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
    this.cleanupSvelteComponents();
    this.fileIndicatorEl.remove();
  }

  private cleanupSvelteComponents(): void {
    for (const comp of this.svelteComponents) {
      try {
        unmount(comp);
      } catch {
        // ignore
      }
    }
    this.svelteComponents = [];
  }

  renderFileChips(currentNotePath: string | null, attachedFiles: string[]): void {
    this.cleanupSvelteComponents();
    this.fileIndicatorEl.empty();

    // In mixed layout mode, we only show the current note if it's automatically attached
    // All other attached files are inline in the input editor!
    const allFiles = new Set<string>();
    if (currentNotePath) allFiles.add(currentNotePath);

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

    const isFolder = filePath.endsWith('/');
    const displayPath = isFolder ? filePath.slice(0, -1) : filePath;
    const normalizedPath = displayPath.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop() || displayPath;

    const iconWrapperEl = chipEl.createDiv({ cls: 'claudian-file-chip-icon-wrapper' });
    
    const iconEl = iconWrapperEl.createSpan({ cls: 'claudian-file-chip-icon' });
    
    // Mount Svelte Icon Component
    const comp = mount(ChatFileIcon, {
      target: iconEl,
      props: {
        filename: filename,
        isDir: isFolder,
        isEmptyDir: false, // We don't have this info here, assume false for now
        className: 'lucide' // Match standard Obsidian icon size roughly
      }
    });
    this.svelteComponents.push(comp);

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
