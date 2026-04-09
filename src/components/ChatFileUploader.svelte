<script lang="ts">
  import ChatFileIcon from "./ChatFileIcon.svelte";
  import { handleDropEvent } from "../utils/dragDrop";

  export let files: Array<{
    id: string;
    name: string;
    size: number;
    isDir: boolean;
    isEmptyDir: boolean;
  }> = [];

  let isDragging = false;
  let dragCounter = 0;

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragCounter++;
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      isDragging = false;
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  async function handleDrop(e: DragEvent) {
    dragCounter = 0;
    isDragging = false;
    await handleDropEvent(e, addFile);
  }

  function formatSize(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function addFile(name: string, size: number, isDir: boolean, isEmptyDir: boolean) {
    files = [...files, {
      id: crypto.randomUUID(),
      name,
      size,
      isDir,
      isEmptyDir
    }];
  }

  // Virtual Scrolling Logic
  let containerHeight = 400; // default height
  let itemHeight = 48; // px
  let scrollTop = 0;

  $: startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 2);
  $: endIndex = Math.min(files.length, Math.ceil((scrollTop + containerHeight) / itemHeight) + 2);
  $: visibleFiles = files.slice(startIndex, endIndex);
  $: totalHeight = files.length * itemHeight;
  $: offsetY = startIndex * itemHeight;

  function handleScroll(e: Event) {
    scrollTop = (e.target as HTMLElement).scrollTop;
  }
</script>

<div 
  class="chat-file-uploader {isDragging ? 'dragging' : ''}"
  on:dragenter={handleDragEnter}
  on:dragleave={handleDragLeave}
  on:dragover={handleDragOver}
  on:drop={handleDrop}
  style="height: {containerHeight}px;"
>
  {#if isDragging}
    <div class="drag-overlay">
      <div class="drag-message">松开鼠标上传文件 / 文件夹</div>
    </div>
  {/if}

  <div class="virtual-scroll-container" on:scroll={handleScroll}>
    <div class="virtual-scroll-inner" style="height: {totalHeight}px;">
      <div style="position: absolute; top: {offsetY}px; left: 0; right: 0; width: 100%;">
        {#each visibleFiles as file (file.id)}
          <div class="file-item" style="height: {itemHeight}px;">
            <div class="file-icon-wrapper">
              <ChatFileIcon 
                filename={file.name} 
                isDir={file.isDir} 
                isEmptyDir={file.isEmptyDir} 
              />
            </div>
            <div class="file-info">
              <span class="file-name" title={file.name}>{file.name}</span>
              {#if !file.isDir}
                <span class="file-size">{formatSize(file.size)}</span>
              {/if}
            </div>
          </div>
        {/each}
        {#if files.length === 0}
          <div class="empty-state">
            <p>拖拽文件或文件夹到此处上传</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .chat-file-uploader {
    position: relative;
    border: 2px dashed #e2e8f0;
    border-radius: 8px;
    background-color: #f8fafc;
    overflow: hidden;
    transition: all 0.2s ease;
  }

  .chat-file-uploader.dragging {
    border-color: #3b82f6;
    background-color: #eff6ff;
  }

  .drag-overlay {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    pointer-events: none;
  }

  .drag-message {
    font-size: 1.125rem;
    font-weight: 500;
    color: #3b82f6;
    pointer-events: none;
  }

  .virtual-scroll-container {
    height: 100%;
    overflow-y: auto;
    position: relative;
  }

  .virtual-scroll-inner {
    position: relative;
    width: 100%;
  }

  .file-item {
    display: flex;
    align-items: center;
    padding: 0 16px;
    border-bottom: 1px solid #f1f5f9;
    background-color: white;
    box-sizing: border-box;
  }

  .file-item:hover {
    background-color: #f8fafc;
  }

  .file-icon-wrapper {
    margin-right: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .file-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
    flex: 1;
  }

  .file-name {
    font-size: 0.875rem;
    color: #334155;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
  }

  .file-size {
    font-size: 0.75rem;
    color: #94a3b8;
    margin-top: 2px;
  }

  .empty-state {
    padding: 32px;
    text-align: center;
    color: #94a3b8;
    font-size: 0.875rem;
  }
</style>
