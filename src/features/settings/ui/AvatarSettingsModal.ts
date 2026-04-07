import type { App} from 'obsidian';
import { Modal, Notice,Setting } from 'obsidian';

import type ClaudianPlugin from '../../../main';
import { ImageCropperModal } from './ImageCropperModal';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif'];

export class AvatarSettingsModal extends Modal {
  private plugin: ClaudianPlugin;
  private tempUserAvatar: string = '';
  private tempAIAvatar: string = '';

  constructor(app: App, plugin: ClaudianPlugin) {
    super(app);
    this.plugin = plugin;
    this.tempUserAvatar = this.plugin.settings.userAvatar || '';
    this.tempAIAvatar = this.plugin.settings.aiAvatar || '';
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('claudian-avatar-modal');

    contentEl.createEl('h2', { text: 'Avatar Settings' });

    // User Avatar Setting
    this.createAvatarUploadSetting(
      contentEl,
      '我的头像',
      '上传图片（最大5MB），将自动裁剪为 1:1 正方形。',
      this.tempUserAvatar,
      (base64) => { this.tempUserAvatar = base64; }
    );

    // AI Avatar Setting
    this.createAvatarUploadSetting(
      contentEl,
      'AI头像',
      '上传图片（最大5MB），将自动裁剪为 1:1 正方形。',
      this.tempAIAvatar,
      (base64) => { this.tempAIAvatar = base64; }
    );

    const buttonContainer = contentEl.createDiv({ cls: 'claudian-avatar-modal-buttons' });
    
    const saveBtn = buttonContainer.createEl('button', {
      text: 'Save',
      cls: 'mod-cta'
    });
    saveBtn.addEventListener('click', async () => {
      this.plugin.settings.userAvatar = this.tempUserAvatar;
      this.plugin.settings.aiAvatar = this.tempAIAvatar;
      await this.plugin.saveSettings();
      new Notice('Avatars saved successfully');
      
      // Trigger a re-render for all views
      for (const view of this.plugin.getAllViews()) {
        const tabManager = view.getTabManager();
        if (tabManager) {
          for (const tab of tabManager.getAllTabs()) {
            if (tab.renderer && tab.controllers.conversationController) {
              tab.renderer.renderMessages(
                tab.state.messages, 
                () => tab.controllers.conversationController!.getGreeting()
              );
            }
          }
        }
      }
      
      this.close();
    });
    
    const cancelBtn = buttonContainer.createEl('button', {
      text: 'Cancel'
    });
    cancelBtn.addEventListener('click', () => {
      this.close();
    });
  }

  private createAvatarUploadSetting(
    container: HTMLElement, 
    name: string, 
    desc: string, 
    currentAvatar: string,
    onUpload: (base64: string) => void
  ) {
    const setting = new Setting(container)
      .setName(name)
      .setDesc(desc);

    const previewContainer = setting.controlEl.createDiv({ cls: 'claudian-avatar-preview-container' });
    
    const previewEl = previewContainer.createEl('img', { cls: 'claudian-avatar-preview' });
    if (currentAvatar) {
      previewEl.src = currentAvatar;
      previewEl.style.display = 'block';
    } else {
      previewEl.style.display = 'none';
    }

    const inputContainer = setting.controlEl.createDiv({ cls: 'claudian-avatar-input-container' });

    const fileInput = inputContainer.createEl('input', {
      type: 'file',
      attr: { accept: ALLOWED_TYPES.join(',') }
    });

    fileInput.title = ' ';

    const clearBtn = inputContainer.createEl('button', {
      text: 'Clear',
      cls: 'claudian-avatar-clear-btn'
    });
    
    if (!currentAvatar) {
      clearBtn.style.display = 'none';
    }

    clearBtn.addEventListener('click', () => {
      onUpload('');
      previewEl.src = '';
      previewEl.style.display = 'none';
      clearBtn.style.display = 'none';
      fileInput.value = '';
    });

    fileInput.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      if (!ALLOWED_TYPES.includes(file.type)) {
        new Notice('Invalid file type. Only JPG, PNG, and GIF are allowed.');
        target.value = '';
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        new Notice('File size exceeds 2MB limit.');
        target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          target.value = ''; // Reset input
          // Open cropper modal
          new ImageCropperModal(this.app, result, (croppedBase64) => {
            onUpload(croppedBase64);
            previewEl.src = croppedBase64;
            previewEl.style.display = 'block';
            clearBtn.style.display = 'inline-block';
            new Notice(`${name} uploaded and cropped successfully!`);
          }).open();
        }
      };
      reader.onerror = () => {
        new Notice('Error reading file.');
      };
      reader.readAsDataURL(file);
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}