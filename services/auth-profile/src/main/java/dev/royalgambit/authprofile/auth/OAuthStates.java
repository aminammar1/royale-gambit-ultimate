package dev.royalgambit.authprofile.auth;

import java.sql.Types;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

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

	/**
	 * @param linkUserId the user a link flow belongs to; null for a sign-in flow
	 */
	void save(byte[] stateHash, Provider provider, String verifier, String redirectUri, UUID linkUserId, Duration ttl) {
		this.jdbc.sql("""
				INSERT INTO oauth_states (state_hash, provider, code_verifier, redirect_uri, link_user_id, expires_at)
				VALUES (:hash, :provider, :verifier, :redirect, :linkUser, now() + :seconds * interval '1 second')
				""")
			.param("hash", stateHash)
			.param("linkUser", linkUserId)
			.param("provider", provider.id())
			.param("verifier", verifier)
			.param("redirect", redirectUri)
			.param("seconds", ttl.toSeconds())
			.update();
	}

	/**
	 * Takes the flow if it is live and {@code caller} is who started it (null on both
	 * sides for a sign-in). One UPDATE, so a state is redeemed once; a wrong caller does
	 * not use it up for the right one.
	 */
	Optional<Flow> consume(byte[] stateHash, Provider provider, UUID caller) {
		return this.jdbc.sql("""
				UPDATE oauth_states SET consumed_at = now()
				WHERE state_hash = :hash AND provider = :provider AND consumed_at IS NULL AND expires_at > now()
				  AND link_user_id IS NOT DISTINCT FROM :caller
				RETURNING code_verifier, redirect_uri
				""")
			.param("hash", stateHash)
			.param("provider", provider.id())
			.param("caller", caller, Types.OTHER)
			.query((rs, n) -> new Flow(rs.getString("code_verifier"), rs.getString("redirect_uri")))
			.optional();
	}

}
