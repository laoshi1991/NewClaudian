import type { App, EventRef } from 'obsidian';
import { Notice, TFile, TFolder } from 'obsidian';

import type { AgentManager } from '../../../core/agents';
import type { McpServerManager } from '../../../core/mcp';
import { MentionDropdownController } from '../../../shared/mention/MentionDropdownController';
import { VaultMentionDataProvider } from '../../../shared/mention/VaultMentionDataProvider';
import {
  createExternalContextLookupGetter,
  isMentionStart,
  resolveExternalMentionAtIndex,
} from '../../../utils/contextMentionResolver';
import { buildExternalContextDisplayEntries } from '../../../utils/externalContext';
import { externalContextScanner } from '../../../utils/externalContextScanner';
import { getVaultPath, normalizePathForVault as normalizePathForVaultUtil } from '../../../utils/path';
import { FileContextState } from './file-context/state/FileContextState';
import { FileChipsView } from './file-context/view/FileChipsView';

export interface FileContextCallbacks {
  getExcludedTags: () => string[];
  onChipsChanged?: () => void;
  getExternalContexts?: () => string[];
  /** Called when an agent is selected from the @ mention dropdown. */
  onAgentMentionSelect?: (agentId: string) => void;
}

export class FileContextManager {
  private app: App;
  private callbacks: FileContextCallbacks;
  private chipsContainerEl: HTMLElement;
  private dropdownContainerEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private state: FileContextState;
  private mentionDataProvider: VaultMentionDataProvider;
  private chipsView: FileChipsView;
  private mentionDropdown: MentionDropdownController;
  private deleteEventRef: EventRef | null = null;
  private renameEventRef: EventRef | null = null;

  // Current note (shown as chip)
  private currentNotePath: string | null = null;

  // MCP server support
  private onMcpMentionChange: ((servers: Set<string>) => void) | null = null;

