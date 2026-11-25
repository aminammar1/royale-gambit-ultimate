package dev.royalgambit.authprofile.auth;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import dev.royalgambit.authprofile.auth.Accounts.ProviderToken;
import dev.royalgambit.authprofile.auth.LichessClient.LichessAccount;
import dev.royalgambit.authprofile.auth.LichessClient.LichessToken;
import dev.royalgambit.authprofile.common.Secrets;
import dev.royalgambit.authprofile.events.Outbox;
import dev.royalgambit.authprofile.events.UserRegistered;
import dev.royalgambit.authprofile.token.Role;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Sign in with Lichess (OAuth 2.0 authorization code + PKCE). We hold the verifier and
 * the state, so the desktop app only opens a URL and passes back what the redirect
 * brought.
 */
@Service
@EnableConfigurationProperties(LichessSettings.class)
public class LichessSignIn {

	/** What the app needs to send the player to Lichess. */
	public record Authorization(String authorizeUrl, String state, long expiresIn) {
	}

	private final OAuthStates states;

	private final LichessClient lichess;

	private final Accounts accounts;

	private final Sessions sessions;

	private final Outbox outbox;

	private final LichessSettings settings;

	private final TransactionTemplate transaction;

	LichessSignIn(OAuthStates states, LichessClient lichess, Accounts accounts, Sessions sessions, Outbox outbox,
			LichessSettings settings, TransactionTemplate transaction) {
		this.states = states;
		this.lichess = lichess;
		this.accounts = accounts;
		this.sessions = sessions;
		this.outbox = outbox;
		this.settings = settings;
		this.transaction = transaction;
	}

	/**
	 * @param redirectUri a loopback URL, already checked by the request validation
	 * @param linkTo the signed-in user this flow links to; empty for a plain sign-in. The
	 * choice is made here and stored with the state, never inferred at the end of the
	 * flow.
	 */
	public Authorization start(String redirectUri, Optional<UUID> linkTo) {
		String state = Secrets.opaqueToken();
		String verifier = Secrets.opaqueToken();
		this.states.save(Secrets.sha256(state), Provider.LICHESS, verifier, redirectUri, linkTo.orElse(null),
				this.settings.flowTtl());
		String url = UriComponentsBuilder.fromUriString(this.settings.baseUrl())
			.path("/oauth")
			.queryParam("response_type", "code")
			.queryParam("client_id", this.settings.clientId())
			.queryParam("redirect_uri", redirectUri)
			.queryParam("scope", this.settings.scope())
			.queryParam("code_challenge_method", "S256")
			.queryParam("code_challenge", Secrets.pkceChallenge(verifier))
			.queryParam("state", state)
			.encode()
			.build()
			.toUriString();
		return new Authorization(url, state, this.settings.flowTtl().toSeconds());
	}

	/**
	 * Finishes the flow. A link flow must be finished by the user who started it, a
	 * sign-in flow by nobody in particular. Otherwise a code and state captured from one
	 * flow could be sent with someone else's token and link the wrong accounts.
	 * @param caller the signed-in user sending this request, if any
	 */
	public TokenPair complete(String code, String state, Optional<UUID> caller) {
		OAuthStates.Flow flow = this.states.consume(Secrets.sha256(state), Provider.LICHESS, caller.orElse(null))
			.orElseThrow(AuthProblem::oauthStateInvalid);
		// No transaction around the network calls: no row locks held while
		// Lichess thinks.
		LichessToken token = this.lichess.exchange(code, flow.verifier(), flow.redirectUri());
		LichessAccount account = this.lichess.account(token.accessToken());
		ProviderToken kept = new ProviderToken(token.accessToken(), token.expiresAt());
		UUID userId = attach(account, kept, caller);
		return this.sessions.open(userId, Role.USER);
	}

	/** Unlinks Lichess, unless it is the only way left into the account. */
	public void unlink(UUID userId) {
		this.transaction.executeWithoutResult((status) -> {
			List<String> providers = this.accounts.lockProviders(userId);
			if (!providers.contains(Provider.LICHESS.id())) {
				return;
			}
			if (providers.stream().allMatch(Provider.LICHESS.id()::equals)) {
				throw AuthProblem.lastIdentity();
			}
			this.accounts.unlink(userId, Provider.LICHESS);
		});
	}

	private UUID attach(LichessAccount account, ProviderToken token, Optional<UUID> linkTo) {
		try {
			return this.transaction.execute((status) -> attachOnce(account, token, linkTo));
		}
		catch (DuplicateKeyException firstSignInRace) {
			// Two first sign-ins of one Lichess player at once: the other
			// request just created the account, so this time we find it.
			return this.transaction.execute((status) -> attachOnce(account, token, linkTo));
		}
	}

	private UUID attachOnce(LichessAccount account, ProviderToken token, Optional<UUID> linkTo) {
		Optional<UUID> owner = this.accounts.findBy(Provider.LICHESS, account.id());
		if (linkTo.isPresent()) {
			if (owner.isPresent() && !owner.get().equals(linkTo.get())) {
				throw AuthProblem.identityTaken();
			}
			Optional<String> current = this.accounts.subjectOf(linkTo.get(), Provider.LICHESS);
			if (current.isPresent() && !current.get().equals(account.id())) {
				// One Lichess user per account: the player unlinks the old one
				// first.
				throw AuthProblem.identityTaken();
			}
			if (owner.isEmpty()) {
				this.accounts.link(linkTo.get(), Provider.LICHESS, account.id(), token);
				return linkTo.get();
			}
		}
		if (owner.isPresent()) {
			// Keep the newest token: the explorer will use it on the player's
			// behalf.
			this.accounts.updateToken(Provider.LICHESS, account.id(), token);
			return owner.get();
		}
		UUID userId = this.accounts.createWith(Provider.LICHESS, account.id(), token);
		this.outbox.append(UserRegistered.TYPE, new UserRegistered(userId, Instant.now()));
		return userId;
	}

}
