/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 *
 * This provides a small and simple client that interacts
 * with the Backblaze API.
 *
 * Features:
 *   - Readable
 *   - No callback-hell
 *   - Use of async & await
 *   - Bring-Your-Own-User-Agent
 *   - Bring-Your-Own-SHA-1-Hash-Function
 *   - Free of dependencies
 *   - Not limited to NodeJs
 *   - Call any API operation once at a time
 *   - Pure TypeScript
 *
 * Backblaze API documentation:
 *    https://www.backblaze.com/b2/docs/calling.html
 */

/** Allowed capabilities of an authorized account.  */
export type AllowedCapability =
  | "shareFiles"
  | "writeBucketReplications"
  | "deleteFiles"
  | "readBuckets"
  | "writeFiles"
  | "readBucketReplications"
  | "listBuckets"
  | "readFiles"
  | "listFiles"
  | "writeBucketEncryption"
  | "readBucketEncryption";

/**
 * Response object of a file upload.
 *
 * @see BackblazeClient.uploadFile
 */
export interface AuthorizeAccountResponse {
  absoluteMinimumPartSize: number;
  accountId: string;
  allowed: {
    bucketId: string;
    bucketName: string;
    capabilities: AllowedCapability[];
    namePrefix: string | null;
  };
  apiUrl: string;
  authorizationToken: string;
  downloadUrl: string;
  recommendedPartSize: number;
  s3ApiUrl: string;
}

/**
 * Response object of a file upload.
 *
 * @see BackblazeClient.uploadFile
 */
export interface UploadFileResponse {
  accountId: string;
  action: string;
  bucketId: string;
  contentLength: number;
  contentMd5: string;
  contentSha1: string;
  contentType: string;
  fileId: string;
  fileInfo: {
    hash_sha1: string;
    src_last_modified_millis: string;
  };
  fileName: string;
  fileRetention: { isClientAuthorizedToRead: false; value: null };
  legalHold: { isClientAuthorizedToRead: false; value: null };
  serverSideEncryption: { algorithm: null; mode: null };
  uploadTimestamp: number;
}

/**
 * Upload URL response object.
 *
 * @see BackblazeClient.getUploadUrl
 */
export interface GetUploadUrlResponse {
  authorizationToken: string;
  bucketId: string;
  uploadUrl: string;
}

/** Valid Backblaze API operations. */
export type BackblazeApiOperation =
  | "b2_authorize_account"
  | "b2_cancel_large_file"
  | "b2_copy_file"
  | "b2_copy_part"
  | "b2_create_bucket"
  | "b2_create_key"
  | "b2_delete_bucket"
  | "b2_delete_file_version"
  | "b2_delete_key"
  | "b2_download_file_by_id"
  | "b2_download_file_by_name"
  | "b2_finish_large_file"
  | "b2_get_download_authorization"
  | "b2_get_file_info"
  | "b2_get_upload_part_url"
  | "b2_get_upload_url"
  | "b2_hide_file"
  | "b2_list_buckets"
  | "b2_list_file_names"
  | "b2_list_file_versions"
  | "b2_list_keys"
  | "b2_list_parts"
  | "b2_list_unfinished_large_files"
  | "b2_start_large_file"
  | "b2_update_bucket"
  | "b2_update_file_legal_hold"
  | "b2_update_file_retention"
  | "b2_upload_file"
  | "b2_upload_part";

export interface BackblazeApiError {
  status: number;
  code: string;
  message: string;
}

/**
 * Required credentials for authorization.
 *
 * @see BackblazeClient.authorizeAccount
 */
export interface BackblazeAccount {
  /** Account ID aka Application Key ID */
  accountId: string;
  /** Application Key */
  applicationKey: string;
}

/**
 * Options for getting an upload URL.
 */
export interface UploadUrlOptions {
  /** ID of bucket. */
  bucketId: string;
}

/**
 * Options for uploading a file.
 */
export interface UploadFileOptions {
  /** ID of bucket. */
  bucketId: string;
  /** Name of file. */
  fileName: string;
  /** Contents of file. */
  fileContents: BufferSource;
  /** SHA-1 hash of file. Defaults to the client's `hasher` function which can be overwritten in construction. */
  fileHash?: string;
  /** Content-Type header value. Defaults to 'b2/x-auto'. */
  contentType?: string;
  /** Response object when calling `getUploadUrl()`. */
  uploadUrl?: GetUploadUrlResponse;
}

