export interface LocalStorageEnvelope<T> {
  v: number;
  data: T;
}

export interface LocalStorageOptions<T> {
  version: number;
  migrate?: (raw: unknown, fromVersion: number) => T;
}

export class LocalStorageHelper<T> {
  constructor(
    private readonly key: string,
    private readonly options: LocalStorageOptions<T>
  ) {}

  get(): T | null {
    if (typeof window === 'undefined') return null;

    const raw = window.localStorage.getItem(this.key);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return null;

      const envelope = parsed as Partial<LocalStorageEnvelope<T>>;
      const version = typeof envelope.v === 'number' ? envelope.v : 1;

      if (version === this.options.version && envelope.data !== undefined) {
        return envelope.data as T;
      }

      if (this.options.migrate) {
        return this.options.migrate(envelope.data, version);
      }

      return null;
    } catch {
      return null;
    }
  }

  set(value: T): void {
    if (typeof window === 'undefined') return;
    const payload: LocalStorageEnvelope<T> = {
      v: this.options.version,
      data: value,
    };
    window.localStorage.setItem(this.key, JSON.stringify(payload));
  }

  remove(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(this.key);
  }
}
