package dev.royalgambit.authprofile.auth;

import java.util.UUID;

import dev.royalgambit.authprofile.common.Secrets;
import dev.royalgambit.authprofile.common.UuidV7;
import dev.royalgambit.authprofile.token.AccessToken;
import dev.royalgambit.authprofile.token.JwtSettings;
import dev.royalgambit.authprofile.token.Role;
import dev.royalgambit.authprofile.token.TokenIssuer;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sessions: a refresh-token family plus the short-lived access tokens issued from it. The
 * raw refresh token leaves this class once, in the response; we keep only its hash.
 */
@Service
public class Sessions {

	private final Accounts accounts;

	private final RefreshTokens tokens;

	private final TokenIssuer issuer;

	private final JwtSettings settings;

	Sessions(Accounts accounts, RefreshTokens tokens, TokenIssuer issuer, JwtSettings settings) {
		this.accounts = accounts;
		this.tokens = tokens;
		this.issuer = issuer;
		this.settings = settings;
	}

	/** A brand-new guest account and its first session. */
	@Transactional
	public TokenPair openForNewGuest() {
		return open(this.accounts.create(Role.GUEST), Role.GUEST);
	}

	public TokenPair open(UUID userId, Role role) {
		return issue(userId, role, UuidV7.next());
	}

	private TokenPair issue(UUID userId, Role role, UUID familyId) {
		String refresh = Secrets.opaqueToken();
		this.tokens.save(Secrets.sha256(refresh), familyId, userId, this.settings.refreshTtl());
		AccessToken access = this.issuer.issue(userId, role);
		return new TokenPair(access.value(), "Bearer", access.expiresIn(), refresh,
				this.settings.refreshTtl().toSeconds(), userId, role.claim());
	}

}
