/**
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { decodeBase64, encodeBase64 } from '@std/encoding/base64';
import { Context as OakContext, CookiesGetOptions, CookiesSetDeleteOptions, Middleware } from '@oak/oak';

/**
 * Required session options.
 */
export interface SessionOptions<Value, Context extends OakContext> {
  /**
   * Name of the session cookie.
   */
  cookieName: string;

  /**
   * Cookie options to get the session data cookie.
   */
  cookiesGetOptions: CookiesGetOptions;

  /**
   * Cookie options to set and delete the session data cookie.
   * Note that Expires and Max-Age attributes should not be
   * set as it will be handled automatically by the store.
   */
  cookiesSetOptions: Omit<CookiesSetDeleteOptions, 'expires' | 'maxAge'>;

  /**
   * Number of seconds on when the session should expire.
   * For cookies only the Expire attribute will be handled automatically.
   *
   * Example 6 months: 86_400 * 30 * 6
   */
  expireAfterSeconds: number;

  /**
   * The default session value for starting a new session.
   */
  defaultSessionValue: Value;

  /**
   * The store that will make a session persistent.
   */
  store: Store<Value, Context>;
}

/**
 * Session value that should be saved by a {@link Store}.
 */
export interface SessionData<Value> {
  /** Session ID. */
  sid: string;
  /** Unix time when session has started. */
  startedAt: number;
  /** Unix time when session will end. */
  expires: number;
  /** Session value. */
  data: Value;
}

/**
 * Session state that indicates the reason why a session is changing.
 */
export enum SessionState {
  /** New Session is starting. */
  Starting = 0,
  /** Old session is ending and new session is starting. */
  Refresh = 1,
  /** Old session expired and new session is starting. */
  Expired = 2,
  /** Continue valid current session. */
  Continue = 3,
  /** Session is ending. */
  Ending = 4,
}

/**
 * Creating session middleware and object.
 */
export class Session<Value, Context extends OakContext> {
  /**
   * Session was deleted by calling {@link end}.
   */
  protected deleted = false;

  /**
   * Session value changed by calling {@link set}.
   * This will save the session automatically into the store.
   * A deletion by calling {@link end} will ignore this change.
   */
  protected dataChanged = false;

  protected constructor(
    protected readonly ctx: Context,
    protected readonly options: SessionOptions<Value, Context>,
    protected readonly data: SessionData<Value>,
    protected readonly store: Store<Value, Context>,
  ) {
  }

  /**
   * Refresh session ID.
   * This function MUST be called when logging in a user.
   */
  public async refresh(): Promise<void> {
    await this.store.endSession(this.ctx, this.data.sid, SessionState.Refresh);

    this.data.sid = crypto.randomUUID();
    this.data.startedAt = Date.now();
    this.data.expires = this.data.startedAt + (this.options.expireAfterSeconds * 1e3);

    await this.store.startSession(this.ctx, this.data.sid, this.data, SessionState.Refresh);

    await this.updateCookie();
  }

  /**
   * End current session.
   * This function MUST be called when logging out a user.
   */
  public async end(): Promise<void> {
    this.deleted = true;
    await this.ctx.cookies.delete(this.options.cookieName);
    await this.store.endSession(this.ctx, this.data.sid, SessionState.Ending);
  }

  /**
   * Get saved session value by key.
   *
   * @param key Data key.
   * @returns Stored value.
   */
  public get(key: keyof Value): Value[keyof Value] {
    return this.data.data[key];
  }

  /**
   * Save, overwrite or delete session value.
   * A value of null or undefined means deletion.
   *
   * @param key Data key.
   * @param value Data value.
   */
  public set(key: keyof Value, value: Value[keyof Value] | null | undefined): void {
    if (value === null || value === undefined) {
      delete this.data.data[key];
    } else {
      this.data.data[key] = value;
    }

    this.dataChanged = true;
  }

  /**
   * Check if saved session value exists.
   *
   * @param key Data key.
   * @returns Returns true if data key does not exist.
   */
  public has(key: keyof Value): boolean {
    return this.data.data[key] !== undefined;
  }

  /**
   * Updates session cookie.
   * Called when starting a new session or when calling {@link refresh}.
   */
  protected async updateCookie(): Promise<void> {
    await this.ctx.cookies.set(this.options.cookieName, this.data.sid, {
      ...this.options.cookiesSetOptions,
      expires: new Date(this.data.expires),
      maxAge: undefined,
      overwrite: true,
    });
  }

