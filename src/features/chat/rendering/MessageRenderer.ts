import type { App, Component } from 'obsidian';
import { MarkdownRenderer, Notice, setIcon } from 'obsidian';

import { isSubagentToolName, isWriteEditTool, TOOL_AGENT_OUTPUT } from '../../../core/tools/toolNames';
import type { ChatMessage, ImageAttachment, SubagentInfo, ToolCallInfo } from '../../../core/types';
import { t } from '../../../i18n';
import type ClaudianPlugin from '../../../main';
import { SaveNoteModal } from '../../../shared/modals/SaveNoteModal';
import { formatDurationMmSs } from '../../../utils/date';
import { processFileLinks, registerFileLinkHandler } from '../../../utils/fileLink';
import { replaceImageEmbedsWithHtml } from '../../../utils/imageEmbed';
import { findRewindContext } from '../rewind';
import { TitleGenerationService } from '../services/TitleGenerationService';
import {
  renderStoredAsyncSubagent,
  renderStoredSubagent,
} from './SubagentRenderer';
import { renderStoredThinkingBlock } from './ThinkingBlockRenderer';
import { renderStoredToolCall } from './ToolCallRenderer';
import { renderStoredWriteEdit } from './WriteEditRenderer';

export type RenderContentFn = (el: HTMLElement, markdown: string) => Promise<void>;

export class MessageRenderer {
  private app: App;
  private plugin: ClaudianPlugin;
  private component: Component;
  private messagesEl: HTMLElement;
  private rewindCallback?: (messageId: string) => Promise<void>;
  private forkCallback?: (messageId: string) => Promise<void>;
  private liveMessageEls = new Map<string, HTMLElement>();

  private static readonly REWIND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;

