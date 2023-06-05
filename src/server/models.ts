/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

/**
 * Available permissions for an authenticated user.
 */
export enum UserPermissions {
  None = 0,

  DiscoverVideos = 1 << 2,
  ListVideos = 1 << 3,
  CreateVideos = 1 << 4,
  DeleteVideos = 1 << 5,
  CreateTokens = 1 << 6,

  ManageUsers = 1 << 8,
  ManageAccessTokens = 1 << 9,
  ViewAuditLogs = 1 << 10,
}

/**
 * Table "users".
 */
export interface User {
  user_id: number;
  username: string;
  discord_id: string;
  discord_avatar: string;
  donation_link: string;
  permissions: UserPermissions;
  created_at: number;
}

/**
 * Available permissions for access tokens.
 */
export enum AccessPermission {
  None = 0,
  CreateVideos = 1 << 1,
  WriteVideos = 1 << 2,
  DeleteVideos = 1 << 3,
  ReadVideos = 1 << 4,
}

/**
 * Table "access_tokens".
 */
export interface AccessToken {
  access_token_id: number;
  user_id: number;
  token_name: string;
  token_key: string;
  permissions: AccessPermission;
  created_at: number;
}

/**
 * Pending status of a video.
 */
export enum PendingStatus {
  FinishedRender = 0,
  RequiresRender = 1,
  StartedRender = 2,
}

/**
 * Visibility state of a video.
 */
export enum VisibilityState {
  public = 0,
  unlisted = 1,
  private = 2,
}

/**
 * Table "videos".
 */
export interface Video {
  video_id: number;
  title: string;
  comment: string;
  requested_by_name: string;
  requested_by_id: string;
  created_at: number;
  render_options: string;
  file_name: string;
  file_path: string;
  map_url: string;
  pending: PendingStatus;
  rendered_by: number;
  rendered_at: number;
  video_url: string;
  thumb_url: string;
  views: number;
  visibility: VisibilityState;
  deleted_by: number;
  deleted_at: number;
}

/**
 * Table "likes".
 */
export interface Like {
  user_id: number;
  video_id: number;
  created_at: number;
}

/**
 * Table "bookmarks".
 */
export interface Bookmark {
  user_id: number;
  video_id: number;
  created_at: number;
}

/**
 * Source of audit log.
 */
export enum AuditSource {
  Server = 0,
  Client = 1,
  Bot = 2,
  User = 3,
}

/**
 * Type of audit log.
 */
export enum AuditType {
  Unknown = 0,
  Info = 1,
  Warning = 2,
  Error = 3,
}

/**
 * Table "audit_logs".
 */
export interface AuditLog {
  created_at: number;
  title: string;
  audit_type: AuditType;
  source: AuditSource;
  source_user_id: number;
  target_user_id: number;
  extra: string;
}

// Discord User Object
//      https://discord.com/developers/docs/resources/user#user-object
export interface DiscordUser {
  /** The user's id- */
  id: string;
  /** The user's username, not unique across the platform- */
  username: string;
  /** The user's 4-digit discord-tag- */
  discriminator: string;
  /** The user's avatar hash- */
  avatar: string | null;
  /** Whether the user belongs to an OAuth2 application- */
  bot?: boolean;
  /** Whether the user is an Official Discord System user (part of the urgent message system)- */
  system?: boolean;
  /** Whether the user has two factor enabled on their account- */
  mfa_enabled?: boolean;
  /** The user's banner hash- */
  banner?: string | null;
  /** The user's banner color encoded as an integer representation of hexadecimal color code- */
  accent_color?: number | null;
  /** The user's chosen language option- */
  locale?: string;
  /** Whether the email on this account has been verified- */
  verified?: boolean;
  /** The user's email- */
  email?: string | null;
  /** The flags on a user's account- */
  flags?: number;
  /** The type of Nitro subscription on a user's account- */
  premium_type?: number;
  /** The public flags on a user's account- */
  public_flags?: number;
}
