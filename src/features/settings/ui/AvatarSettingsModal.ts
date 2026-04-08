import type { App} from 'obsidian';
import { Modal, Notice, setIcon,Setting } from 'obsidian';

import { t } from '../../../i18n';
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

    contentEl.createEl('h2', { text: t('settings.avatarSettings.title' as any) });

    // User Avatar Setting
    this.createAvatarUploadSetting(
      contentEl,
      t('settings.avatarSettings.userAvatar' as any),
      t('settings.avatarSettings.uploadDesc' as any),
      this.tempUserAvatar,
      (base64) => { this.tempUserAvatar = base64; }
    );

    // AI Avatar Setting
    this.createAvatarUploadSetting(
      contentEl,
      t('settings.avatarSettings.aiAvatar' as any),
      t('settings.avatarSettings.uploadDesc' as any),
      this.tempAIAvatar,
      (base64) => { this.tempAIAvatar = base64; }
    );

    const buttonContainer = contentEl.createDiv({ cls: 'claudian-avatar-modal-buttons' });
    
    const saveBtn = buttonContainer.createEl('button', {
      text: t('common.save' as any),
      cls: 'mod-cta'
    });
    saveBtn.addEventListener('click', async () => {
      this.plugin.settings.userAvatar = this.tempUserAvatar;
      this.plugin.settings.aiAvatar = this.tempAIAvatar;
      await this.plugin.saveSettings();
      new Notice(t('settings.avatarSettings.saved' as any));
      
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
      text: t('common.cancel' as any)
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

    // Main wrapper for avatar and clear button
    const controlWrapper = setting.controlEl.createDiv({ cls: 'claudian-avatar-control-wrapper' });

    // Interactive avatar area
    const avatarWrapper = controlWrapper.createDiv({ cls: 'claudian-avatar-interactive-wrapper' });
    
    // The image preview
    const previewEl = avatarWrapper.createEl('img', { cls: 'claudian-avatar-preview' });
    if (currentAvatar) {
      previewEl.src = currentAvatar;
      previewEl.style.display = 'block';
    } else {
      previewEl.style.display = 'none';
      // Provide a fallback placeholder or empty state background if needed via CSS
      avatarWrapper.addClass('claudian-avatar-empty');
    }

    // The camera overlay
    const overlayEl = avatarWrapper.createDiv({ cls: 'claudian-avatar-overlay' });
    const cameraIconEl = overlayEl.createSpan({ cls: 'claudian-avatar-camera-icon' });
    setIcon(cameraIconEl, 'camera');

    // Hidden file input
    const fileInput = avatarWrapper.createEl('input', {
      type: 'file',
      attr: { accept: ALLOWED_TYPES.join(',') }
    });
    fileInput.style.display = 'none'; // Completely hidden

    // Click anywhere on the avatar triggers the file input
    avatarWrapper.addEventListener('click', () => {
      fileInput.click();
    });

    // Clear button (now beside the avatar wrapper)
    const clearBtn = controlWrapper.createEl('button', {
      text: t('common.clear' as any),
      cls: 'claudian-avatar-clear-btn'
    });
    
    if (!currentAvatar) {
      clearBtn.style.display = 'none';
    }

    clearBtn.addEventListener('click', () => {
      onUpload('');
      previewEl.src = '';
      previewEl.style.display = 'none';
      avatarWrapper.addClass('claudian-avatar-empty');
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
        new Notice('File size exceeds 5MB limit.');
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
            avatarWrapper.removeClass('claudian-avatar-empty');
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