  private static readonly FORK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/></svg>`;

  constructor(
    plugin: ClaudianPlugin,
    component: Component,
    messagesEl: HTMLElement,
    rewindCallback?: (messageId: string) => Promise<void>,
    forkCallback?: (messageId: string) => Promise<void>,
  ) {
    this.app = plugin.app;
    this.plugin = plugin;
    this.component = component;
    this.messagesEl = messagesEl;
    this.rewindCallback = rewindCallback;
    this.forkCallback = forkCallback;

    // Register delegated click handler for file links
    registerFileLinkHandler(this.app, this.messagesEl, this.component);
  }

  /** Sets the messages container element. */
  setMessagesEl(el: HTMLElement): void {
    this.messagesEl = el;
  }

  // ============================================
  // Streaming Message Rendering
  // ============================================

  /**
   * Adds a new message to the chat during streaming.
   * Returns the message element for content updates.
   */
  addMessage(msg: ChatMessage): HTMLElement {
    // Render attached files above message bubble for user messages
    if (msg.role === 'user' && msg.attachedFiles && msg.attachedFiles.length > 0) {
      this.renderMessageAttachedFiles(this.messagesEl, msg.attachedFiles);
    }

    // Render images above message bubble for user messages
    if (msg.role === 'user' && msg.images && msg.images.length > 0) {
      this.renderMessageImages(this.messagesEl, msg.images);
    }

    // Skip empty bubble for image-only messages
    if (msg.role === 'user') {
      const textToShow = msg.displayContent ?? msg.content;
      if (!textToShow) {
        this.scrollToBottom();
        const lastChild = this.messagesEl.lastElementChild as HTMLElement;
        return lastChild ?? this.messagesEl;
      }
    }

    const msgEl = this.messagesEl.createDiv({
      cls: `claudian-message claudian-message-${msg.role}`,
      attr: {
        'data-message-id': msg.id,
        'data-role': msg.role,
      },
    });

    const avatarEl = msgEl.createDiv({ cls: 'claudian-message-avatar' });
    const avatarUrl = msg.role === 'user' ? this.plugin.settings.userAvatar : this.plugin.settings.aiAvatar;
    if (avatarUrl) {
      avatarEl.createEl('img', { attr: { src: avatarUrl } });
    }

    const contentEl = msgEl.createDiv({ cls: 'claudian-message-content', attr: { dir: 'auto' } });

    if (msg.role === 'user') {
      const textToShow = msg.displayContent ?? msg.content;
      if (textToShow) {
        const textEl = contentEl.createDiv({ cls: 'claudian-text-block' });
        void this.renderContent(textEl, textToShow);
        this.addUserCopyButton(msgEl, textToShow);
      }
      if (this.rewindCallback || this.forkCallback) {
        this.liveMessageEls.set(msg.id, msgEl);
      }
    }

    this.scrollToBottom();
    return msgEl;
  }

  // ============================================
  // Stored Message Rendering (Batch/Replay)
  // ============================================

  /**
   * Renders all messages for conversation load/switch.
   * @param messages Array of messages to render
   * @param getGreeting Function to get greeting text
   * @returns The newly created welcome element
   */
  renderMessages(
    messages: ChatMessage[],
    getGreeting: () => string
  ): HTMLElement {
    this.messagesEl.empty();
    this.liveMessageEls.clear();

    // Recreate welcome element after clearing
    const newWelcomeEl = this.messagesEl.createDiv({ cls: 'claudian-welcome' });
    newWelcomeEl.createDiv({ cls: 'claudian-welcome-greeting', text: getGreeting() });

    for (let i = 0; i < messages.length; i++) {
      this.renderStoredMessage(messages[i], messages, i);
    }

    this.scrollToBottom();
    return newWelcomeEl;
  }

  renderStoredMessage(msg: ChatMessage, allMessages?: ChatMessage[], index?: number): void {
    // Render interrupt messages with special styling (not as user bubbles)
    if (msg.isInterrupt) {
      this.renderInterruptMessage();
      return;
    }

    // Skip rebuilt context messages (history sent to SDK on session reset)
    // These are internal context for the AI, not actual user messages to display
    if (msg.isRebuiltContext) {
      return;
    }

    // Render attached files above bubble for user messages
    if (msg.role === 'user' && msg.attachedFiles && msg.attachedFiles.length > 0) {
      this.renderMessageAttachedFiles(this.messagesEl, msg.attachedFiles);
    }

    // Render images above bubble for user messages
    if (msg.role === 'user' && msg.images && msg.images.length > 0) {
      this.renderMessageImages(this.messagesEl, msg.images);
    }

    // Skip empty bubble for image-only messages
    if (msg.role === 'user') {
      const textToShow = msg.displayContent ?? msg.content;
      if (!textToShow) {
        return;
      }
    }

    const msgEl = this.messagesEl.createDiv({
      cls: `claudian-message claudian-message-${msg.role}`,
      attr: {
        'data-message-id': msg.id,
        'data-role': msg.role,
      },
    });

    const avatarEl = msgEl.createDiv({ cls: 'claudian-message-avatar' });
    const avatarUrl = msg.role === 'user' ? this.plugin.settings.userAvatar : this.plugin.settings.aiAvatar;
    if (avatarUrl) {
      avatarEl.createEl('img', { attr: { src: avatarUrl } });
    }

    const contentEl = msgEl.createDiv({ cls: 'claudian-message-content', attr: { dir: 'auto' } });

    if (msg.role === 'user') {
      const textToShow = msg.displayContent ?? msg.content;
      if (textToShow) {
        const textEl = contentEl.createDiv({ cls: 'claudian-text-block' });
        void this.renderContent(textEl, textToShow);
        this.addUserCopyButton(msgEl, textToShow);
      }
      if (msg.sdkUserUuid && this.isRewindEligible(allMessages, index)) {
        if (this.rewindCallback) {
          this.addRewindButton(msgEl, msg.id);
        }
        if (this.forkCallback) {
          this.addForkButton(msgEl, msg.id);
        }
      }
    } else if (msg.role === 'assistant') {
      this.renderAssistantContent(msg, contentEl);
    }
  }

  private isRewindEligible(allMessages?: ChatMessage[], index?: number): boolean {
    if (!allMessages || index === undefined) return false;
    const ctx = findRewindContext(allMessages, index);
    return !!ctx.prevAssistantUuid && ctx.hasResponse;
  }

  /**
   * Renders an interrupt indicator (stored interrupts from SDK history).
   * Uses the same styling as streaming interrupts.
   */
  private renderInterruptMessage(): void {
    const msgEl = this.messagesEl.createDiv({ cls: 'claudian-message claudian-message-assistant' });
    const contentEl = msgEl.createDiv({ cls: 'claudian-message-content', attr: { dir: 'auto' } });
    const textEl = contentEl.createDiv({ cls: 'claudian-text-block' });
    textEl.innerHTML = '<span class="claudian-interrupted">Interrupted</span> <span class="claudian-interrupted-hint">· What should Claudian do instead?</span>';
  }

  /**
   * Renders assistant message content (content blocks or fallback).
   */
  private renderAssistantContent(msg: ChatMessage, contentEl: HTMLElement): void {
    if (msg.contentBlocks && msg.contentBlocks.length > 0) {
      const renderedToolIds = new Set<string>();
      for (const block of msg.contentBlocks) {
        if (block.type === 'thinking') {
          renderStoredThinkingBlock(
            contentEl,
            block.content,
            block.durationSeconds,
            (el, md) => this.renderContent(el, md)
          );
        } else if (block.type === 'text') {
          // Skip empty or whitespace-only text blocks to avoid extra gaps
          if (!block.content || !block.content.trim()) {
            continue;
          }
          const textEl = contentEl.createDiv({ cls: 'claudian-text-block' });
          void this.renderContent(textEl, block.content);
          this.addTextActionButtons(textEl, block.content);
        } else if (block.type === 'tool_use') {
          const toolCall = msg.toolCalls?.find(tc => tc.id === block.toolId);
          if (toolCall) {
            this.renderToolCall(contentEl, toolCall);
            renderedToolIds.add(toolCall.id);
          }
        } else if (block.type === 'compact_boundary') {
          const boundaryEl = contentEl.createDiv({ cls: 'claudian-compact-boundary' });
          boundaryEl.createSpan({ cls: 'claudian-compact-boundary-label', text: 'Conversation compacted' });
        } else if (block.type === 'subagent') {
          const taskToolCall = msg.toolCalls?.find(
            tc => tc.id === block.subagentId && isSubagentToolName(tc.name)
          );
          if (!taskToolCall) continue;

          this.renderTaskSubagent(contentEl, taskToolCall, block.mode);
          renderedToolIds.add(taskToolCall.id);
        }
      }

      // Defensive fallback: preserve tool visibility when contentBlocks/toolCalls drift on reload.
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const toolCall of msg.toolCalls) {
          if (renderedToolIds.has(toolCall.id)) continue;
          this.renderToolCall(contentEl, toolCall);
          renderedToolIds.add(toolCall.id);
        }
      }
    } else {
      // Fallback for old conversations without contentBlocks
      if (msg.content) {
        const textEl = contentEl.createDiv({ cls: 'claudian-text-block' });
        void this.renderContent(textEl, msg.content);
        this.addTextActionButtons(textEl, msg.content);
      }
      if (msg.toolCalls) {
        for (const toolCall of msg.toolCalls) {
          this.renderToolCall(contentEl, toolCall);
        }
      }
    }

    // Render response duration footer (skip when message contains a compaction boundary)
    const hasCompactBoundary = msg.contentBlocks?.some(b => b.type === 'compact_boundary');
    if (msg.durationSeconds && msg.durationSeconds > 0 && !hasCompactBoundary) {
      const flavorWord = msg.durationFlavorWord || 'Baked';
      const footerEl = contentEl.createDiv({ cls: 'claudian-response-footer' });
      footerEl.createSpan({
        text: `* ${flavorWord} for ${formatDurationMmSs(msg.durationSeconds)}`,
        cls: 'claudian-baked-duration',
      });
    }
  }

  /**
   * Renders a tool call with special handling for Write/Edit and Agent (subagent).
   * TaskOutput is hidden as it's an internal tool for async subagent communication.
   */
  private renderToolCall(contentEl: HTMLElement, toolCall: ToolCallInfo): void {
    // Skip TaskOutput - it's invisible (internal async subagent communication)
    if (toolCall.name === TOOL_AGENT_OUTPUT) {
      return;
    }
    if (isWriteEditTool(toolCall.name)) {
      renderStoredWriteEdit(contentEl, toolCall);
    } else if (isSubagentToolName(toolCall.name)) {
      this.renderTaskSubagent(contentEl, toolCall);
    } else {
      renderStoredToolCall(contentEl, toolCall);
    }
  }

  private renderTaskSubagent(
    contentEl: HTMLElement,
    toolCall: ToolCallInfo,
    modeHint?: 'sync' | 'async'
  ): void {
    const subagentInfo = this.resolveTaskSubagent(toolCall, modeHint);
    if (subagentInfo.mode === 'async') {
      renderStoredAsyncSubagent(contentEl, subagentInfo);
      return;
    }
    renderStoredSubagent(contentEl, subagentInfo);
  }

  private resolveTaskSubagent(toolCall: ToolCallInfo, modeHint?: 'sync' | 'async'): SubagentInfo {
    if (toolCall.subagent) {
      if (!modeHint || toolCall.subagent.mode === modeHint) {
        return toolCall.subagent;
      }
      return {
        ...toolCall.subagent,
        mode: modeHint,
      };
    }

    const description = (toolCall.input?.description as string) || 'Subagent task';
    const prompt = (toolCall.input?.prompt as string) || '';
    const mode = modeHint ?? (toolCall.input?.run_in_background === true ? 'async' : 'sync');

    if (mode !== 'async') {
      return {
        id: toolCall.id,
        description,
        prompt,
        status: this.mapToolStatusToSubagentStatus(toolCall.status),
        toolCalls: [],
        isExpanded: false,
        result: toolCall.result,
      };
    }

    const asyncStatus = this.inferAsyncStatusFromTaskTool(toolCall);
    return {
      id: toolCall.id,
      description,
      prompt,
      mode: 'async',
      status: asyncStatus,
      asyncStatus,
      toolCalls: [],
      isExpanded: false,
      result: toolCall.result,
    };
  }

  private mapToolStatusToSubagentStatus(
    status: ToolCallInfo['status']
  ): 'completed' | 'error' | 'running' {
    switch (status) {
      case 'completed':
        return 'completed';
      case 'error':
      case 'blocked':
        return 'error';
      default:
        return 'running';
    }
  }

  private inferAsyncStatusFromTaskTool(toolCall: ToolCallInfo): 'running' | 'completed' | 'error' {
    if (toolCall.status === 'error' || toolCall.status === 'blocked') return 'error';
    if (toolCall.status === 'running') return 'running';

    const lowerResult = (toolCall.result || '').toLowerCase();
    if (
      lowerResult.includes('not_ready') ||
      lowerResult.includes('not ready') ||
      lowerResult.includes('"status":"running"') ||
      lowerResult.includes('"status":"pending"') ||
      lowerResult.includes('"retrieval_status":"running"') ||
      lowerResult.includes('"retrieval_status":"not_ready"')
    ) {
      return 'running';
    }

    return 'completed';
  }

  // ============================================
  // Attachments Rendering (Files/Images)
  // ============================================

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
        return 'file-text';
      default:
        return 'file';
    }
  }

  /**
   * Renders file attachments above a message.
   */
  renderMessageAttachedFiles(containerEl: HTMLElement, files: string[]): void {
    const filesEl = containerEl.createDiv({ cls: 'claudian-message-attached-files' });

    for (const filePath of files) {
      const isFolder = filePath.endsWith('/');
      const displayPath = isFolder ? filePath.slice(0, -1) : filePath;
      const normalizedPath = displayPath.replace(/\\/g, '/');
      const filename = normalizedPath.split('/').pop() || displayPath;

      const chipEl = filesEl.createDiv({ cls: 'claudian-file-chip claudian-file-chip-readonly' });

      const iconWrapperEl = chipEl.createDiv({ cls: 'claudian-file-chip-icon-wrapper' });
      const iconEl = iconWrapperEl.createSpan({ cls: 'claudian-file-chip-icon' });
      setIcon(iconEl, isFolder ? 'folder' : this.getIconForFile(filename));

      const nameEl = chipEl.createSpan({ cls: 'claudian-file-chip-name' });
      nameEl.setText(filename);
      nameEl.setAttribute('title', displayPath);

      if (!isFolder) {
        chipEl.addEventListener('click', () => {
          const fileManager = (this.plugin as any).fileManager;
          if (fileManager) {
            fileManager.openFile(displayPath);
          }
        });
      } else {
        chipEl.style.cursor = 'default';
      }
    }
  }

  /**
   * Renders image attachments above a message.
   */
  renderMessageImages(containerEl: HTMLElement, images: ImageAttachment[]): void {
    const imagesEl = containerEl.createDiv({ cls: 'claudian-message-images' });

    for (const image of images) {
      const imageWrapper = imagesEl.createDiv({ cls: 'claudian-message-image' });
      const imgEl = imageWrapper.createEl('img', {
        attr: {
          alt: image.name,
        },
      });

      void this.setImageSrc(imgEl, image);

      // Click to view full size
      imgEl.addEventListener('click', () => {
        void this.showFullImage(image);
      });
    }
  }

  /**
   * Shows full-size image in modal overlay.
   */
  showFullImage(image: ImageAttachment): void {
    const dataUri = `data:${image.mediaType};base64,${image.data}`;

    const overlay = document.body.createDiv({ cls: 'claudian-image-modal-overlay' });
    const modal = overlay.createDiv({ cls: 'claudian-image-modal' });

    modal.createEl('img', {
      attr: {
        src: dataUri,
        alt: image.name,
      },
    });

    const closeBtn = modal.createDiv({ cls: 'claudian-image-modal-close' });
    closeBtn.setText('\u00D7');

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };

    const close = () => {
      document.removeEventListener('keydown', handleEsc);
      overlay.remove();
    };

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', handleEsc);
  }

  /**
   * Sets image src from attachment data.
   */
  setImageSrc(imgEl: HTMLImageElement, image: ImageAttachment): void {
    const dataUri = `data:${image.mediaType};base64,${image.data}`;
    imgEl.setAttribute('src', dataUri);
  }

  // ============================================
  // Content Rendering
  // ============================================

  /**
   * Renders markdown content with code block enhancements.
   */
  async renderContent(el: HTMLElement, markdown: string): Promise<void> {
    el.empty();

    try {
      // Replace image embeds with HTML img tags before rendering
      const processedMarkdown = replaceImageEmbedsWithHtml(
        markdown,
        this.app,
        this.plugin.settings.mediaFolder
      );
      await MarkdownRenderer.renderMarkdown(processedMarkdown, el, '', this.component);

      // Wrap pre elements and move buttons outside scroll area
      el.querySelectorAll('pre').forEach((pre) => {
        // Skip if already wrapped
        if (pre.parentElement?.classList.contains('claudian-code-wrapper')) return;

        // Create wrapper
        const wrapper = createEl('div', { cls: 'claudian-code-wrapper' });
        pre.parentElement?.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);

        // Check for language class and add label
        const code = pre.querySelector('code[class*="language-"]');
        if (code) {
          const match = code.className.match(/language-(\w+)/);
          if (match) {
            wrapper.classList.add('has-language');
            const label = createEl('span', {
              cls: 'claudian-code-lang-label',
              text: match[1],
            });
            wrapper.appendChild(label);
            label.addEventListener('click', async () => {
              try {
                await navigator.clipboard.writeText(code.textContent || '');
                label.setText(t('chat.renderer.copied' as any));
                setTimeout(() => label.setText(match[1]), 1500);
              } catch {
                // Clipboard API may fail in non-secure contexts
              }
            });
          }
        }

        // Move Obsidian's copy button outside pre into wrapper
        const copyBtn = pre.querySelector('.copy-code-button');
        if (copyBtn) {
          wrapper.appendChild(copyBtn);
        }
      });

      // Process file paths to make them clickable links
      processFileLinks(this.app, el);

      // Convert Obsidian's internal links back to our rich inline file chips
      el.querySelectorAll('a.internal-link').forEach(link => {
        const a = link as HTMLAnchorElement;
        const path = a.getAttribute('data-href');
        if (path) {
          a.classList.add('claudian-inline-file', 'claudian-file-chip-readonly');
          a.innerHTML = '';
          
          const isFolder = path.endsWith('/');
          const filename = path.split('/').filter(Boolean).pop() || path;
          
          const iconWrapper = a.createDiv({ cls: 'claudian-inline-chip-icon-wrapper' });
        const iconInner = iconWrapper.createDiv({ cls: 'claudian-inline-chip-icon' });
        
        // Dynamically import Svelte components to avoid CJS Jest test failures
        Promise.all([
          import('svelte'),
          import('../../../components/ChatFileIcon.svelte')
        ]).then(([{ mount }, { default: ChatFileIcon }]) => {
          mount(ChatFileIcon, {
            target: iconInner,
            props: {
              filename: filename,
              isDir: isFolder,
              isEmptyDir: false,
              className: 'lucide'
            }
          });
        }).catch(() => { /* ignore */ });
        
        a.createSpan({ cls: 'claudian-inline-chip-name', text: filename });
        }
      });
    } catch {
      el.createDiv({
        cls: 'claudian-render-error',
        text: 'Failed to render message content.',
      });
    }
  }

  // ============================================
  // Action Buttons (Save, Copy)
  // ============================================

  /** Clipboard icon SVG for copy button. */
  private static readonly COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  
  /** Save icon SVG for save to note button (lucide-file-text). */
  private static readonly SAVE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>`;