  /**
   * Create new session middleware for oak.
   *
   * @param options Required middleware options.
   * @returns New session middleware.
   */
  public static createMiddleware<
    Value,
    // deno-lint-ignore no-explicit-any
    State extends Record<string, any> & { session: Session<Value, OakContext> },
    Context extends OakContext<State>,
  >(options: SessionOptions<Value, Context>): Middleware<State, Context> {
    const {
      store,
      defaultSessionValue,
      expireAfterSeconds,
      cookiesGetOptions,
      cookieName,
    } = options;

    type SessionInit = {
      state: SessionState.Starting;
      sessionData: null;
    } | {
      state: SessionState.Continue | SessionState.Expired;
      sessionData: SessionData<Value>;
    };

    const createSession = async (
      init: SessionInit,
      ctx: Context,
      sid: string,
    ): Promise<Session<Value, Context>> => {
      switch (init.state) {
        case SessionState.Continue: {
          return new Session<Value, Context>(ctx, options, init.sessionData, store);
        }
        case SessionState.Starting: {
          break;
        }
        case SessionState.Expired: {
          await store.endSession(ctx, sid, SessionState.Expired);
          break;
        }
      }

      const startedAt = Date.now();

      const sessionData = {
        sid: crypto.randomUUID(),
        startedAt,
        expires: startedAt + (expireAfterSeconds * 1e3),
        data: structuredClone(defaultSessionValue),
      } satisfies SessionData<Value>;

      await store.startSession(ctx, sessionData.sid, sessionData, init.state);

      const session = new Session<Value, Context>(ctx, options, sessionData, store);
      await session.updateCookie();

      return session;
    };

    return async (ctx, next) => {
      const sid = await ctx.cookies.get(cookieName, cookiesGetOptions) ?? '';
      const sessionData = sid ? await store.getSessionData(ctx, sid) : null;

      const session = await createSession(
        ((): SessionInit => {
          if (sessionData?.sid === sid) {
            return {
              state: sessionData.expires < Date.now() ? SessionState.Expired : SessionState.Continue,
              sessionData,
            };
          } else {
            return {
              state: SessionState.Starting,
              sessionData: null,
            };
          }
        })(),
        ctx,
        sid,
      );

      ctx.state.session = session;

      await next();

      if (session.dataChanged && !session.deleted) {
        await store.updateSessionData(ctx, session.data.sid, session.data);
      }
    };
  }
}

/**
 * Interface for implementing a store.
 */
export default interface Store<Value, Context extends OakContext> {
  /**
   * Get session data from the store.
   *
   * @param ctx OakContext value.
   * @param sessionId Session ID.
   */
  getSessionData(ctx: Context, sessionId: string): Promise<SessionData<Value> | null>;

  /**
   * Create new session data in the store.
   *
   * @param ctx OakContext value.
   * @param sessionId Session ID.
   * @param initialData New Session data.
   * @param state Session state that indicates the reason why a session is changing
   */
  startSession(ctx: Context, sessionId: string, initialData: SessionData<Value>, state: SessionState): Promise<void>;

  /**
   * Delete session data in the store.
   *
   * @param ctx OakContext value.
   * @param sessionId Session ID.
   * @param state Session state that indicates the reason why a session is changing
   */
  endSession(ctx: Context, sessionId: string, state: SessionState): Promise<void>;

  /**
   * Update session data in the store.
   *
   * @param ctx OakContext value.
   * @param sessionId Session ID.
   * @param sessionData Updated session data.
   */
  updateSessionData(ctx: Context, sessionId: string, sessionData: SessionData<Value>): Promise<void>;
}

/**
 * Interface for implementing a secure crypto function.
 */
export interface SecureCryptoFn {
  /**
   * Encrypt plaintext.
   * @param text Text to encrypt.
   */
  encrypt(text: string): Promise<string>;

  /**
   * Decrypt encrypted text.
   * @param text Text to decrypt.
   */
  decrypt(text: string): Promise<string>;
}

/**
 * Secure crypto function using AES algorithm.
 */
export class CryptoFnAES implements SecureCryptoFn {
  protected static readonly encoder = new TextEncoder();
  protected static readonly decoder = new TextDecoder();

  protected constructor(protected readonly cryptoKey: CryptoKey) {}

  public static async init(encryptionKey: string): Promise<CryptoFnAES> {
    return new CryptoFnAES(
      await crypto.subtle.importKey(
        'raw',
        CryptoFnAES.encoder.encode(encryptionKey),
        { name: 'PBKDF2' },
        false,
        ['deriveKey'],
      ),
    );
  }

  public async encrypt(text: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: iv,
        iterations: 100_000,
        hash: 'SHA-256',
      },
      this.cryptoKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );

    const encryptedData = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      CryptoFnAES.encoder.encode(text),
    );

    const data = new Uint8Array(iv.length + encryptedData.byteLength);
    data.set(iv, 0);
    data.set(new Uint8Array(encryptedData), iv.length);

    return encodeBase64(data.buffer);
  }

  public async decrypt(encryptedText: string): Promise<string> {
    const encryptedDataWithIv = decodeBase64(encryptedText);
    const iv = encryptedDataWithIv.slice(0, 12);
    const encryptedData = encryptedDataWithIv.slice(12);

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: iv,
        iterations: 100_000,
        hash: 'SHA-256',
      },
      this.cryptoKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['decrypt'],
    );

    const data = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      encryptedData,
    );

    return CryptoFnAES.decoder.decode(data);
  }
}

