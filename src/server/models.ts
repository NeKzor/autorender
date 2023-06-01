/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

enum UserPermissions {
    None = 0,

    ListVideos = 1 << 3,
    UploadVideos = 1 << 4,
    DeleteVideos = 1 << 5,

    ManageUsers = 1 << 8,
}

export interface User {
    user_id: number;
    username: string;
    discord_id: string;
    discord_avatar: string;
    donation_link: string;
    permissions: UserPermissions;
}

export enum AccessPermission {
    None = 0,
    CreateVideos = 1 << 1,
    WriteVideos = 1 << 2,
    DeleteVideos = 1 << 3,
    ReadVideos = 1 << 4,
}

export interface AccessToken {
    user_id: number;
    token_name: string;
    token_key: string;
    permissions: AccessPermission;
}

export enum PendingStatus {
    FinishedRender = 0,
    RequiresRender = 1,
    StartedRender = 2,
}

export interface Video {
    video_id: number;
    title: string;
    comment: string;
    requested_by_name: string;
    requested_by_id: string;
    requested_at: number;
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
    deleted_by: number;
    deleted_at: number;
}
