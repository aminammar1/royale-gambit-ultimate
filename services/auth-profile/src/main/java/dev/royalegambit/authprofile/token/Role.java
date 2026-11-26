package dev.royalegambit.authprofile.token;

/**
 * What kind of account a token speaks for. The lowercase name is what goes into the
 * {@code role} claim and the database.
 */
public enum Role {

	/** Anonymous player; data stays on the device, low quotas. */
	GUEST("play"),

	/** Signed in with an email (later also Lichess or Chess.com). */
	USER("play profile");

	private final String scope;

	Role(String scope) {
		this.scope = scope;
	}

	public String claim() {
		return name().toLowerCase(java.util.Locale.ROOT);
	}

	/** Space-separated, as OAuth scopes are. */
	public String scope() {
		return this.scope;
	}

	public static Role fromClaim(String value) {
		return valueOf(value.toUpperCase(java.util.Locale.ROOT));
	}

}
