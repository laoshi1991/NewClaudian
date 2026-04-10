import { getFileIconConfig, iconMap, emptyFolderIcon, nonEmptyFolderIcon, defaultIcon } from '../../../src/utils/fileIconMap';

describe('fileIconMap', () => {
  it('returns default icon for unknown extension', () => {
    const config = getFileIconConfig('unknown.file', false, true);
    expect(config).toEqual(defaultIcon);
  });

  it('returns correct icon for JS files', () => {
    const config = getFileIconConfig('app.js', false, true);
    expect(config).toEqual(iconMap['js']);
    expect(config.color).toBe('#F7DF1E');
  });

  it('returns empty folder icon', () => {
    const config = getFileIconConfig('folder', true, true);
    expect(config).toEqual(emptyFolderIcon);
    expect(config.color).toBe('#B0BEC5');
  });

  it('returns non-empty folder icon', () => {
    const config = getFileIconConfig('folder', true, false);
    expect(config).toEqual(nonEmptyFolderIcon);
    expect(config.color).toBe('#FFCA28');
  });

  it('covers at least 15 required file types', () => {
    const requiredExts = [
      'ts', 'vue', 'json', 'md', 'pdf', 'zip', 'png', 'mp4',
      'mp3', 'html', 'css', 'sql', 'txt', 'docx', 'xlsx', 'pptx', 'sh'
    ];
    
    requiredExts.forEach(ext => {
      const config = getFileIconConfig(`file.${ext}`, false, true);
      expect(config).toEqual(iconMap[ext]);
      expect(config).toBeDefined();
      expect(config.color).toBeDefined();
    });
  });
});
