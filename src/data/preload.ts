/**
 * Preloads frame images so playback is smooth, and records which ones fail.
 * Live images come from EUMETView (cached by the browser for 7 days, per its
 * Cache-Control header); sample images are static files on our own host.
 */
export type ImageStatus = 'loading' | 'loaded' | 'failed';

export class ImagePreloader {
  private readonly status = new Map<string, ImageStatus>();
  private readonly waiting = new Map<string, Array<(status: ImageStatus) => void>>();

  /** Starts loading (once) and resolves with the final status. */
  load(url: string): Promise<ImageStatus> {
    const known = this.status.get(url);
    if (known === 'loaded' || known === 'failed') return Promise.resolve(known);

    const promise = new Promise<ImageStatus>((resolve) => {
      const callbacks = this.waiting.get(url) ?? [];
      callbacks.push(resolve);
      this.waiting.set(url, callbacks);
    });

    if (known === undefined) {
      this.status.set(url, 'loading');
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => this.finish(url, 'loaded');
      image.onerror = () => this.finish(url, 'failed');
      image.src = url;
    }
    return promise;
  }

  /** Loads URLs in order with at most `limit` requests in flight. */
  async loadAll(urls: string[], limit: number, onSettled: (url: string, status: ImageStatus) => void): Promise<void> {
    let next = 0;
    const worker = async () => {
      while (next < urls.length) {
        const url = urls[next++];
        onSettled(url, await this.load(url));
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, urls.length) }, worker));
  }

  statusOf(url: string): ImageStatus | undefined {
    return this.status.get(url);
  }

  private finish(url: string, status: ImageStatus): void {
    this.status.set(url, status);
    for (const resolve of this.waiting.get(url) ?? []) resolve(status);
    this.waiting.delete(url);
  }
}
