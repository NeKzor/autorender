/*
 * Copyright (c) 2023-2025, NeKz
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

  RerenderVideos = 1 << 12,

  All = UserPermissions.DiscoverVideos |
    UserPermissions.ListVideos |
    UserPermissions.CreateVideos |
    UserPermissions.DeleteVideos |
    UserPermissions.CreateTokens |
    UserPermissions.ManageUsers |
    UserPermissions.ManageAccessTokens |
    UserPermissions.RerenderVideos |
    UserPermissions.ViewAuditLogs,
}

/**
 * Table "users".
 */
export interface User {
  user_id: number;
  username: string;
  discord_id: string;
  discord_avatar: string;
  discord_avatar_url: string;
  discord_banner: string;
  discord_banner_url: string;
  discord_accent_color: number;
  donation_link: string;
  permissions: UserPermissions;
  created_at: Date;
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
  created_at: Date;
}

/**
 * Table "games".
 */
export interface Game {
  game_id: number;
  name: string;
  game_mod: string;
  app_id: number;
  sourcemod: number;
}

/**
 * The type of a map.
 */
export enum MapType {
  SinglePlayer = 1,
  Cooperative = 2,
  WorkshopSinglePlayer = 3,
  WorkshopCooperative = 4,
}

/**
 * Table "maps".
 */
export interface MapModel {
  map_id: number;
  game_id: number;
  name: string;
  alias: string;
  type: MapType;
  best_time_id: number;
  best_portals_id: number;
  chapter: number;
  auto_fullbright: number;
  crc: number;
  workshop_file_id: string;
  creator_steam_id: string;
}

/**
 * Pending status of a video.
 */
export enum PendingStatus {
  FinishedRender = 0,
  RequiresRender = 1,
  ClaimedRender = 2,
  StartedRender = 3,
  UploadingRender = 4,
}

/**
 * Fixed demo status of a video.
 */
export enum FixedDemoStatus {
  NotRequired = 0,
  Required = 1,
}

/**
 * Visibility state of a video.
 */
export enum VisibilityState {
  Public = 0,
  Unlisted = 1,
  Private = 2,
}

/**
 * Available render qualities of a video.
 */
export enum RenderQuality {
  SD_480p = '480p',
  HD_720p = '720p',
  FHD_1080p = '1080p',
  QHD_1440p = '1440p',
  UHD_2160p = '2160p',
}

/**
 * Source of leaderboard.
 */
export enum BoardSource {
  None = 0,
  Portal2 = 1,
  Mel = 2,
}

/**
 * The reason for the deletion.
 */
export enum DeleteReason {
  Unknown = 0,
  Banned = 1,
  Mistake = 2,
  Duplicate = 3,
  Other = 4,
}

/**
 * Table "videos".
 */
export interface Video {
  video_id: string;
  game_id: number;
  map_id: number;
  share_id: string;
  title: string;
  comment: string;
  requested_by_name: string;
  requested_by_id: string;
  requested_in_guild_id: string;
  requested_in_guild_name: string;
  requested_in_channel_id: string;
  requested_in_channel_name: string;
  created_at: Date;
  rerender_started_at: Date;
  render_quality: RenderQuality;
  render_options: string;
  file_name: string;
  file_url: string;
  full_map_name: string;
  demo_size: number;
  demo_map_crc: number;
  demo_game_dir: string;
  demo_playback_time: number;
  demo_required_fix: FixedDemoStatus;
  demo_tickrate: number;
  demo_portal_score: number;
  demo_time_score: number;
  demo_player_name: string;
  demo_steam_id: string;
  demo_partner_player_name: string;
  demo_partner_steam_id: string;
  demo_is_host: number;
  demo_metadata: string;
  demo_requires_repair: number;
  board_source: BoardSource;
  board_source_domain: string;
  board_changelog_id: number;
  board_profile_number: string;
  board_rank: number;
  pending: PendingStatus;
  rendered_by: number;
  rendered_by_token: number;
  rendered_at: Date;
  render_time: number;
  render_node: string;
  video_url: string;
  video_external_id: string;
  video_size: number;
  video_length: number;
  video_preview_url: string;
  thumbnail_url_small: string;
  thumbnail_url_large: string;
  processed: number;
  views: number;
  visibility: VisibilityState;
  deleted_by: number;
  deleted_at: Date;
  deleted_reason: string;
  deleted_reason_type: DeleteReason;
  deleted_video_url: string;
}

/**
 * Table "likes".
 */
export interface Like {
  user_id: number;
  video_id: string;
  created_at: Date;
}

/**
 * Table "bookmarks".
 */
export interface Bookmark {
  user_id: number;
  video_id: string;
  created_at: Date;
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
  created_at: Date;
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
