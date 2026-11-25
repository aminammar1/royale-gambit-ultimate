package dev.royalgambit.authprofile.auth;

import java.util.Optional;
import java.util.UUID;

import dev.royalgambit.authprofile.common.UuidV7;
import dev.royalgambit.authprofile.token.Role;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Users and the identities they sign in with. */
@Repository
class Accounts {

	private static final String EMAIL = "email";

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

	/** Call inside a transaction: the user and its identity are saved together. */
	UUID createWithEmail(String email) {
		UUID id = create(Role.USER);
		this.jdbc.sql("INSERT INTO identities (provider, subject, user_id) VALUES (:provider, :email, :id)")
			.param("provider", EMAIL)
			.param("email", email)
			.param("id", id)
			.update();
		return id;
	}

	Optional<UUID> findByEmail(String email) {
		return this.jdbc.sql("SELECT user_id FROM identities WHERE provider = :provider AND subject = :email")
			.param("provider", EMAIL)
			.param("email", email)
			.query(UUID.class)
			.optional();
	}

	Optional<Role> roleOf(UUID userId) {
		return this.jdbc.sql("SELECT role FROM users WHERE id = :id")
			.param("id", userId)
			.query((rs, n) -> Role.fromClaim(rs.getString("role")))
			.optional();
	}

}
