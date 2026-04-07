/**
 * Coordinates a single drag-and-drop overlay for multiple drop handlers.
 *
 * Problem solved: FileContextManager and ImageContextManager both register
 * dragenter/dragover/dragleave on the same element, causing duplicate event
 * firing (~120 calls/sec instead of ~60) and counter desync.
 *
 * This coordinator registers drag events exactly once, manages one overlay
 * and one dragCounter, and delegates only the `drop` event to registered
 * handlers.
 */

export interface DropHandler {
  /** Return true if this handler accepts the drag event types. */
  isValidDrag: (types: DOMStringList | readonly string[]) => boolean;
  /** Process the drop event. */
  handleDrop: (e: DragEvent) => void;
}

export class DropZoneCoordinator {
  private dropZone: HTMLElement;
  private overlay: HTMLElement | null;
  private handlers: DropHandler[] = [];
  private dragCounter = 0;
  private rafId = 0;

  constructor(dropZone: HTMLElement, overlay?: HTMLElement | null) {
    this.dropZone = dropZone;
    this.overlay = overlay ?? dropZone.querySelector('.claudian-drop-overlay') as HTMLElement | null;

    dropZone.addEventListener('dragenter', this.onDragEnter);
    dropZone.addEventListener('dragover', this.onDragOver);
    dropZone.addEventListener('dragleave', this.onDragLeave);
    dropZone.addEventListener('drop', this.onDrop);
  }

  registerHandler(handler: DropHandler): void {
    this.handlers.push(handler);
  }

  destroy(): void {
    this.dropZone.removeEventListener('dragenter', this.onDragEnter);
    this.dropZone.removeEventListener('dragover', this.onDragOver);
    this.dropZone.removeEventListener('dragleave', this.onDragLeave);
    this.dropZone.removeEventListener('drop', this.onDrop);
    this.cancelRaf();
    this.handlers.length = 0;
  }

  // ── Event handlers (bound once, no allocation on hot path) ──

  private onDragEnter = (e: Event): void => {
    const dragEvent = e as DragEvent;
    if (!this.anyHandlerValid(dragEvent.dataTransfer?.types)) return;
    dragEvent.preventDefault();
    dragEvent.stopPropagation();
    if (dragEvent.dataTransfer) dragEvent.dataTransfer.dropEffect = 'copy';
    this.dragCounter++;
    if (this.dragCounter === 1) {
      this.overlay?.addClass('visible');
    }
  };

  private onDragOver = (e: Event): void => {
    const dragEvent = e as DragEvent;
    if (!dragEvent.dataTransfer?.types) return;
    dragEvent.preventDefault();
    // Throttle with rAF — dropEffect is already set on dragenter
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
    });
  };

  private onDragLeave = (e: Event): void => {
    const dragEvent = e as DragEvent;
    if (!dragEvent.dataTransfer?.types) return;
    dragEvent.preventDefault();
    dragEvent.stopPropagation();
    this.dragCounter--;
    if (this.dragCounter <= 0) {
      this.dragCounter = 0;
      this.overlay?.removeClass('visible');
    }
  };

  private onDrop = (e: Event): void => {
    const dragEvent = e as DragEvent;
    if (!dragEvent.dataTransfer) return;
    dragEvent.preventDefault();
    dragEvent.stopPropagation();

    this.dragCounter = 0;
    this.overlay?.removeClass('visible');
    this.cancelRaf();

    for (const handler of this.handlers) {
      if (handler.isValidDrag(dragEvent.dataTransfer.types)) {
        handler.handleDrop(dragEvent);
      }
    }
  };

  // ── Helpers ──

  private anyHandlerValid(types: DOMStringList | readonly string[] | undefined): boolean {
    if (!types) return false;
    for (const handler of this.handlers) {
      if (handler.isValidDrag(types)) return true;
    }
    return false;
  }

  private cancelRaf(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }
}