/**
 * Required cookie store options.
 */
export interface CookieStoreOptions {
  /**
   * Secure crypto function.
   * It is recommended to use {@link CryptoFnAES}.
   */
  cryptoFn: SecureCryptoFn;

  /**
   * Cookie options to get the session data cookie.
   */
  cookiesGetOptions: CookiesGetOptions;

  /**
   * Cookie options to set and delete the session data cookie.
   * Note that Expires and Max-Age attributes should not be
   * set as it will be handled automatically by the store.
   */
  cookiesSetDeleteOptions: Omit<CookiesSetDeleteOptions, 'expires' | 'maxAge'>;

  /**
   * The name of the session data cookie.
   * Example: 'sid_data'
   */
  dataCookieName: string;
}

/**
 * Cookie store implementation.
 * The session data is stored in a second cookie
 */
export class CookieStore<Value, Context extends OakContext> implements Store<Value, Context> {
  protected readonly cryptoFn: SecureCryptoFn;
  protected readonly cookiesGetOptions: CookiesGetOptions;
  protected readonly cookiesSetDeleteOptions: Omit<CookiesSetDeleteOptions, 'expires' | 'maxAge'>;
  protected readonly dataCookieName: string;

  public constructor(options: CookieStoreOptions) {
    this.cryptoFn = options.cryptoFn;
    this.cookiesGetOptions = options.cookiesGetOptions;
    this.cookiesSetDeleteOptions = options.cookiesSetDeleteOptions;
    this.dataCookieName = options.dataCookieName;
  }

  public async getSessionData(ctx: Context, _sessionId: string): Promise<SessionData<Value> | null> {
    const sessionData = await ctx.cookies.get(this.dataCookieName, this.cookiesGetOptions);
    if (!sessionData) {
      return null;
    }

    try {
      return JSON.parse(await this.cryptoFn.decrypt(sessionData));
    } catch (e) {
      return null;
    }
  }

  public async startSession(
    ctx: Context,
    _sessionId: string,
    initialData: SessionData<Value>,
    _state: SessionState,
  ): Promise<void> {
    const encryptedData = await this.cryptoFn.encrypt(JSON.stringify(initialData));

    await ctx.cookies.set(this.dataCookieName, encryptedData, {
      ...this.cookiesSetDeleteOptions,
      expires: new Date(initialData.expires),
      maxAge: undefined,
      overwrite: true,
    });
  }

  public async endSession(ctx: Context, _sessionId: string, state: SessionState): Promise<void> {
    switch (state) {
      case SessionState.Expired:
      case SessionState.Refresh: {
        // startSession will overwrite the cookie in these states
        break;
      }
      default: {
        await ctx.cookies.delete(this.dataCookieName, {
          ...this.cookiesSetDeleteOptions,
          expires: undefined,
          maxAge: undefined,
          overwrite: true,
        });
        break;
      }
    }
  }

  public async updateSessionData(ctx: Context, _sessionId: string, sessionData: SessionData<Value>): Promise<void> {
    const encryptedData = await this.cryptoFn.encrypt(JSON.stringify(sessionData));

    await ctx.cookies.set(this.dataCookieName, encryptedData, {
      ...this.cookiesSetDeleteOptions,
      expires: new Date(sessionData.expires),
      maxAge: undefined,
      overwrite: true,
    });
  }
}

/**
 * Deno.Kv store implementation.
 *
 * NOTE: untested
 */
export class KvStore<Value, Context extends OakContext> implements Store<Value, Context> {
  public constructor(
    protected readonly kv: Deno.Kv,
    protected readonly partition: Deno.KvKeyPart,
    protected readonly ttlPerValue: number,
  ) {}

  public async getSessionData(_ctx: Context, sessionId: string): Promise<SessionData<Value> | null> {
    const { value } = await this.kv.get<SessionData<Value>>([this.partition, sessionId]);
    return value;
  }

  public async startSession(
    _ctx: Context,
    sessionId: string,
    initialData: SessionData<Value>,
    _state: SessionState,
  ): Promise<void> {
    await this.kv.set([this.partition, sessionId], initialData, { expireIn: this.ttlPerValue });
  }

  public async endSession(_ctx: Context, sessionId: string, _state: SessionState): Promise<void> {
    await this.kv.delete([this.partition, sessionId]);
  }

  public async updateSessionData(_ctx: Context, sessionId: string, sessionData: SessionData<Value>): Promise<void> {
    await this.kv.set([this.partition, sessionId], sessionData, { expireIn: this.ttlPerValue });
  }
}