/** SHA-1 hash function. */
export type Sha1HashFunction = (
  buffer: BufferSource
) => string | Promise<string>;

/**
 * Options for constructing new Backblaze client.
 *
 * @see BackblazeClient
 */
export interface BackblazeClientOptions {
  /** Required User-Agent e.g. 'My-App-v1' */
  userAgent: string;
  /** Base API. Defaults to 'https://api.backblazeb2.com'. */
  baseApi?: string;
  /** API version. Defaults to 'v2'. */
  apiVersion?: `v${number}`;
  /** Custom SHA-1 hash function. Used to generate the required SHA-1 checksum for every file upload. */
  hasher?: Sha1HashFunction;
}

type ApiOperationOptions = {
  baseApi?: string;
  url?: string;
  headers: HeadersInit;
  body?: BodyInit | null;
};

/**
 * API client for Backblaze.
 *
 * @see https://www.backblaze.com/b2/docs/calling.html
 */
export class BackblazeClient {
  readonly #userAgent: string;
  readonly #baseApi: string;
  readonly #apiVersion: string;
  readonly #hasher: Sha1HashFunction;

  /** Authorization object. Will be set by calling `authorizeAccount()`. */
  authorization: AuthorizeAccountResponse | null;

  /**
   * Constructs a new Backblaze client.
   *
   * @param options - Client options. Setting `userAgent` is required.
   */
  constructor(options: BackblazeClientOptions) {
    this.#userAgent = options.userAgent;
    this.#baseApi = options.baseApi ?? "https://api.backblazeb2.com";
    this.#apiVersion = options.apiVersion ?? "v2";
    this.#hasher =
      options.hasher ??
      (async (buffer: BufferSource) => {
        const hash = await crypto.subtle.digest("SHA-1", buffer);
        return Array.from(new Uint8Array(hash))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      });
    this.authorization = null;
  }

  protected checkAuthorization() {
    if (!this.authorization) {
      throw new Error(
        "Client is not authorized. Did you forget to call authorizeAccount()?"
      );
    }
  }

  protected async generateHash(buffer: BufferSource) {
    if ("then" in this.#hasher) {
      return await this.#hasher(buffer);
    } else {
      return this.#hasher(buffer);
    }
  }

  protected json<T>(obj: T) {
    return JSON.stringify(obj);
  }

  protected async call<TResponse>(
    operation: BackblazeApiOperation,
    options: ApiOperationOptions
  ): Promise<TResponse> {
    const headers = new Headers({
      ...options.headers,
      "User-Agent": this.#userAgent,
    });

    if (!headers.get("Content-Type")) {
      headers.append("Content-Type", "application/json");
    }

    const uri =
      options.url ??
      `${options.baseApi ?? this.#baseApi}/b2api/${
        this.#apiVersion
      }/${operation}`;

    const res = await fetch(uri, {
      method: options.body ? "POST" : "GET",
      headers,
      body: options.body,
    });

    if (!res.ok) {
      const cause = res.headers
        .get("Content-Type")
        ?.includes("application/json")
        ? await res.json()
        : await res.text();

      throw new Error(`Call to ${uri} failed: ${res.status}`, { cause });
    }

    return await res.json();
  }

  /**
   * Get authorization for a given account.
   *
   * @param account - Account credentials
   * @returns - Authorization object. This object will be set for this client for further API calls.
   * @see https://www.backblaze.com/b2/docs/b2_authorize_account.html
   */
  public async authorizeAccount(account: BackblazeAccount) {
    this.authorization = await this.call<AuthorizeAccountResponse>(
      "b2_authorize_account",
      {
        headers: {
          Authorization: `Basic ${btoa(
            `${account.accountId}:${account.applicationKey}`
          )}`,
        },
      }
    );
    return this.authorization!;
  }