  constructor(
    app: App,
    chipsContainerEl: HTMLElement,
    inputEl: HTMLTextAreaElement,
    callbacks: FileContextCallbacks,
    dropdownContainerEl?: HTMLElement
  ) {
    this.app = app;
    this.chipsContainerEl = chipsContainerEl;
    this.dropdownContainerEl = dropdownContainerEl ?? chipsContainerEl;
    this.inputEl = inputEl;
    this.callbacks = callbacks;

    this.state = new FileContextState();
    this.mentionDataProvider = new VaultMentionDataProvider(this.app);
    this.mentionDataProvider.initializeInBackground();

    this.chipsView = new FileChipsView(this.chipsContainerEl, {
      onRemoveAttachment: (filePath) => {
        let changed = false;
        
        if (filePath === this.currentNotePath) {
          this.currentNotePath = null;
          changed = true;
        }
        
        if (this.state.getAttachedFiles().has(filePath)) {
          this.state.detachFile(filePath);
          changed = true;
        }

        if (changed) {
          this.refreshCurrentNoteChip();
        }
      },
      onOpenFile: async (filePath) => {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
          new Notice(`Could not open file: ${filePath}`);
          return;
        }
        try {
          await this.app.workspace.getLeaf().openFile(file);
        } catch (error) {
          new Notice(`Failed to open file: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    });

    this.mentionDropdown = new MentionDropdownController(
      this.dropdownContainerEl,
      this.inputEl,
      {
        onAttachFile: (filePath) => this.state.attachFile(filePath),
        onMcpMentionChange: (servers) => this.onMcpMentionChange?.(servers),
        onAgentMentionSelect: (agentId) => this.callbacks.onAgentMentionSelect?.(agentId),
        getMentionedMcpServers: () => this.state.getMentionedMcpServers(),
        setMentionedMcpServers: (mentions) => this.state.setMentionedMcpServers(mentions),
        addMentionedMcpServer: (name) => this.state.addMentionedMcpServer(name),
        getExternalContexts: () => this.callbacks.getExternalContexts?.() || [],
        getCachedVaultFolders: () => this.mentionDataProvider.getCachedVaultFolders(),
        getCachedVaultFiles: () => this.mentionDataProvider.getCachedVaultFiles(),
        normalizePathForVault: (rawPath) => this.normalizePathForVault(rawPath),
      }
    );

    this.deleteEventRef = this.app.vault.on('delete', (file) => {
      if (file instanceof TFile) this.handleFileDeleted(file.path);
    });

    this.renameEventRef = this.app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFile) this.handleFileRenamed(oldPath, file.path);
    });

    this.setupDragAndDrop();
  }

  private setupDragAndDrop() {
    const inputWrapper = typeof this.inputEl.closest === 'function' 
      ? this.inputEl.closest('.claudian-input-wrapper') as HTMLElement || this.inputEl 
      : this.inputEl;
    
    const dropZone = inputWrapper;

    let dropOverlay = typeof dropZone.querySelector === 'function' 
      ? dropZone.querySelector('.claudian-drop-overlay') as HTMLElement 
      : null;
      
    if (!dropOverlay && dropZone !== this.inputEl && typeof dropZone.createDiv === 'function') {
      dropOverlay = dropZone.createDiv({ cls: 'claudian-drop-overlay' });
      const dropContent = dropOverlay.createDiv({ cls: 'claudian-drop-content' });
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '32');
      svg.setAttribute('height', '32');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
      const polyline1 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline1.setAttribute('points', '14 2 14 8 20 8');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '12');
      line.setAttribute('y1', '18');
      line.setAttribute('x2', '12');
      line.setAttribute('y2', '12');
      const polyline2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline2.setAttribute('points', '9 15 12 18 15 15');
      
      svg.appendChild(pathEl);
      svg.appendChild(polyline1);
      svg.appendChild(line);
      svg.appendChild(polyline2);
      dropContent.appendChild(svg);
      dropContent.createSpan({ text: '将文件或文件夹拖放到此处以添加到您的消息中' });
    }

    let dragCounter = 0;

    const isValidDrag = (e: DragEvent): boolean => {
      if (!e.dataTransfer || !e.dataTransfer.types) return false;
      // Convert DOMStringList to array to safely use .includes()
      const types = Array.from(e.dataTransfer.types);
      return types.includes('application/x-obsidian-dnd') ||
             types.includes('text/plain') ||
             types.includes('Files') ||
             types.includes('application/vnd.obsidian.drag.folder') ||
             types.includes('text/uri-list');
    };

    const handleDragEnter = (e: Event) => {
      const dragEvent = e as DragEvent;
      if (!isValidDrag(dragEvent)) return;
      dragEvent.preventDefault();
      dragEvent.stopPropagation();
      dragCounter++;
      if (dragCounter === 1 && dropOverlay) {
        dropOverlay.addClass('visible');
      }
    };

    const handleDragOver = (e: Event) => {
      const dragEvent = e as DragEvent;
      if (!isValidDrag(dragEvent)) return;
      dragEvent.preventDefault();
      dragEvent.stopPropagation();
      if (dragEvent.dataTransfer) {
        dragEvent.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDragLeave = (e: Event) => {
      const dragEvent = e as DragEvent;
      if (!isValidDrag(dragEvent)) return;
      dragEvent.preventDefault();
      dragEvent.stopPropagation();
      dragCounter--;
      if (dragCounter === 0 && dropOverlay) {
        dropOverlay.removeClass('visible');
      }
    };

    const handleDrop = async (e: Event) => {
      const dragEvent = e as DragEvent;
      if (!isValidDrag(dragEvent) || !dragEvent.dataTransfer) return;

      dragEvent.preventDefault();
      dragEvent.stopPropagation();
      
      dragCounter = 0;
      if (dropOverlay) {
        dropOverlay.removeClass('visible');
      }

      let attachedCount = 0;
      const filesToProcess: (TFile | TFolder)[] = [];

      const typesArray = Array.from(dragEvent.dataTransfer.types);

      // Debug: Log all types for missing DND folder issue
      console.log('Drop event types:', typesArray);
      for (const type of typesArray) {
        try {
          console.log(`Drop data for ${type}:`, dragEvent.dataTransfer.getData(type));
        } catch { /* ignore */ }
      }

      // 1. Internal Obsidian DND
      if (typesArray.includes('application/x-obsidian-dnd')) {
        const data = dragEvent.dataTransfer.getData('application/x-obsidian-dnd');
        if (data) {
          try {
            const parsed = JSON.parse(data);
            const items = Array.isArray(parsed) ? parsed : [parsed];
            for (const item of items) {
              if (item.type === 'file' && typeof item.file === 'string') {
                const normalized = this.normalizePathForVault(item.file);
                if (normalized) {
                  const file = this.app.vault.getAbstractFileByPath(normalized);
                  if (file instanceof TFile || file instanceof TFolder) {
                    filesToProcess.push(file);
                  }
                }
              } else if (item.type === 'folder' && (typeof item.folder === 'string' || typeof item.file === 'string')) {
                const pathStr = typeof item.folder === 'string' ? item.folder : item.file;
                const normalized = this.normalizePathForVault(pathStr);
                if (normalized) {
                  const file = this.app.vault.getAbstractFileByPath(normalized);
                  if (file instanceof TFile || file instanceof TFolder) {
                    filesToProcess.push(file);
                  }
                }
              } else if (item.type === 'folders' && Array.isArray(item.folders)) {
                for (const f of item.folders) {
                  const normalized = this.normalizePathForVault(f);
                  if (normalized) {
                    const file = this.app.vault.getAbstractFileByPath(normalized);
                    if (file instanceof TFile || file instanceof TFolder) {
                      filesToProcess.push(file);
                    }
                  }
                }
              } else if (item.type === 'files' && Array.isArray(item.files)) {
                for (const f of item.files) {
                  const normalized = this.normalizePathForVault(f);
                  if (normalized) {
                    const file = this.app.vault.getAbstractFileByPath(normalized);
                    if (file instanceof TFile || file instanceof TFolder) {
                      filesToProcess.push(file);
                    }
                  }
                }
              }
            }
          } catch { /* ignore */ }
        }
      }
      
      // 1.5. Internal Obsidian DND (Folder specific)
      if (typesArray.includes('application/vnd.obsidian.drag.folder')) {
        const data = dragEvent.dataTransfer.getData('application/vnd.obsidian.drag.folder');
        if (data) {
          try {
            const parsed = JSON.parse(data);
            const pathStr = parsed.path || parsed.folder || (typeof parsed === 'string' ? parsed : null);
            if (pathStr) {
              const normalized = this.normalizePathForVault(pathStr);
              if (normalized) {
                const file = this.app.vault.getAbstractFileByPath(normalized);
                if (file instanceof TFolder) {
                  filesToProcess.push(file);
                }
              }
            }
          } catch { /* ignore */ }
        }
      }

      // 2. text/plain & text/uri-list
      if (filesToProcess.length === 0) {
        let text = '';
        if (typesArray.includes('text/uri-list')) {
          text = dragEvent.dataTransfer.getData('text/uri-list');
        } else if (typesArray.includes('text/plain')) {
          text = dragEvent.dataTransfer.getData('text/plain');
        }

        if (text) {
          const uriMatch = text.match(/file=([^&\]\s]+)/) || text.match(/file:\/\/([^\s]+)/);
          const mdMatch = text.match(/\]\(([^)]+\.md)\)/i);
          const wikiMatch = text.match(/\[\[([^\]]+)\]\]/);

          let decodedPath = '';
          if (uriMatch && uriMatch[1]) {
            try { decodedPath = decodeURIComponent(uriMatch[1]); } catch { /* ignore */ }
          } else if (mdMatch && mdMatch[1]) {
            try { decodedPath = decodeURIComponent(mdMatch[1]); } catch { /* ignore */ }
          } else if (wikiMatch && wikiMatch[1]) {
            decodedPath = wikiMatch[1];
          }

          // If no complex match, treat the whole string as a path
          if (!decodedPath && !text.includes('\n')) {
            decodedPath = text.trim();
          }

          if (decodedPath) {
            let file = this.app.vault.getAbstractFileByPath(decodedPath);
            if (!file && !decodedPath.toLowerCase().endsWith('.md')) {
              file = this.app.vault.getAbstractFileByPath(decodedPath + '.md');
            }
            if (!file) {
              file = this.app.metadataCache.getFirstLinkpathDest(decodedPath, '');
            }
            // Ultimate fallback: search all loaded files and folders by exact name match
            if (!file) {
              const allFiles = this.app.vault.getAllLoadedFiles();
              file = allFiles.find(f => f.name === decodedPath || f.name === decodedPath + '.md') || null;
            }

            if (file instanceof TFile || file instanceof TFolder) {
              filesToProcess.push(file);
            }
          }
        }
      }

      // 3. Process Vault Files (.md)
      for (const file of filesToProcess) {
        if (file instanceof TFile && file.extension === 'md' && !this.hasExcludedTag(file)) {
          const normalized = this.normalizePathForVault(file.path);
          if (normalized) {
            this.state.attachFile(normalized);
            attachedCount++;
          }
        } else if (file instanceof TFolder) {
          const normalized = this.normalizePathForVault(file.path);
          if (normalized) {
            this.state.attachFile(normalized + '/');
            attachedCount++;
          }
        }
      }

      // 4. OS Files Fallback
      if (attachedCount === 0 && dragEvent.dataTransfer.files && dragEvent.dataTransfer.files.length > 0) {
        for (let i = 0; i < dragEvent.dataTransfer.files.length; i++) {
          const f = dragEvent.dataTransfer.files[i];
          // f.path is available in Electron environments like Obsidian
          const absolutePath = (f as any).path;
          if (absolutePath) {
            const normalized = this.normalizePathForVault(absolutePath);
            if (normalized) {
              const file = this.app.vault.getAbstractFileByPath(normalized);
              if (file instanceof TFile && file.extension === 'md' && !this.hasExcludedTag(file)) {
                this.state.attachFile(normalized);
                attachedCount++;
              } else if (file instanceof TFolder) {
                this.state.attachFile(normalized + '/');
                attachedCount++;
              }
            }
          }
        }
        if (attachedCount === 0) {
          new Notice('Only files within the vault can be attached.');
        }
      }

      if (attachedCount > 0) {
        this.refreshCurrentNoteChip();
        this.callbacks.onChipsChanged?.();
      }
    };

    dropZone.addEventListener('dragenter', handleDragEnter);
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
  }

  /** Returns the current note path (shown as chip). */
  getCurrentNotePath(): string | null {
    return this.currentNotePath;
  }

  getAttachedFiles(): Set<string> {
    return this.state.getAttachedFiles();
  }

  clearAttachedFiles(): void {
    this.state.clearAttachments();
    this.refreshCurrentNoteChip();
    this.callbacks.onChipsChanged?.();
  }

  /** Checks whether current note should be sent for this session. */
  shouldSendCurrentNote(notePath?: string | null): boolean {
    const resolvedPath = notePath ?? this.currentNotePath;
    return !!resolvedPath && !this.state.hasSentCurrentNote();
  }

  /** Marks current note as sent (call after sending a message). */
  markCurrentNoteSent() {
    this.state.markCurrentNoteSent();
  }

  isSessionStarted(): boolean {
    return this.state.isSessionStarted();
  }

  startSession() {
    this.state.startSession();
  }

  /** Resets state for a new conversation. */
  resetForNewConversation() {
    this.currentNotePath = null;
    this.state.resetForNewConversation();
    this.refreshCurrentNoteChip();
  }

  /** Resets state for loading an existing conversation. */
  resetForLoadedConversation(hasMessages: boolean) {
    this.currentNotePath = null;
    this.state.resetForLoadedConversation(hasMessages);
    this.refreshCurrentNoteChip();
  }

  /** Sets current note (for restoring persisted state). */
  setCurrentNote(notePath: string | null) {
    this.currentNotePath = notePath;
    if (notePath) {
      this.state.attachFile(notePath);
    }
    this.refreshCurrentNoteChip();
  }

  /** Auto-attaches the currently focused file (for new sessions). */
  autoAttachActiveFile() {
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && !this.hasExcludedTag(activeFile)) {
      const normalizedPath = this.normalizePathForVault(activeFile.path);
      if (normalizedPath) {
        this.currentNotePath = normalizedPath;
        this.state.attachFile(normalizedPath);
        this.refreshCurrentNoteChip();
      }
    }
  }

  /** Handles file open event. */
  handleFileOpen(file: TFile) {
    const normalizedPath = this.normalizePathForVault(file.path);
    if (!normalizedPath) return;

    if (!this.state.isSessionStarted()) {
      this.state.clearAttachments();
      if (!this.hasExcludedTag(file)) {
        this.currentNotePath = normalizedPath;
        this.state.attachFile(normalizedPath);
      } else {
        this.currentNotePath = null;
      }
      this.refreshCurrentNoteChip();
    }
  }

  markFileCacheDirty() {
    this.mentionDataProvider.markFilesDirty();
  }

  markFolderCacheDirty() {
    this.mentionDataProvider.markFoldersDirty();
  }

  /** Handles input changes to detect @ mentions. */
  handleInputChange() {
    this.mentionDropdown.handleInputChange();
  }

  /** Handles keyboard navigation in mention dropdown. Returns true if handled. */
  handleMentionKeydown(e: KeyboardEvent): boolean {
    return this.mentionDropdown.handleKeydown(e);
  }

  isMentionDropdownVisible(): boolean {
    return this.mentionDropdown.isVisible();
  }

  hideMentionDropdown() {
    this.mentionDropdown.hide();
  }

  containsElement(el: Node): boolean {
    return this.mentionDropdown.containsElement(el);
  }

  transformContextMentions(text: string): string {
    const externalContexts = this.callbacks.getExternalContexts?.() || [];
    if (externalContexts.length === 0 || !text.includes('@')) return text;

    const contextEntries = buildExternalContextDisplayEntries(externalContexts)
      .sort((a, b) => b.displayNameLower.length - a.displayNameLower.length);
    const getContextLookup = createExternalContextLookupGetter(
      contextRoot => externalContextScanner.scanPaths([contextRoot])
    );

    let replaced = false;
    let cursor = 0;
    const chunks: string[] = [];

    for (let index = 0; index < text.length; index++) {
      if (!isMentionStart(text, index)) continue;

      const resolved = resolveExternalMentionAtIndex(text, index, contextEntries, getContextLookup);
      if (!resolved) continue;

      chunks.push(text.slice(cursor, index));
      chunks.push(`${resolved.resolvedPath}${resolved.trailingPunctuation}`);
      cursor = resolved.endIndex;
      index = resolved.endIndex - 1;
      replaced = true;
    }

    if (!replaced) return text;
    chunks.push(text.slice(cursor));
    return chunks.join('');
  }

  /** Cleans up event listeners (call on view close). */
  destroy() {
    if (this.deleteEventRef) this.app.vault.offref(this.deleteEventRef);
    if (this.renameEventRef) this.app.vault.offref(this.renameEventRef);
    this.mentionDropdown.destroy();
    this.chipsView.destroy();
  }

  /** Normalizes a file path to be vault-relative with forward slashes. */
  normalizePathForVault(rawPath: string | undefined | null): string | null {
    const vaultPath = getVaultPath(this.app);
    return normalizePathForVaultUtil(rawPath, vaultPath);
  }

  private refreshCurrentNoteChip(): void {
    this.chipsView.renderFileChips(
      this.currentNotePath,
      Array.from(this.state.getAttachedFiles())
    );
    this.callbacks.onChipsChanged?.();
  }

  private handleFileRenamed(oldPath: string, newPath: string) {
    const normalizedOld = this.normalizePathForVault(oldPath);
    const normalizedNew = this.normalizePathForVault(newPath);
    if (!normalizedOld) return;

    let needsUpdate = false;

    // Update current note path if renamed
    if (this.currentNotePath === normalizedOld) {
      this.currentNotePath = normalizedNew;
      needsUpdate = true;
    }

    // Update attached files
    if (this.state.getAttachedFiles().has(normalizedOld)) {
      this.state.detachFile(normalizedOld);
      if (normalizedNew) {
        this.state.attachFile(normalizedNew);
      }
      needsUpdate = true;
    }

    if (needsUpdate) {
      this.refreshCurrentNoteChip();
    }
  }

  private handleFileDeleted(deletedPath: string): void {
    const normalized = this.normalizePathForVault(deletedPath);
    if (!normalized) return;

    let needsUpdate = false;

    // Clear current note if deleted
    if (this.currentNotePath === normalized) {
      this.currentNotePath = null;
      needsUpdate = true;
    }

    // Remove from attached files
    if (this.state.getAttachedFiles().has(normalized)) {
      this.state.detachFile(normalized);
      needsUpdate = true;
    }

    if (needsUpdate) {
      this.refreshCurrentNoteChip();
    }
  }

  // ========================================
  // MCP Server Support
  // ========================================

  setMcpManager(manager: McpServerManager | null): void {
    this.mentionDropdown.setMcpManager(manager);
  }

  setAgentService(agentManager: AgentManager | null): void {
    // AgentManager structurally satisfies AgentMentionProvider
    this.mentionDropdown.setAgentService(agentManager);
  }

  setOnMcpMentionChange(callback: (servers: Set<string>) => void): void {
    this.onMcpMentionChange = callback;
  }

  /**
   * Pre-scans external context paths in the background to warm the cache.
   * Should be called when external context paths are added/changed.
   */
  preScanExternalContexts(): void {
    this.mentionDropdown.preScanExternalContexts();
  }

  getMentionedMcpServers(): Set<string> {
    return this.state.getMentionedMcpServers();
  }

  clearMcpMentions(): void {
    this.state.clearMcpMentions();
  }

  updateMcpMentionsFromText(text: string): void {
    this.mentionDropdown.updateMcpMentionsFromText(text);
  }

  private hasExcludedTag(file: TFile): boolean {
    const excludedTags = this.callbacks.getExcludedTags();
    if (excludedTags.length === 0) return false;

    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return false;

    const fileTags: string[] = [];

    if (cache.frontmatter?.tags) {
      const fmTags = cache.frontmatter.tags;
      if (Array.isArray(fmTags)) {
        fileTags.push(...fmTags.map((t: string) => t.replace(/^#/, '')));
      } else if (typeof fmTags === 'string') {
        fileTags.push(fmTags.replace(/^#/, ''));
      }
    }

    if (cache.tags) {
      fileTags.push(...cache.tags.map(t => t.tag.replace(/^#/, '')));
    }

    return fileTags.some(tag => excludedTags.includes(tag));
  }
}
