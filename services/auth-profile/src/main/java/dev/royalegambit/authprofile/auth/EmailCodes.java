package dev.royalegambit.authprofile.auth;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Stored sign-in codes. All expiry maths uses the database clock. */
@Repository
class EmailCodes {

	/**
	 * The one code that may still be used for an address, locked for this transaction.
	 */
	record ActiveCode(UUID id, byte[] hash, int attemptsLeft) {
	}

	private final JdbcClient jdbc;

	EmailCodes(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	boolean sentWithin(String email, Duration cooldown) {
		return this.jdbc.sql("""
				SELECT EXISTS (SELECT 1 FROM email_codes
				               WHERE email = :email AND consumed_at IS NULL
				                 AND created_at > now() - :seconds * interval '1 second')
				""").param("email", email).param("seconds", cooldown.toSeconds()).query(Boolean.class).single();
	}

	/** How many codes went to the address in the last hour and the last day. */
	record SentCounts(int lastHour, int lastDay) {
	}

	SentCounts sentCounts(String email) {
		return this.jdbc.sql("""
				SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS last_hour,
				       count(*) AS last_day
				FROM email_codes
				WHERE email = :email AND created_at > now() - interval '1 day'
				""")
			.param("email", email)
			.query((rs, n) -> new SentCounts(rs.getInt("last_hour"), rs.getInt("last_day")))
			.single();
	}

	/** Saves a new code and retires every older one for the address, in one statement. */
	void replace(UUID id, String email, byte[] hash, int attempts, Duration ttl) {
		this.jdbc.sql("""
				WITH retired AS (
				    UPDATE email_codes SET consumed_at = now() WHERE email = :email AND consumed_at IS NULL
				)
				INSERT INTO email_codes (id, email, code_hash, attempts_left, expires_at)
				VALUES (:id, :email, :hash, :attempts, now() + :seconds * interval '1 second')
				""")
			.param("id", id)
			.param("email", email)
			.param("hash", hash)
			.param("attempts", attempts)
			.param("seconds", ttl.toSeconds())
			.update();
	}

	/**
	 * Row-locks the usable code so two guesses at the same moment are counted one after
	 * the other, never both against the same attempt.
	 */
	Optional<ActiveCode> lockUsable(String email) {
		return this.jdbc.sql("""
				SELECT id, code_hash, attempts_left FROM email_codes
				WHERE email = :email AND consumed_at IS NULL AND attempts_left > 0 AND expires_at > now()
				ORDER BY created_at DESC
				LIMIT 1
				FOR UPDATE
				""")
			.param("email", email)
			.query((rs, n) -> new ActiveCode(rs.getObject("id", UUID.class), rs.getBytes("code_hash"),
					rs.getInt("attempts_left")))
			.optional();
	}

	void consume(UUID id) {
		this.jdbc.sql("UPDATE email_codes SET consumed_at = now() WHERE id = :id").param("id", id).update();
	}

	/**
	 * @return the attempts left after this wrong guess
	 */
	int spendAttempt(UUID id) {
		return this.jdbc
			.sql("UPDATE email_codes SET attempts_left = attempts_left - 1 WHERE id = :id RETURNING attempts_left")
			.param("id", id)
			.query(Integer.class)
			.single();
	}

}
