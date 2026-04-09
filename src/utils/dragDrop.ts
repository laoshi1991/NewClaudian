export interface FileEntry {
  id: string;
  name: string;
  size: number;
  isDir: boolean;
  isEmptyDir: boolean;
}

export async function handleDropEvent(
  e: DragEvent,
  addFileCallback: (name: string, size: number, isDir: boolean, isEmptyDir: boolean) => void
) {
  e.preventDefault();
  if (!e.dataTransfer) return;

  const items = Array.from(e.dataTransfer.items);
  const entries = items.map(item => {
    // webkitGetAsEntry is standard in most modern browsers for directory support
    return typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
  }).filter(Boolean);

  for (const entry of entries) {
    if (entry) {
      await traverseEntry(entry, addFileCallback);
    }
  }
}

export async function traverseEntry(
  entry: any,
  addFileCallback: (name: string, size: number, isDir: boolean, isEmptyDir: boolean) => void
) {
  if (entry.isFile) {
    const file = await new Promise<File>(resolve => entry.file(resolve));
    addFileCallback(file.name, file.size, false, false);
  } else if (entry.isDirectory) {
    const dirReader = entry.createReader();
    const entries = await new Promise<any[]>(resolve => {
      dirReader.readEntries(resolve);
    });
    addFileCallback(entry.name, 0, true, entries.length === 0);
    for (const child of entries) {
      await traverseEntry(child, addFileCallback);
    }
  }
}
