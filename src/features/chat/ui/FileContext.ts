import type { App, EventRef } from 'obsidian';
import { Notice, TFile, TFolder } from 'obsidian';

import type { AgentManager } from '../../../core/agents';
import type { McpServerManager } from '../../../core/mcp';
import type { DropHandler } from '../../../shared/components/DropZoneCoordinator';
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
import { insertChipAtCursor } from './mixedInputPolyfill';

const SUPPORTED_EXTENSIONS = new Set([
  // Documents & Text
  'md', 'txt', 'csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'php', 'rb', 'swift', 'kt', 'sql', 'sh', 'bat',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf', 'pages', 'odt',
  // Images
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico',
  // Archives
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2',
  // Audio/Video
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv'
]);

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

    this.inputEl.addEventListener('input', this.handleInputChanged);
    
    // Initial sync in case there's value
    this.handleInputChanged();
  }

  private handleInputChanged = () => {
    // Extract [[path]] from inputEl.value
    const text = this.inputEl.value;
    const regex = /\[\[([^\]]+)\]\]/g;
    const foundPaths = new Set<string>();
    let match;
    while ((match = regex.exec(text)) !== null) {
      foundPaths.add(match[1]);
    }

    // Sync state
    let changed = false;
    const currentAttached = this.state.getAttachedFiles();
    
    for (const path of Array.from(currentAttached)) {
      if (!foundPaths.has(path)) {
        this.state.detachFile(path);
        changed = true;
      }
    }
    
    for (const path of foundPaths) {
      if (!currentAttached.has(path)) {
        this.state.attachFile(path);
        changed = true;
      }
    }

    if (changed) {
      this.refreshCurrentNoteChip();
    }
  };

  /** DropHandler for use with DropZoneCoordinator. */
  readonly dropHandler: DropHandler = {
    isValidDrag: (types) => {
      if (!types) return false;
      for (let i = 0; i < types.length; i++) {
        const t = types[i];
        if (
          t === 'application/x-obsidian-dnd' ||
          t === 'text/plain' ||
          t === 'Files' ||
          t === 'application/vnd.obsidian.drag.folder' ||
          t === 'text/uri-list'
        ) return true;
      }
      return false;
    },
    handleDrop: (e) => this.handleDrop(e),
  };

  async handleDrop(dragEvent: DragEvent): Promise<void> {
    if (!dragEvent.dataTransfer) return;

    let attachedCount = 0;
    const filesToProcess: (TFile | TFolder)[] = [];

    const typesArray = Array.from(dragEvent.dataTransfer.types);

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
            if (!file) {
              // Try appending supported extensions if missing
              for (const ext of SUPPORTED_EXTENSIONS) {
                if (decodedPath.toLowerCase().endsWith('.' + ext)) {
                  break;
                }
              }
              if (!decodedPath.match(/\.[a-zA-Z0-9]+$/)) {
                file = this.app.vault.getAbstractFileByPath(decodedPath + '.md');
              }
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

      // 3. Process Vault Files
      let unsupportedCount = 0;
      for (const file of filesToProcess) {
        if (file instanceof TFile) {
          const ext = file.extension.toLowerCase();
          if (SUPPORTED_EXTENSIONS.has(ext) && !this.hasExcludedTag(file)) {
            const normalized = this.normalizePathForVault(file.path);
            if (normalized) {
              this.state.attachFile(normalized);
              attachedCount++;
              insertChipAtCursor(normalized, dragEvent);
            }
          } else if (!SUPPORTED_EXTENSIONS.has(ext)) {
            unsupportedCount++;
          }
        } else if (file instanceof TFolder) {
          const normalized = this.normalizePathForVault(file.path);
          if (normalized) {
            this.state.attachFile(normalized + '/');
            attachedCount++;
            insertChipAtCursor(normalized + '/', dragEvent);
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
              if (file instanceof TFile) {
                const ext = file.extension.toLowerCase();
                if (SUPPORTED_EXTENSIONS.has(ext) && !this.hasExcludedTag(file)) {
                  this.state.attachFile(normalized);
                  attachedCount++;
                  insertChipAtCursor(normalized, dragEvent);
                } else if (!SUPPORTED_EXTENSIONS.has(ext)) {
                  unsupportedCount++;
                }
              } else if (file instanceof TFolder) {
                this.state.attachFile(normalized + '/');
                attachedCount++;
                insertChipAtCursor(normalized + '/', dragEvent);
              }
            }
          }
        }
        if (attachedCount === 0 && unsupportedCount === 0) {
          new Notice('Only files within the vault can be attached.');
        }
      }

      if (unsupportedCount > 0) {
        new Notice(`Ignored ${unsupportedCount} file(s) with unsupported formats.`);
      }

      if (attachedCount > 0) {
        this.refreshCurrentNoteChip();
        this.callbacks.onChipsChanged?.();
        // Since we insert chips into inputEl, trigger input event to update everything
        this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
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
    this.inputEl.removeEventListener('input', this.handleInputChanged);
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
