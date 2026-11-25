package dev.royalgambit.authprofile.auth;

import java.util.Optional;
import java.util.UUID;

import dev.royalgambit.authprofile.common.Secrets;
import dev.royalgambit.authprofile.common.UuidV7;
import dev.royalgambit.authprofile.token.AccessToken;
import dev.royalgambit.authprofile.token.JwtSettings;
import dev.royalgambit.authprofile.token.Role;
import dev.royalgambit.authprofile.token.TokenIssuer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Sessions: a refresh-token family plus the short-lived access tokens issued from it. The
 * raw refresh token leaves this class once, in the response; we keep only its hash.
 */
@Service
public class Sessions {

	private static final Logger log = LoggerFactory.getLogger(Sessions.class);

	private final Accounts accounts;

	private final RefreshTokens tokens;

	private final TokenIssuer issuer;

	private final JwtSettings settings;

	private final TransactionTemplate transaction;

	Sessions(Accounts accounts, RefreshTokens tokens, TokenIssuer issuer, JwtSettings settings,
			TransactionTemplate transaction) {
		this.accounts = accounts;
		this.tokens = tokens;
		this.issuer = issuer;
		this.settings = settings;
		this.transaction = transaction;
	}

	/** A brand-new guest account and its first session. */
	@Transactional
	public TokenPair openForNewGuest() {
		return open(this.accounts.create(Role.GUEST), Role.GUEST);
	}

	public TokenPair open(UUID userId, Role role) {
		return issue(userId, role, UuidV7.next());
	}

	/**
	 * Trades a refresh token for a new pair. Each token works once: presenting one that
	 * was already rotated means two parties hold it, and since we cannot tell which one
	 * is the player, the whole session ends.
	 */
	public TokenPair refresh(String refreshToken) {
		byte[] hash = Secrets.sha256(refreshToken);
		Optional<TokenPair> rotated = this.transaction.execute((status) -> this.tokens.claim(hash)
			.map((claimed) -> issue(claimed.userId(), roleOf(claimed.userId()), claimed.familyId())));
		if (rotated != null && rotated.isPresent()) {
			return rotated.get();
		}
		Optional<UUID> stolenFamily = this.tokens.liveFamilyOfUsed(hash);
		if (stolenFamily.isPresent()) {
			this.tokens.revokeFamily(stolenFamily.get());
			log.warn("refresh token reused; session {} revoked", stolenFamily.get());
			throw AuthProblem.refreshReused();
		}
		throw AuthProblem.refreshInvalid();
	}

	/**
	 * Ends the session the token belongs to. Unknown or already-ended sessions are fine.
	 */
	public void close(String refreshToken) {
		this.tokens.familyOf(Secrets.sha256(refreshToken)).ifPresent(this.tokens::revokeFamily);
	}

	private Role roleOf(UUID userId) {
		// Read fresh on every refresh, so a guest who signs up gets the new role at once.
		return this.accounts.roleOf(userId).orElseThrow(AuthProblem::refreshInvalid);
	}

	private TokenPair issue(UUID userId, Role role, UUID familyId) {
		String refresh = Secrets.opaqueToken();
		this.tokens.save(Secrets.sha256(refresh), familyId, userId, this.settings.refreshTtl());
		AccessToken access = this.issuer.issue(userId, role);
		return new TokenPair(access.value(), "Bearer", access.expiresIn(), refresh,
				this.settings.refreshTtl().toSeconds(), userId, role.claim());
	}

}
