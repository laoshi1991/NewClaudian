export function createMixedInput(parent: HTMLElement): HTMLTextAreaElement {
  const div = document.createElement('div');
  div.className = 'claudian-input claudian-mixed-input';
  div.setAttribute('contenteditable', 'true');
  div.setAttribute('placeholder', 'How can I help you today?');
  div.setAttribute('dir', 'auto');
  parent.appendChild(div);

  const svelteComponents = new Map<HTMLElement, any>();

  // Mount Svelte components on new chips
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (el.classList.contains('claudian-inline-file') && !svelteComponents.has(el)) {
            mountChip(el, svelteComponents);
          }
          el.querySelectorAll?.('.claudian-inline-file').forEach(child => {
            const childEl = child as HTMLElement;
            if (!svelteComponents.has(childEl)) mountChip(childEl, svelteComponents);
          });
        }
      });
      mutation.removedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (svelteComponents.has(el)) {
            import('svelte').then(({ unmount }) => {
              try { unmount(svelteComponents.get(el)); } catch { /* ignore */ }
            });
            svelteComponents.delete(el);
          }
          el.querySelectorAll?.('.claudian-inline-file').forEach(child => {
            const childEl = child as HTMLElement;
            if (svelteComponents.has(childEl)) {
              import('svelte').then(({ unmount }) => {
                try { unmount(svelteComponents.get(childEl)); } catch { /* ignore */ }
              });
              svelteComponents.delete(childEl);
            }
          });
        }
      });
    });
  });
  observer.observe(div, { childList: true, subtree: true });

  // Handle value
  Object.defineProperty(div, 'value', {
    get() {
      return serializeToText(div);
    },
    set(v: string) {
      deserializeFromText(div, v);
      // Wait for observer to trigger, or manually trigger mount
    }
  });

  Object.defineProperty(div, 'selectionStart', {
    get() {
      return getCaretPosition(div);
    },
    set(v: number) {
      setCaretPosition(div, v);
    }
  });

  Object.defineProperty(div, 'selectionEnd', {
    get() {
      return getCaretPosition(div);
    },
    set(v: number) {
      setCaretPosition(div, v);
    }
  });

  div.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain');
    if (text) {
      document.execCommand('insertText', false, text);
    }
  });

  // Add keydown to prevent enter from creating divs if possible
  div.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Usually Enter sends message. The controller handles this via inputEl.addEventListener('keydown')
    }
  });

  return div as unknown as HTMLTextAreaElement;
}

function mountChip(el: HTMLElement, componentsMap: Map<HTMLElement, any>) {
  const path = el.getAttribute('data-path') || '';
  const isFolder = path.endsWith('/');
  const displayPath = isFolder ? path.slice(0, -1) : path;
  const filename = displayPath.split('/').pop() || displayPath;

  el.innerHTML = '';
  
  const iconWrapper = el.createDiv({ cls: 'claudian-inline-chip-icon' });
  
  Promise.all([
    import('svelte'),
    import('../../../components/ChatFileIcon.svelte')
  ]).then(([{ mount }, { default: ChatFileIcon }]) => {
    const comp = mount(ChatFileIcon, {
      target: iconWrapper,
      props: {
        filename: filename,
        isDir: isFolder,
        isEmptyDir: false,
        className: 'lucide'
      }
    });
    componentsMap.set(el, comp);
  }).catch(() => { /* ignore */ });
  
  const nameEl = el.createSpan({ cls: 'claudian-inline-chip-name' });
  nameEl.setText(filename);
}

function serializeToText(root: HTMLElement): string {
  let text = '';
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.classList.contains('claudian-inline-file')) {
        text += `[[${el.getAttribute('data-path')}]]`;
      } else if (el.tagName === 'BR') {
        text += '\n';
      } else if (el.tagName === 'DIV' || el.tagName === 'P') {
        if (text.length > 0 && !text.endsWith('\n')) {
          text += '\n';
        }
        text += serializeToText(el);
      } else {
        text += serializeToText(el);
      }
    }
  }
  return text;
}

function deserializeFromText(root: HTMLElement, text: string) {
  root.innerHTML = '';
  if (!text) return;

  const regex = /\[\[([^\]]+)\]\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      insertTextNodes(root, text.slice(lastIndex, match.index));
    }
    
    const path = match[1];
    const span = document.createElement('span');
    span.className = 'claudian-inline-file';
    span.setAttribute('data-path', path);
    span.setAttribute('contenteditable', 'false');
    root.appendChild(span);
    
    // Add zero-width space after chip to allow cursor to be placed there
    root.appendChild(document.createTextNode('\u200B'));

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    insertTextNodes(root, text.slice(lastIndex));
  }
}

function insertTextNodes(root: HTMLElement, text: string) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) root.appendChild(document.createElement('br'));
    if (lines[i]) root.appendChild(document.createTextNode(lines[i]));
  }
}

function getCaretPosition(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  
  const range = sel.getRangeAt(0);
  
  // Create a new range from start of root to current cursor
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(root);
  preCaretRange.setEnd(range.endContainer, range.endOffset);
  
  // Clone the contents and serialize
  const fragment = preCaretRange.cloneContents();
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment);
  
  return serializeToText(tempDiv).length;
}

function setCaretPosition(root: HTMLElement, targetOffset: number) {
  const sel = window.getSelection();
  if (!sel) return;

  const range = document.createRange();
  let currentOffset = 0;
  let found = false;

  function traverse(node: Node) {
    if (found) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length || 0;
      if (currentOffset + length >= targetOffset) {
        range.setStart(node, targetOffset - currentOffset);
        range.setEnd(node, targetOffset - currentOffset);
        found = true;
      } else {
        currentOffset += length;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.classList.contains('claudian-inline-file')) {
        const path = el.getAttribute('data-path') || '';
        const length = `[[${path}]]`.length;
        if (currentOffset + length >= targetOffset) {
          range.setStartAfter(el);
          range.setEndAfter(el);
          found = true;
        } else {
          currentOffset += length;
        }
      } else if (el.tagName === 'BR') {
        if (currentOffset + 1 >= targetOffset) {
          range.setStartAfter(el);
          range.setEndAfter(el);
          found = true;
        } else {
          currentOffset += 1;
        }
      } else {
        // Only count newline for specific block elements if needed, but serializeToText adds them
        if (el !== root && (el.tagName === 'DIV' || el.tagName === 'P')) {
          if (currentOffset > 0) currentOffset += 1; // Assuming newline
        }
        for (const child of Array.from(el.childNodes)) {
          traverse(child);
        }
      }
    }
  }

  traverse(root);

  if (!found) {
    range.selectNodeContents(root);
    range.collapse(false);
  }

  sel.removeAllRanges();
  sel.addRange(range);
}

export function insertChipAtCursor(path: string, e?: DragEvent) {
  if (e && document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (range) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }
  
  const span = document.createElement('span');
  span.className = 'claudian-inline-file';
  span.setAttribute('data-path', path);
  span.setAttribute('contenteditable', 'false');
  
  // Wrap in a temporary div to get outerHTML
  const temp = document.createElement('div');
  temp.appendChild(span);
  
  // zero-width space for cursor movement
  document.execCommand('insertHTML', false, temp.innerHTML + '&#8203;'); 
}
