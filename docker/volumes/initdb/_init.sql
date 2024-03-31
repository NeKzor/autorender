USE p2render;

DROP TABLE IF EXISTS users;

CREATE TABLE users (
    user_id BIGINT NOT NULL AUTO_INCREMENT,
    username VARCHAR(255) NOT NULL,
    discord_id  VARCHAR(64) NOT NULL,
    discord_avatar VARCHAR(64) NULL,
    discord_avatar_url VARCHAR(128) AS (
        CONCAT(
            'https://cdn.discordapp.com/avatars/',
            discord_id,
            '/',
            discord_avatar,
            IF(discord_avatar REGEXP '^a_', '.gif', '.png')
        )
    ) STORED,
    discord_banner VARCHAR(64),
    discord_banner_url VARCHAR(128) AS (
        CONCAT(
            'https://cdn.discordapp.com/banners/',
            discord_id,
            '/',
            discord_banner,
            IF(discord_banner REGEXP '^a_', '.gif', '.png')
        )
    ) STORED,
    discord_accent_color INT,
    donation_link VARCHAR(1024),
    permissions INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY(username),
    UNIQUE KEY(discord_id),
    FULLTEXT (username)
);

DROP TABLE IF EXISTS access_tokens;

CREATE TABLE access_tokens (
    access_token_id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    token_name VARCHAR(32) NOT NULL,
    token_key VARCHAR(64) NOT NULL,
    permissions INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (access_token_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    UNIQUE KEY(user_id, token_name)
);

DROP TABLE IF EXISTS games;

CREATE TABLE games (
    game_id BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(64),
    game_mod VARCHAR(64),
    app_id INT,
    sourcemod INT NOT NULL DEFAULT 0,
    PRIMARY KEY (game_id),
    UNIQUE KEY(name)
);

DROP TABLE IF EXISTS maps;

CREATE TABLE maps (
    map_id BIGINT NOT NULL AUTO_INCREMENT,
    game_id BIGINT NOT NULL,
    name VARCHAR(64),
    alias VARCHAR(64),
    type INT NOT NULL,
    best_time_id INT,
    best_portals_id INT,
    chapter INT,
    auto_fullbright INT NOT NULL DEFAULT 0,
    crc INT,
    workshop_file_id VARCHAR(32),
    creator_steam_id VARCHAR(32),
    PRIMARY KEY (map_id),
    UNIQUE KEY(game_id, name),
    FOREIGN KEY (game_id) REFERENCES games(game_id)
);

DROP TABLE IF EXISTS videos;

CREATE TABLE videos (
    video_id BINARY(16) NOT NULL,
    game_id BIGINT,
    map_id BIGINT,
    share_id VARCHAR(11) NOT NULL,
    title VARCHAR(64),
    comment VARCHAR(512),
    requested_by_name VARCHAR(64),
    requested_by_id VARCHAR(64),
    requested_in_guild_id VARCHAR(64),
    requested_in_guild_name VARCHAR(128),
    requested_in_channel_id VARCHAR(64),
    requested_in_channel_name VARCHAR(128),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rerender_started_at TIMESTAMP,
    render_quality VARCHAR(16),
    render_options VARCHAR(1024),
    file_name VARCHAR(64),
    file_url VARCHAR(1024),
    full_map_name VARCHAR(64),
    demo_size INT,
    demo_map_crc INT,
    demo_game_dir VARCHAR(64),
    demo_playback_time INT,
    demo_required_fix INT NOT NULL DEFAULT 0,
    demo_tickrate FLOAT,
    demo_portal_score INT,
    demo_time_score INT,
    demo_player_name VARCHAR(64),
    demo_steam_id VARCHAR(64),
    demo_partner_player_name VARCHAR(64),
    demo_partner_steam_id VARCHAR(64),
    demo_is_host INT,
    demo_metadata TEXT,
    board_changelog_id INT,
    board_profile_number VARCHAR(32),
    board_rank INT,
    pending INT NOT NULL DEFAULT 0,
    rendered_by BIGINT,
    rendered_by_token BIGINT,
    rendered_at TIMESTAMP,
    render_time INT AS (TIMESTAMPDIFF(SECOND, IFNULL(rerender_started_at, created_at), rendered_at)),
    render_node VARCHAR(64),
    video_url VARCHAR(1024),
    video_external_id VARCHAR(256),
    video_size INT,
    video_length INT,
    video_preview_url VARCHAR(1024),
    thumbnail_url_small VARCHAR(1024),
    thumbnail_url_large VARCHAR(1024),
    processed INT DEFAULT 0,
    views INT NOT NULL DEFAULT 0,
    visibility INT NOT NULL DEFAULT 0,
    deleted_by BIGINT,
    deleted_at TIMESTAMP,
    PRIMARY KEY (video_id),
    UNIQUE KEY(share_id),
    FOREIGN KEY (game_id) REFERENCES games(game_id),
    FOREIGN KEY (map_id) REFERENCES maps(map_id),
    FOREIGN KEY (rendered_by) REFERENCES users(user_id),
    FOREIGN KEY (rendered_by_token) REFERENCES access_tokens(access_token_id),
    FOREIGN KEY (deleted_by) REFERENCES users(user_id),
    FULLTEXT (title)
);

DROP TABLE IF EXISTS likes;

CREATE TABLE likes (
    user_id BIGINT NOT NULL,
    video_id BINARY(16) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (video_id) REFERENCES videos(video_id)
);

DROP TABLE IF EXISTS bookmarks;

CREATE TABLE bookmarks (
    user_id BIGINT NOT NULL,
    video_id BINARY(16) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (video_id) REFERENCES videos(video_id)
);

DROP TABLE IF EXISTS audit_logs;

CREATE TABLE audit_logs (
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    title VARCHAR(512) NOT NULL,
    audit_type INT NOT NULL,
    source INT NOT NULL,
    source_user_id BIGINT,
    target_user_id BIGINT,
    extra VARCHAR(1024),
    FOREIGN KEY (source_user_id) REFERENCES users(user_id),
    FOREIGN KEY (target_user_id) REFERENCES users(user_id)
);