  /**
   * Adds action buttons (Save to Note, Copy) to a text block.
   * Buttons show icons on hover, change to feedback text on click.
   * @param textEl The rendered text element
   * @param markdown The original markdown content to copy/save
   */
  addTextActionButtons(textEl: HTMLElement, markdown: string): void {
    const actionsContainer = textEl.createDiv({ cls: 'claudian-text-actions' });

    // Copy Button (Moved to first)
    const copyBtn = actionsContainer.createSpan({ cls: 'claudian-text-action-btn claudian-text-copy-btn' });
    copyBtn.innerHTML = MessageRenderer.COPY_ICON;
    copyBtn.setAttribute('aria-label', t('chat.renderer.copyMessage' as any));

    let copyFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;

    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      try {
        await navigator.clipboard.writeText(markdown);
      } catch {
        return;
      }

      if (copyFeedbackTimeout) clearTimeout(copyFeedbackTimeout);

      copyBtn.innerHTML = '';
      copyBtn.setText(t('chat.renderer.copied' as any));
      copyBtn.classList.add('action-success');

      copyFeedbackTimeout = setTimeout(() => {
        copyBtn.innerHTML = MessageRenderer.COPY_ICON;
        copyBtn.classList.remove('action-success');
        copyFeedbackTimeout = null;
      }, 1500);
    });

    // Save Button (Moved to second)
    const saveBtn = actionsContainer.createSpan({ cls: 'claudian-text-action-btn claudian-text-save-btn' });
    saveBtn.innerHTML = MessageRenderer.SAVE_ICON;
    saveBtn.setAttribute('aria-label', t('chat.renderer.saveToNote' as any));

    let saveFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;

    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      const now = new Date();
      const yyyy = now.getFullYear();
      const MM = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      const formattedTime = `${yyyy}${MM}${dd}-${hh}${mm}${ss}`;
      const fallbackFilename = `response-${formattedTime}.md`;
        
      const saveModal = new SaveNoteModal(
        this.app, 
        t('chat.renderer.generatingTitle' as any) || 'Generating filename...', 
        markdown, 
        async (filename, folderPath) => {
          try {
            // Construct full path
            const fullPath = folderPath === '/' ? filename : `${folderPath}/${filename}`;
            
            // Create the file
            const file = await this.app.vault.create(fullPath, markdown);
            
            // Open the file in a new leaf
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.openFile(file);

            if (saveFeedbackTimeout) clearTimeout(saveFeedbackTimeout);

            saveBtn.innerHTML = '';
            saveBtn.setText(t('chat.renderer.saved' as any));
            saveBtn.classList.add('action-success');

            saveFeedbackTimeout = setTimeout(() => {
              saveBtn.innerHTML = MessageRenderer.SAVE_ICON;
              saveBtn.classList.remove('action-success');
              saveFeedbackTimeout = null;
            }, 1500);
          } catch (err) {
            new Notice(`Failed to save note: ${err instanceof Error ? err.message : 'Unknown error'}`);
            throw err;
          }
        },
        true // isGenerating = true
      );
      saveModal.open();

      // Call LLM to generate title
      try {
        const titleService = new TitleGenerationService(this.plugin);
        const tempId = `save-note-${Date.now()}`;
        
        // Pass the markdown content to generate a short title using localized prompt
        const prompt = t('chat.renderer.generateFilenamePrompt' as any, { text: markdown }) ||
                       `Provide a very short, concise filename in English (without extension, max 10 chars) for this text:\n\n${markdown}`;

        await titleService.generateTitle(
          tempId,
          prompt,
          async (id, result) => {
            if (result.success && result.title) {
              // Sanitize the title to be a valid filename
              const cleanTitle = result.title.replace(/[\\/:"*?<>|]/g, '').replace(/\s+/g, '-');
              saveModal.updateFilename(`${cleanTitle}.md`);
            } else {
              saveModal.setGenerationFailed(fallbackFilename);
            }
          }
        );
      } catch {
        // Fallback handled silently
        saveModal.setGenerationFailed(fallbackFilename);
      }
    });
  }

  refreshActionButtons(msg: ChatMessage, allMessages?: ChatMessage[], index?: number): void {
    if (!msg.sdkUserUuid) return;
    if (!this.isRewindEligible(allMessages, index)) return;
    const msgEl = this.liveMessageEls.get(msg.id);
    if (!msgEl) return;

    if (this.rewindCallback && !msgEl.querySelector('.claudian-message-rewind-btn')) {
      this.addRewindButton(msgEl, msg.id);
    }
    if (this.forkCallback && !msgEl.querySelector('.claudian-message-fork-btn')) {
      this.addForkButton(msgEl, msg.id);
    }
    this.cleanupLiveMessageEl(msg.id, msgEl);
  }

  private cleanupLiveMessageEl(msgId: string, msgEl: HTMLElement): void {
    const needsRewind = this.rewindCallback && !msgEl.querySelector('.claudian-message-rewind-btn');
    const needsFork = this.forkCallback && !msgEl.querySelector('.claudian-message-fork-btn');
    if (!needsRewind && !needsFork) {
      this.liveMessageEls.delete(msgId);
    }
  }

  private getOrCreateActionsToolbar(msgEl: HTMLElement): HTMLElement {
    const existing = msgEl.querySelector('.claudian-user-msg-actions') as HTMLElement | null;
    if (existing) return existing;
    return msgEl.createDiv({ cls: 'claudian-user-msg-actions' });
  }

  private addUserCopyButton(msgEl: HTMLElement, content: string): void {
    const toolbar = this.getOrCreateActionsToolbar(msgEl);
    const copyBtn = toolbar.createSpan({ cls: 'claudian-user-msg-copy-btn' });
    copyBtn.innerHTML = MessageRenderer.COPY_ICON;
    copyBtn.setAttribute('aria-label', t('chat.renderer.copyMessage' as any));

    let feedbackTimeout: ReturnType<typeof setTimeout> | null = null;

    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(content);
      } catch {
        return;
      }
      if (feedbackTimeout) clearTimeout(feedbackTimeout);
      copyBtn.innerHTML = '';
      copyBtn.setText(t('chat.renderer.copied' as any));
      copyBtn.classList.add('copied');
      feedbackTimeout = setTimeout(() => {
        copyBtn.innerHTML = MessageRenderer.COPY_ICON;
        copyBtn.classList.remove('copied');
        feedbackTimeout = null;
      }, 1500);
    });
  }

  private addRewindButton(msgEl: HTMLElement, messageId: string): void {
    const toolbar = this.getOrCreateActionsToolbar(msgEl);
    const btn = toolbar.createSpan({ cls: 'claudian-message-rewind-btn' });
    if (toolbar.firstChild !== btn) toolbar.insertBefore(btn, toolbar.firstChild);
    btn.innerHTML = MessageRenderer.REWIND_ICON;
    btn.setAttribute('aria-label', t('chat.rewind.ariaLabel'));
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await this.rewindCallback?.(messageId);
      } catch (err) {
        new Notice(t('chat.rewind.failed', { error: err instanceof Error ? err.message : 'Unknown error' }));
      }
    });
  }

  private addForkButton(msgEl: HTMLElement, messageId: string): void {
    const toolbar = this.getOrCreateActionsToolbar(msgEl);
    const btn = toolbar.createSpan({ cls: 'claudian-message-fork-btn' });
    if (toolbar.firstChild !== btn) toolbar.insertBefore(btn, toolbar.firstChild);
    btn.innerHTML = MessageRenderer.FORK_ICON;
    btn.setAttribute('aria-label', t('chat.fork.ariaLabel'));
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await this.forkCallback?.(messageId);
      } catch (err) {
        new Notice(t('chat.fork.failed', { error: err instanceof Error ? err.message : 'Unknown error' }));
      }
    });
  }

  // ============================================
  // Utilities
  // ============================================

  /** Scrolls messages container to bottom. */
  scrollToBottom(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /** Scrolls to bottom if already near bottom (within threshold). */
  scrollToBottomIfNeeded(threshold = 100): void {
    const { scrollTop, scrollHeight, clientHeight } = this.messagesEl;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < threshold;
    if (isNearBottom) {
      requestAnimationFrame(() => {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      });
    }
  }

}
