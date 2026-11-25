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

	/**
	 * Who the player is at a provider: the stable subject we match on, and the name they
	 * know themselves by (null when the subject is already that, as an email address is).
	 */
	record ProviderUser(Provider provider, String subject, String displayName) {

		static ProviderUser email(String address) {
			return new ProviderUser(Provider.EMAIL, address, null);
		}

	}

	/** Call inside a transaction: the user and its first identity are saved together. */
	UUID createWith(ProviderUser who, ProviderToken token) {
		UUID id = create(Role.USER);
		link(id, who, token);
		return id;
	}

	void link(UUID userId, ProviderUser who, ProviderToken token) {
		this.jdbc.sql("""
				INSERT INTO identities (provider, subject, display_name, user_id, access_token, access_token_expires_at)
				VALUES (:provider, :subject, :name, :user, :token, :expires)
				""")
			.param("provider", who.provider().id())
			.param("subject", who.subject())
			.param("name", who.displayName())
			.param("user", userId)
			.param("token", (token != null) ? token.value() : null)
			.param("expires", (token != null) ? utc(token.expiresAt()) : null)
			.update();
	}

	/**
	 * A returning player: keep their newest token and the name as the provider spells it
	 * now.
	 */
	void refresh(ProviderUser who, ProviderToken token) {
		this.jdbc.sql("""
				UPDATE identities
				SET display_name = :name, access_token = :token, access_token_expires_at = :expires
				WHERE provider = :provider AND subject = :subject
				""")
			.param("name", who.displayName())
			.param("token", token.value())
			.param("expires", utc(token.expiresAt()))
			.param("provider", who.provider().id())
			.param("subject", who.subject())
			.update();
	}

	/** Oldest first, so the cards keep their order as identities come and go. */
	List<Identity> identitiesOf(UUID userId) {
		return this.jdbc.sql("""
				SELECT provider, coalesce(display_name, subject) AS label, created_at
				FROM identities WHERE user_id = :user ORDER BY created_at, provider
				""")
			.param("user", userId)
			.query((rs, n) -> new Identity(rs.getString("provider"), rs.getString("label"),
					rs.getObject("created_at", OffsetDateTime.class).toInstant()))
			.list();
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
