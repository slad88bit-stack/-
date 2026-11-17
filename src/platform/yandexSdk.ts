// Yandex Games SDK v2 safe wrapper (works identically on Yandex Games and in local browser preview)

interface YaPlayer {
  getData: (keys?: string[]) => Promise<Record<string, unknown>>;
  setData: (data: Record<string, unknown>, flush?: boolean) => Promise<void>;
}

interface YaSdkInstance {
  environment?: {
    i18n?: {
      lang?: string;
      tld?: string;
    };
  };
  features?: {
    LoadingAPI?: {
      ready: () => void;
    };
    GameplayAPI?: {
      start: () => void;
      stop: () => void;
    };
  };
  adv?: {
    showFullscreenAdv: (opts: {
      callbacks?: {
        onOpen?: () => void;
        onClose?: (wasShown: boolean) => void;
        onError?: (err: unknown) => void;
        onOffline?: () => void;
      };
    }) => void;
  };
  on?: (event: string, cb: () => void) => void;
  off?: (event: string, cb: () => void) => void;
  getPlayer?: (opts?: { scopes?: boolean }) => Promise<YaPlayer>;
}

declare global {
  interface Window {
    YaGames?: {
      init: () => Promise<YaSdkInstance>;
    };
  }
}

export interface YandexLifecycleHandlers {
  onPause?: () => void;
  onResume?: () => void;
}

class YandexGamesBridge {
  private ysdk: YaSdkInstance | null = null;
  private player: YaPlayer | null = null;
  private initPromise: Promise<void> | null = null;
  private readySent = false;
  private pendingReady = false;
  private gameplayActive = false;
  private handlers: YandexLifecycleHandlers = {};
  private cloudSaveTimer: number | null = null;

  public isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.YaGames?.init === 'function';
  }

  public isInitialized(): boolean {
    return this.ysdk !== null;
  }

  public getLang(): string {
    return this.ysdk?.environment?.i18n?.lang || 'ru';
  }

  public setLifecycleHandlers(handlers: YandexLifecycleHandlers): void {
    this.handlers = handlers;
  }

  public init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (!this.isAvailable()) return;

      try {
        const sdk = await window.YaGames!.init();
        this.ysdk = sdk;

        // Subscribe to platform pause/resume events (ads, account dialog, tab focus)
        sdk.on?.('game_api_pause', () => {
          this.setGameplayActive(false);
          this.handlers.onPause?.();
        });
        sdk.on?.('game_api_resume', () => {
          this.handlers.onResume?.();
          this.setGameplayActive(true);
        });

        // Non-intrusive player object (guest or signed-in, never forces auth dialog)
        try {
          if (sdk.getPlayer) {
            this.player = await sdk.getPlayer({ scopes: false });
          }
        } catch {
          this.player = null;
        }

        if (this.pendingReady && !this.readySent) {
          this.flushReady();
        }
      } catch (err) {
        console.warn('[YandexSDK] Init skipped or failed:', err);
      }
    })();

    return this.initPromise;
  }

  private flushReady(): void {
    if (this.readySent || !this.ysdk) return;
    this.readySent = true;
    this.pendingReady = false;
    try {
      this.ysdk.features?.LoadingAPI?.ready();
    } catch {
      // ignore
    }
    this.setGameplayActive(true);
  }

  /**
   * Must be called once the 3D scene and initial character are fully loaded and interactive.
   */
  public signalGameReady(): void {
    if (this.readySent) return;
    if (this.ysdk) {
      this.flushReady();
    } else {
      this.pendingReady = true;
    }
  }

  /**
   * Sends GameplayAPI.start() / stop() strictly without duplicate consecutive transitions.
   */
  public setGameplayActive(active: boolean): void {
    if (!this.ysdk || this.gameplayActive === active) return;
    this.gameplayActive = active;
    try {
      if (active) {
        this.ysdk.features?.GameplayAPI?.start();
      } else {
        this.ysdk.features?.GameplayAPI?.stop();
      }
    } catch {
      // ignore
    }
  }

  public async loadCloudData<T>(key: string): Promise<T | null> {
    await this.init();
    if (!this.player) return null;
    try {
      const res = await this.player.getData([key]);
      if (res && key in res && res[key] != null) {
        return res[key] as T;
      }
    } catch {
      // ignore cloud read failure; localStorage fallback stays active
    }
    return null;
  }

  public saveCloudData(key: string, value: unknown): void {
    if (!this.player) return;
    if (this.cloudSaveTimer !== null) {
      window.clearTimeout(this.cloudSaveTimer);
    }
    this.cloudSaveTimer = window.setTimeout(() => {
      this.cloudSaveTimer = null;
      if (!this.player) return;
      void this.player.setData({ [key]: value }, true).catch(() => {
        // ignore transient network errors
      });
    }, 1200);
  }

  public showFullscreenAdv(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.ysdk?.adv?.showFullscreenAdv) {
        resolve(false);
        return;
      }
      let settled = false;
      const done = (shown: boolean) => {
        if (settled) return;
        settled = true;
        this.handlers.onResume?.();
        this.setGameplayActive(true);
        resolve(shown);
      };

      this.setGameplayActive(false);
      this.handlers.onPause?.();
      try {
        this.ysdk.adv.showFullscreenAdv({
          callbacks: {
            onOpen: () => {
              this.setGameplayActive(false);
              this.handlers.onPause?.();
            },
            onClose: (wasShown) => done(Boolean(wasShown)),
            onError: () => done(false),
            onOffline: () => done(false),
          },
        });
      } catch {
        done(false);
      }
    });
  }
}

export const yandexSdk = new YandexGamesBridge();
