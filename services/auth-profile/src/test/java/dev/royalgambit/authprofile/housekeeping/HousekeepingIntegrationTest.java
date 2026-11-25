package dev.royalgambit.authprofile.housekeeping;

import java.util.UUID;

import dev.royalgambit.authprofile.ServiceIntegrationTest;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.assertj.core.api.Assertions.assertThat;

@ServiceIntegrationTest
class HousekeepingIntegrationTest {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Housekeeping housekeeping;

	@Test
	void oldSignInLeftoversGoAndLiveOnesStay() {
		String oldEmail = "old-" + UUID.randomUUID() + "@example.com";
		String recentEmail = "recent-" + UUID.randomUUID() + "@example.com";
		// Codes stay a day: the daily cap counts them.
		code(oldEmail, "now() - interval '25 hours'");
		code(recentEmail, "now() - interval '23 hours'");
		byte[] deadState = state("now() - interval '2 hours'");
		byte[] liveState = state("now() + interval '5 minutes'");

		this.housekeeping.run();

		assertThat(count("SELECT count(*) FROM email_codes WHERE email = '" + oldEmail + "'")).isZero();
		assertThat(count("SELECT count(*) FROM email_codes WHERE email = '" + recentEmail + "'")).isOne();
		assertThat(stateExists(deadState)).isFalse();
		assertThat(stateExists(liveState)).isTrue();
	}

	@Test
	void abandonedGuestsAndDeadTokensGo() {
		UUID abandoned = guest("now() - interval '40 days'", "now() - interval '5 days'");
		UUID active = guest("now() - interval '40 days'", "now() + interval '10 days'");
		UUID young = guest("now() - interval '1 day'", "now() - interval '2 days'");

		this.housekeeping.run();

		assertThat(userExists(abandoned)).isFalse();
		assertThat(userExists(active)).isTrue();
		assertThat(userExists(young)).isTrue();
		// The young guest stays, but its long-dead token does not.
		assertThat(count("SELECT count(*) FROM refresh_tokens WHERE user_id = '" + young + "'")).isZero();
		assertThat(count("SELECT count(*) FROM refresh_tokens WHERE user_id = '" + active + "'")).isOne();
	}

	@Test
	void publishedEventsGoAfterAWeekPendingOnesNever() {
		UUID oldPublished = event("now() - interval '8 days'", "now() - interval '8 days'");
		UUID oldPending = event("now() - interval '8 days'", null);
		UUID recentPublished = event("now() - interval '1 day'", "now() - interval '1 day'");

		this.housekeeping.run();

		assertThat(eventExists(oldPublished)).isFalse();
		assertThat(eventExists(oldPending)).isTrue();
		assertThat(eventExists(recentPublished)).isTrue();
	}

	@Test
	void largeBacklogsAreClearedInBatches() {
		String email = "backlog-" + UUID.randomUUID() + "@example.com";
		this.jdbc.sql("""
				INSERT INTO email_codes (id, email, code_hash, attempts_left, created_at, expires_at)
				SELECT gen_random_uuid(), :email, '\\x00', 5, now() - interval '2 days', now() - interval '2 days'
				FROM generate_series(1, 2500)
				""").param("email", email).update();

		this.housekeeping.run();

		assertThat(count("SELECT count(*) FROM email_codes WHERE email = '" + email + "'")).isZero();
	}

	private void code(String email, String createdAt) {
		this.jdbc
			.sql("INSERT INTO email_codes (id, email, code_hash, attempts_left, created_at, expires_at) "
					+ "VALUES (:id, :email, '\\x00', 5, " + createdAt + ", " + createdAt + " + interval '10 minutes')")
			.param("id", UUID.randomUUID())
			.param("email", email)
			.update();
	}

	private byte[] state(String expiresAt) {
		byte[] hash = UUID.randomUUID().toString().getBytes();
		this.jdbc
			.sql("INSERT INTO oauth_states (state_hash, provider, code_verifier, redirect_uri, expires_at) "
					+ "VALUES (:hash, 'lichess', 'v', 'http://127.0.0.1:1/', " + expiresAt + ")")
			.param("hash", hash)
			.update();
		return hash;
	}

	private UUID guest(String createdAt, String tokenExpiresAt) {
		UUID id = UUID.randomUUID();
		this.jdbc.sql("INSERT INTO users (id, role, created_at) VALUES (:id, 'guest', " + createdAt + ")")
			.param("id", id)
			.update();
		this.jdbc
			.sql("INSERT INTO refresh_tokens (token_hash, family_id, user_id, expires_at) "
					+ "VALUES (:hash, :family, :user, " + tokenExpiresAt + ")")
			.param("hash", UUID.randomUUID().toString().getBytes())
			.param("family", UUID.randomUUID())
			.param("user", id)
			.update();
		return id;
	}

	private UUID event(String occurredAt, String publishedAt) {
		UUID id = UUID.randomUUID();
		this.jdbc
			.sql("INSERT INTO outbox (id, type, trace_id, data, occurred_at, published_at) "
					+ "VALUES (:id, 'user.registered', :trace, '{}', " + occurredAt + ", "
					+ ((publishedAt != null) ? publishedAt : "NULL") + ")")
			.param("id", id)
			.param("trace", "0".repeat(32))
			.update();
		return id;
	}

	private int count(String sql) {
		return this.jdbc.sql(sql).query(Integer.class).single();
	}

	private boolean stateExists(byte[] hash) {
		return this.jdbc.sql("SELECT count(*) FROM oauth_states WHERE state_hash = :hash")
			.param("hash", hash)
			.query(Integer.class)
			.single() == 1;
	}

	private boolean userExists(UUID id) {
		return count("SELECT count(*) FROM users WHERE id = '" + id + "'") == 1;
	}

	private boolean eventExists(UUID id) {
		return count("SELECT count(*) FROM outbox WHERE id = '" + id + "'") == 1;
	}

}
