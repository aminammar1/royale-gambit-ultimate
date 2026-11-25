package dev.royalgambit.authprofile.auth;

import java.time.Duration;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** OAuth flows waiting for the player to come back from the provider. */
@Repository
class OAuthStates {

	/** What a finished flow needs to redeem its code. */
	record Flow(String verifier, String redirectUri) {
	}

	private final JdbcClient jdbc;

	OAuthStates(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	void save(byte[] stateHash, Provider provider, String verifier, String redirectUri, Duration ttl) {
		this.jdbc.sql("""
				INSERT INTO oauth_states (state_hash, provider, code_verifier, redirect_uri, expires_at)
				VALUES (:hash, :provider, :verifier, :redirect, now() + :seconds * interval '1 second')
				""")
			.param("hash", stateHash)
			.param("provider", provider.id())
			.param("verifier", verifier)
			.param("redirect", redirectUri)
			.param("seconds", ttl.toSeconds())
			.update();
	}

	/** Takes the flow if it is live; one UPDATE, so a state can be redeemed only once. */
	Optional<Flow> consume(byte[] stateHash, Provider provider) {
		return this.jdbc.sql("""
				UPDATE oauth_states SET consumed_at = now()
				WHERE state_hash = :hash AND provider = :provider AND consumed_at IS NULL AND expires_at > now()
				RETURNING code_verifier, redirect_uri
				""")
			.param("hash", stateHash)
			.param("provider", provider.id())
			.query((rs, n) -> new Flow(rs.getString("code_verifier"), rs.getString("redirect_uri")))
			.optional();
	}

}
