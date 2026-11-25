package dev.royalgambit.authprofile.auth;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import dev.royalgambit.authprofile.common.UuidV7;
import dev.royalgambit.authprofile.token.Role;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Users and the identities they sign in with (an email address, a Lichess account). */
@Repository
class Accounts {

	/** A provider's token kept for later calls on the player's behalf. */
	record ProviderToken(String value, Instant expiresAt) {
	}

	private final JdbcClient jdbc;

	Accounts(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	UUID create(Role role) {
		UUID id = UuidV7.next();
		this.jdbc.sql("INSERT INTO users (id, role) VALUES (:id, :role)")
			.param("id", id)
			.param("role", role.claim())
			.update();
		return id;
	}

	/** Call inside a transaction: the user and its first identity are saved together. */
	UUID createWith(Provider provider, String subject, ProviderToken token) {
		UUID id = create(Role.USER);
		link(id, provider, subject, token);
		return id;
	}

	void link(UUID userId, Provider provider, String subject, ProviderToken token) {
		this.jdbc.sql("""
				INSERT INTO identities (provider, subject, user_id, access_token, access_token_expires_at)
				VALUES (:provider, :subject, :user, :token, :expires)
				""")
			.param("provider", provider.id())
			.param("subject", subject)
			.param("user", userId)
			.param("token", (token != null) ? token.value() : null)
			.param("expires", (token != null) ? utc(token.expiresAt()) : null)
			.update();
	}

	void updateToken(Provider provider, String subject, ProviderToken token) {
		this.jdbc.sql("""
				UPDATE identities SET access_token = :token, access_token_expires_at = :expires
				WHERE provider = :provider AND subject = :subject
				""")
			.param("token", token.value())
			.param("expires", utc(token.expiresAt()))
			.param("provider", provider.id())
			.param("subject", subject)
			.update();
	}

	Optional<UUID> findBy(Provider provider, String subject) {
		return this.jdbc.sql("SELECT user_id FROM identities WHERE provider = :provider AND subject = :subject")
			.param("provider", provider.id())
			.param("subject", subject)
			.query(UUID.class)
			.optional();
	}

	/**
	 * The providers the user can sign in with, row-locked so two unlinks at once cannot
	 * both pass the "not the last one" check.
	 */
	List<String> lockProviders(UUID userId) {
		return this.jdbc.sql("SELECT provider FROM identities WHERE user_id = :user FOR UPDATE")
			.param("user", userId)
			.query(String.class)
			.list();
	}

	/** The account's identity at this provider, if it has one (at most one, by index). */
	Optional<String> subjectOf(UUID userId, Provider provider) {
		return this.jdbc.sql("SELECT subject FROM identities WHERE user_id = :user AND provider = :provider")
			.param("user", userId)
			.param("provider", provider.id())
			.query(String.class)
			.optional();
	}

	void unlink(UUID userId, Provider provider) {
		this.jdbc.sql("DELETE FROM identities WHERE user_id = :user AND provider = :provider")
			.param("user", userId)
			.param("provider", provider.id())
			.update();
	}

	Optional<Role> roleOf(UUID userId) {
		return this.jdbc.sql("SELECT role FROM users WHERE id = :id")
			.param("id", userId)
			.query((rs, n) -> Role.fromClaim(rs.getString("role")))
			.optional();
	}

	private static OffsetDateTime utc(Instant instant) {
		return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
	}

}
