package dev.royalgambit.authprofile.housekeeping;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Deletes what nobody can use any more. /v1/auth/guest and /v1/auth/lichess/start insert
 * rows for anonymous callers, so without this the tables only ever grow.
 * <p>
 * Each rule keeps a row as long as some check still reads it: codes for a day (the daily
 * cap counts them), refresh tokens until a day after they expire (reuse detection),
 * guests while any of their sessions is alive, published events for a week (for
 * debugging).
 */
@Component
public class Housekeeping {

	private static final Logger log = LoggerFactory.getLogger(Housekeeping.class);

	private record Rule(String what, String sql) {
	}

	private static final Rule[] RULES = {
			new Rule("sign-in codes", "DELETE FROM email_codes WHERE created_at < now() - interval '1 day'"),
			new Rule("OAuth flows", "DELETE FROM oauth_states WHERE expires_at < now() - interval '1 hour'"),
			new Rule("abandoned guests", """
					DELETE FROM users u
					WHERE u.role = 'guest' AND u.created_at < now() - interval '30 days'
					  AND NOT EXISTS (SELECT 1 FROM refresh_tokens t WHERE t.user_id = u.id AND t.expires_at > now())
					"""),
			new Rule("refresh tokens", "DELETE FROM refresh_tokens WHERE expires_at < now() - interval '1 day'"),
			new Rule("published events", "DELETE FROM outbox WHERE published_at < now() - interval '7 days'") };

	private final JdbcClient jdbc;

	Housekeeping(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Scheduled(initialDelayString = "${auth.housekeeping.interval}", fixedDelayString = "${auth.housekeeping.interval}")
	public void run() {
		for (Rule rule : RULES) {
			int deleted = this.jdbc.sql(rule.sql()).update();
			if (deleted > 0) {
				log.info("housekeeping removed {} {}", deleted, rule.what());
			}
		}
	}

}
