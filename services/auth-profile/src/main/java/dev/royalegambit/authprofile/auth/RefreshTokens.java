package dev.royalegambit.authprofile.auth;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Stored refresh tokens (hashes only). */
@Repository
class RefreshTokens {

	/** The token's session and owner, once this caller has won the right to rotate it. */
	record Claimed(UUID familyId, UUID userId) {
	}

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

	/**
	 * Marks a live token as used and returns who it belongs to. A single UPDATE decides
	 * the race: when two requests bring the same token, the row lock lets exactly one of
	 * them see it unused.
	 */
	Optional<Claimed> claim(byte[] hash) {
		return this.jdbc.sql("""
				UPDATE refresh_tokens SET used_at = now()
				WHERE token_hash = :hash AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
				RETURNING family_id, user_id
				""")
			.param("hash", hash)
			.query((rs, n) -> new Claimed(rs.getObject("family_id", UUID.class), rs.getObject("user_id", UUID.class)))
			.optional();
	}

	/**
	 * The session of a token that was already rotated, while that session is still alive.
	 */
	Optional<UUID> liveFamilyOfUsed(byte[] hash) {
		return this.jdbc.sql(
				"SELECT family_id FROM refresh_tokens WHERE token_hash = :hash AND used_at IS NOT NULL AND revoked_at IS NULL")
			.param("hash", hash)
			.query(UUID.class)
			.optional();
	}

	Optional<UUID> familyOf(byte[] hash) {
		return this.jdbc.sql("SELECT family_id FROM refresh_tokens WHERE token_hash = :hash")
			.param("hash", hash)
			.query(UUID.class)
			.optional();
	}

	void revokeFamily(UUID familyId) {
		this.jdbc.sql("UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = :family AND revoked_at IS NULL")
			.param("family", familyId)
			.update();
	}

}