  /**
   * Gets a new URL for uploading a file.
   *
   * NOTE: Requires authorization.
   *
   * @param options
   * @returns Response object of upload URL.
   */
  public async getUploadUrl(options: UploadUrlOptions) {
    this.checkAuthorization();

    type GetUploadUrlRequestBody = {
      bucketId: string;
    };

    return await this.call<GetUploadUrlResponse>("b2_get_upload_url", {
      baseApi: this.authorization!.apiUrl,
      headers: {
        Authorization: this.authorization!.authorizationToken,
      },
      body: this.json<GetUploadUrlRequestBody>({
        bucketId: options.bucketId,
      }),
    });
  }

  /**
   * Uploads a file to a bucket.
   * This will automatically handle the upload URL request
   * if the `uploadUrl` option is not provided.
   *
   * NOTE: Requires authorization.
   *
   * @param options - File upload options.
   * @returns Response object of uploaded file.
   * @see https://www.backblaze.com/b2/docs/b2_upload_file.html
   */
  public async uploadFile(options: UploadFileOptions) {
    const { authorizationToken, uploadUrl } = options.uploadUrl
      ? options.uploadUrl
      : await this.getUploadUrl({
          bucketId: options.bucketId,
        });

    const hash =
      options.fileHash ?? (await this.generateHash(options.fileContents));

    if (hash.length !== 40) {
      throw new Error(
        `Invalid file hash length. The generate SHA-1 hash should be 40 bytes long.`
      );
    }

    return await this.call<UploadFileResponse>("b2_upload_file", {
      url: uploadUrl,
      headers: {
        Authorization: authorizationToken,
        "X-Bz-File-Name": options.fileName
          .split("/")
          .map((part) => encodeURIComponent(part))
          .join("/"),
        "Content-Type": options.contentType ?? "b2/x-auto",
        "Content-Length": (
          options.fileContents.byteLength + hash.length
        ).toString(),
        "X-Bz-Content-Sha1": hash,
      },
      body: options.fileContents,
    });
  }

  /**
   * Util which constructs the download URL for an uploaded file.
   * This method does not make any API call.
   *
   * NOTE: Requires authorization.
   *
   * @param fileName - Name of file.
   * @returns Constructed download URL.
   */
  public getDownloadUrl(fileName: string): string {
    this.checkAuthorization();

    const url = new URL(
      `/file/${this.authorization!.allowed.bucketName}/${fileName}`,
      this.authorization!.downloadUrl
    );

    return url.toString();
  }

  public cancelLargeFile() {
    throw new Error("Operation not implemented");
  }
  public copyFile() {
    throw new Error("Operation not implemented");
  }
  public copyPart() {
    throw new Error("Operation not implemented");
  }
  public createBucket() {
    throw new Error("Operation not implemented");
  }
  public createKey() {
    throw new Error("Operation not implemented");
  }
  public deleteBucket() {
    throw new Error("Operation not implemented");
  }
  public deleteFileVersion() {
    throw new Error("Operation not implemented");
  }
  public deleteKey() {
    throw new Error("Operation not implemented");
  }
  public downloadFileById() {
    throw new Error("Operation not implemented");
  }
  public downloadFileByName() {
    throw new Error("Operation not implemented");
  }
  public finishLargeFile() {
    throw new Error("Operation not implemented");
  }
  public getDownloadAuthorization() {
    throw new Error("Operation not implemented");
  }
  public getFileInfo() {
    throw new Error("Operation not implemented");
  }
  public getUploadPartUrl() {
    throw new Error("Operation not implemented");
  }
  public hideFile() {
    throw new Error("Operation not implemented");
  }
  public listBuckets() {
    throw new Error("Operation not implemented");
  }
  public listFileNames() {
    throw new Error("Operation not implemented");
  }
  public listFileVersions() {
    throw new Error("Operation not implemented");
  }
  public listKeys() {
    throw new Error("Operation not implemented");
  }
  public listParts() {
    throw new Error("Operation not implemented");
  }
  public listUnfinishedLargeFiles() {
    throw new Error("Operation not implemented");
  }
  public startLargeFile() {
    throw new Error("Operation not implemented");
  }
  public updateBucket() {
    throw new Error("Operation not implemented");
  }
  public updateFileLegalHold() {
    throw new Error("Operation not implemented");
  }
  public updateFileRetention() {
    throw new Error("Operation not implemented");
  }
  public uploadPart() {
    throw new Error("Operation not implemented");
  }
}
