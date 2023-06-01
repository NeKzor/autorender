USE p2render;

DROP TABLE IF EXISTS users;

CREATE TABLE users (
    user_id BIGINT NOT NULL AUTO_INCREMENT,
    username VARCHAR(255) NOT NULL,
    discord_id  VARCHAR(64) NOT NULL,
    discord_avatar VARCHAR(1024) NOT NULL,
    donation_link VARCHAR(1024),
    permissions INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id),
    UNIQUE KEY(username),
    UNIQUE KEY(discord_id),
    FULLTEXT (username)
);

DROP TABLE IF EXISTS access_tokens;

CREATE TABLE access_tokens (
    user_id BIGINT NOT NULL,
    token_name VARCHAR(64) NOT NULL,
    token_key VARCHAR(64) NOT NULL,
    permissions VARCHAR(64) NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    UNIQUE KEY(user_id, token_name)
);

DROP TABLE IF EXISTS videos;

CREATE TABLE videos (
    video_id BIGINT NOT NULL AUTO_INCREMENT,
    title VARCHAR(32),
    comment VARCHAR(128),
    requested_by_name VARCHAR(64) NOT NULL,
    requested_by_id VARCHAR(64) NOT NULL,
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    render_options VARCHAR(1024),
    file_name VARCHAR(64),
    file_path VARCHAR(4096),
    map_url VARCHAR(1024),
    pending SMALLINT(1) NOT NULL DEFAULT 0,
    rendered_by BIGINT,
    rendered_at TIMESTAMP,
    render_node VARCHAR(64) NOT NULL,
    video_url VARCHAR(1024),
    thumb_url VARCHAR(1024),
    views INT NOT NULL DEFAULT 0,
    deleted_by BIGINT,
    deleted_at TIMESTAMP,
    PRIMARY KEY (video_id),
    FOREIGN KEY (rendered_by) REFERENCES users(user_id),
    FOREIGN KEY (deleted_by) REFERENCES users(user_id),
    FULLTEXT (title)
);
