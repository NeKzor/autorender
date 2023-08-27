CREATE DATABASE IF NOT EXISTS p2render;

CREATE FUNCTION UUID_TO_BIN(_uuid BINARY(36))
    RETURNS BINARY(16)
    LANGUAGE SQL DETERMINISTIC CONTAINS SQL SQL SECURITY INVOKER
RETURN
    UNHEX(
        CONCAT(
            SUBSTR(_uuid, 15, 4),
            SUBSTR(_uuid, 10, 4),
            SUBSTR(_uuid, 1, 8),
            SUBSTR(_uuid, 20, 4),
            SUBSTR(_uuid, 25)
        )
    );

CREATE FUNCTION BIN_TO_UUID(_bin BINARY(16))
    RETURNS BINARY(36)
    LANGUAGE SQL DETERMINISTIC CONTAINS SQL SQL SECURITY INVOKER
RETURN
    LCASE(
        CONCAT_WS(
            '-',
            HEX(SUBSTR(_bin, 5, 4)),
            HEX(SUBSTR(_bin, 3, 2)),
            HEX(SUBSTR(_bin, 1, 2)),
            HEX(SUBSTR(_bin, 9, 2)),
            HEX(SUBSTR(_bin, 11))
        )
    );
