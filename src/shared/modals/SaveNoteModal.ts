import { App, Modal, Setting, TextComponent, FuzzySuggestModal, TFolder, setIcon, ButtonComponent } from 'obsidian';
import { t } from '../../i18n';

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  private folders: TFolder[];
  private onChoose: (item: TFolder) => void;

  constructor(app: App, folders: TFolder[], onChoose: (item: TFolder) => void) {
    super(app);
    this.folders = folders;
    this.onChoose = onChoose;
    this.setPlaceholder(t('chat.renderer.searchFolder' as any));
  }

  getItems(): TFolder[] {
    return this.folders;
  }

  getItemText(item: TFolder): string {
    return item.path;
  }

  onChooseItem(item: TFolder, evt: MouseEvent | KeyboardEvent): void {
    this.onChoose(item);
  }
}

export class SaveNoteModal extends Modal {
  private defaultFilename: string;
  private isGenerating: boolean;
  private markdown: string;
  private onSave: (filename: string, folderPath: string) => Promise<void>;

  private filenameInput: TextComponent;
  private saveBtn: ButtonComponent;
  private folderPath: string = '/';
  private generatingOverlay: HTMLSpanElement | null = null;

  constructor(
    app: App, 
    defaultFilename: string, 
    markdown: string, 
    onSave: (filename: string, folderPath: string) => Promise<void>,
    isGenerating: boolean = false
  ) {
    super(app);
    this.defaultFilename = defaultFilename;
    this.markdown = markdown;
    this.onSave = onSave;
    this.isGenerating = isGenerating;
  }

  public updateFilename(newFilename: string) {
    this.defaultFilename = newFilename;
    this.isGenerating = false;
    if (this.filenameInput) {
      this.filenameInput.setValue(newFilename);
      this.filenameInput.setDisabled(false);
      this.filenameInput.inputEl.style.color = '';
      this.generatingOverlay?.remove();
      this.generatingOverlay = null;
      this.validateInput();
    }
  }

  public setGenerationFailed(fallbackFilename: string) {
    this.defaultFilename = fallbackFilename;
    this.isGenerating = false;
    if (this.filenameInput) {
      this.filenameInput.setValue(fallbackFilename);
      this.filenameInput.setDisabled(false);
      this.filenameInput.inputEl.style.color = '';
      this.generatingOverlay?.remove();
      this.generatingOverlay = null;
      this.validateInput();
    }
  }

  private validateInput() {
    if (this.isGenerating) {
      if (this.saveBtn) this.saveBtn.setDisabled(true);
      return;
    }
    
    if (!this.defaultFilename || this.defaultFilename.trim() === '') {
      this.filenameInput.inputEl.style.borderColor = 'var(--text-error)';
      if (this.saveBtn) {
        this.saveBtn.setDisabled(true);
      }
    } else {
      this.filenameInput.inputEl.style.borderColor = '';
      if (this.saveBtn) {
        this.saveBtn.setDisabled(false);
      }
    }
  }

  onOpen() {
    const { contentEl } = this;
    this.setTitle(t('chat.renderer.saveToNote' as any));
    
    // Create an active file's folder as default if available
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && activeFile.parent) {
      this.folderPath = activeFile.parent.path === '/' ? '/' : activeFile.parent.path;
    }

    // File name setting
    const fileNameSetting = new Setting(contentEl)
      .setName(t('chat.renderer.fileName' as any));
      
