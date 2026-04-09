import { handleDropEvent, traverseEntry } from '@/utils/dragDrop';

describe('dragDrop utility', () => {
  it('intercepts drop event and prevents default', async () => {
    const mockPreventDefault = jest.fn();
    const mockAddFile = jest.fn();
    
    const mockEvent = {
      preventDefault: mockPreventDefault,
      dataTransfer: {
        items: []
      }
    } as unknown as DragEvent;

    await handleDropEvent(mockEvent, mockAddFile);
    
    expect(mockPreventDefault).toHaveBeenCalled();
  });

  it('traverses file entry correctly', async () => {
    const mockFile = { name: 'test.js', size: 1024 };
    const mockEntry = {
      isFile: true,
      isDirectory: false,
      file: (cb: (f: any) => void) => cb(mockFile)
    };
    
    const mockAddFile = jest.fn();
    await traverseEntry(mockEntry, mockAddFile);

    expect(mockAddFile).toHaveBeenCalledWith('test.js', 1024, false, false);
  });

  it('traverses empty directory entry correctly', async () => {
    const mockDirReader = {
      readEntries: (cb: (entries: any[]) => void) => cb([])
    };
    const mockEntry = {
      name: 'empty-dir',
      isFile: false,
      isDirectory: true,
      createReader: () => mockDirReader
    };
    
    const mockAddFile = jest.fn();
    await traverseEntry(mockEntry, mockAddFile);

    expect(mockAddFile).toHaveBeenCalledWith('empty-dir', 0, true, true);
  });

  it('traverses non-empty directory entry correctly', async () => {
    const mockFile = { name: 'child.txt', size: 100 };
    const childEntry = {
      isFile: true,
      isDirectory: false,
      file: (cb: (f: any) => void) => cb(mockFile)
    };
    
    const mockDirReader = {
      readEntries: (cb: (entries: any[]) => void) => cb([childEntry])
    };
    
    const mockEntry = {
      name: 'nested-dir',
      isFile: false,
      isDirectory: true,
      createReader: () => mockDirReader
    };
    
    const mockAddFile = jest.fn();
    await traverseEntry(mockEntry, mockAddFile);

    expect(mockAddFile).toHaveBeenCalledWith('nested-dir', 0, true, false);
    expect(mockAddFile).toHaveBeenCalledWith('child.txt', 100, false, false);
  });
});
