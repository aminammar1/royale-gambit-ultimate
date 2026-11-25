package dev.royalgambit.authprofile.auth;

import java.time.Duration;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Stored refresh tokens (hashes only). */
@Repository
class RefreshTokens {

	private final JdbcClient jdbc;

	RefreshTokens(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	void save(byte[] hash, UUID familyId, UUID userId, Duration ttl) {
		this.jdbc.sql("""
				INSERT INTO refresh_tokens (token_hash, family_id, user_id, expires_at)
				VALUES (:hash, :family, :user, now() + :seconds * interval '1 second')
				""")
			.param("hash", hash)
			.param("family", familyId)
			.param("user", userId)
			.param("seconds", ttl.toSeconds())
			.update();
	}

}