    fileNameSetting.addText(text => {
      this.filenameInput = text;
      text.setValue(this.defaultFilename)
          .onChange(value => {
            this.defaultFilename = value;
            this.validateInput();
          });
      
      if (this.isGenerating) {
        text.setDisabled(true);
        text.inputEl.style.color = 'transparent';
        text.inputEl.style.caretColor = 'transparent';
      }
      
      // Expand the input box
      text.inputEl.style.width = '100%';
      text.inputEl.style.minWidth = '280px';
      text.inputEl.style.paddingRight = '30px'; // Make room for the clear button
      
      // Wrap the input element to position the clear button inside
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.width = '100%';
      
      text.inputEl.parentNode?.replaceChild(wrapper, text.inputEl);
      wrapper.appendChild(text.inputEl);

      // Add gradient text overlay when generating
      if (this.isGenerating) {
        const overlay = document.createElement('span');
        overlay.addClass('claudian-generating-overlay');
        overlay.textContent = this.defaultFilename;
        // Match input font styling
        const inputEl = text.inputEl;
        overlay.style.fontSize = getComputedStyle(inputEl).fontSize;
        overlay.style.fontFamily = getComputedStyle(inputEl).fontFamily;
        overlay.style.fontWeight = getComputedStyle(inputEl).fontWeight;
        overlay.style.lineHeight = getComputedStyle(inputEl).lineHeight;
        overlay.style.letterSpacing = getComputedStyle(inputEl).letterSpacing;
        wrapper.appendChild(overlay);
        this.generatingOverlay = overlay;
      }
      
      // Add the clear (x) button
      const clearBtn = wrapper.createSpan({ cls: 'clickable-icon' });
      setIcon(clearBtn, 'x');
      clearBtn.style.position = 'absolute';
      clearBtn.style.right = '4px';
      clearBtn.style.display = 'flex';
      clearBtn.style.alignItems = 'center';
      clearBtn.style.justifyContent = 'center';
      
      // Only show clear button when there's text
      const updateClearBtnVisibility = () => {
        clearBtn.style.display = this.defaultFilename ? 'flex' : 'none';
      };
      
      // Update visibility on input change
      text.inputEl.addEventListener('input', () => {
        updateClearBtnVisibility();
      });
      
      // Initial visibility
      updateClearBtnVisibility();
      
      clearBtn.addEventListener('click', () => {
          text.setValue('');
          this.defaultFilename = '';
          this.validateInput();
          updateClearBtnVisibility();
          text.inputEl.focus();
      });
    });
    
    // Adjust Setting's layout to give more space to the input
    fileNameSetting.infoEl.style.flex = '0 0 auto';
    fileNameSetting.infoEl.style.marginRight = '16px';
    fileNameSetting.controlEl.style.flex = '1 1 auto';
    fileNameSetting.controlEl.style.justifyContent = 'flex-end';

    // Folder selection setting
    const folderSetting = new Setting(contentEl)
      .setName(t('chat.renderer.folder' as any))
      .setDesc(this.folderPath === '/' ? t('chat.renderer.rootFolder' as any) : this.folderPath);
      
    folderSetting.addButton(btn => 
      btn.setButtonText(t('chat.renderer.changeFolder' as any))
         .onClick(() => {
           // Get all folders
           const folders = this.app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder) as TFolder[];
           // Add root folder manually as a virtual TFolder for selection if needed, 
           // but Obsidian's getRoot() works too
           const rootFolder = this.app.vault.getRoot();
           if (!folders.includes(rootFolder)) {
             folders.unshift(rootFolder);
           }
           
           new FolderSuggestModal(this.app, folders, (folder) => {
             this.folderPath = folder.path;
             folderSetting.setDesc(this.folderPath === '/' ? t('chat.renderer.rootFolder' as any) : this.folderPath);
           }).open();
         })
    );

    // Buttons
    new Setting(contentEl)
      .addButton(btn => 
        btn.setButtonText(t('common.cancel' as any))
           .onClick(() => this.close())
      )
      .addButton(btn => {
        this.saveBtn = btn;
        btn.setButtonText(t('common.save' as any))
           .setCta()
           .onClick(async () => {
             if (!this.defaultFilename || this.defaultFilename.trim() === '') {
                return; // Prevent empty filename
             }
             // Add .md if missing
             if (!this.defaultFilename.endsWith('.md')) {
                 this.defaultFilename += '.md';
             }
             btn.setDisabled(true);
             btn.setButtonText(t('common.saving' as any));
             try {
                await this.onSave(this.defaultFilename, this.folderPath);
                this.close();
             } catch (err) {
                btn.setDisabled(false);
                btn.setButtonText(t('common.save' as any));
             }
           })
      });
      
    // Initial validation check
    this.validateInput();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}