package dev.royalegambit.authprofile.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.UUID;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Routes for other services, never for the app: the gateway routes no /internal path, and
 * each call carries the shared secret. Today one route: a player's Lichess token, for the
 * games service's opening explorer (ADR-16, ADR-19). The token never reaches the desktop
 * app.
 */
@RestController
@EnableConfigurationProperties(InternalSettings.class)
class InternalController {

	private static final String PROBLEMS = "https://royale-gambit.dev/problems/";

	private final InternalSettings settings;

	private final Accounts accounts;

	InternalController(InternalSettings settings, Accounts accounts) {
		this.settings = settings;
		this.accounts = accounts;
	}

	record LichessToken(String accessToken, Instant expiresAt) {
	}

	@GetMapping("/internal/v1/users/{userId}/lichess-token")
	LichessToken lichessToken(@PathVariable String userId,
			@RequestHeader(name = "X-Internal-Token", required = false) String secret) {
		if (!allowed(secret)) {
			throw problem(HttpStatus.UNAUTHORIZED, "internal-only", "Not for you",
					"This route is for other services, with their secret.");
		}
		UUID id;
		try {
			id = UUID.fromString(userId);
		}
		catch (IllegalArgumentException ex) {
			throw problem(HttpStatus.BAD_REQUEST, "invalid-request", "Invalid request", "user_id is a UUID");
		}
		return this.accounts.tokenOf(id, Provider.LICHESS)
			.map((token) -> new LichessToken(token.value(), token.expiresAt()))
			.orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "no-lichess", "No Lichess",
					"This player has not signed in with Lichess."));
	}

	/** Compared in constant time, so the secret cannot be guessed a byte at a time. */
	private boolean allowed(String secret) {
		String expected = this.settings.token();
		if (expected.isEmpty() || secret == null) {
			return false;
		}
		return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
				secret.getBytes(StandardCharsets.UTF_8));
	}

	private static ErrorResponseException problem(HttpStatus status, String type, String title, String detail) {
		ErrorResponseException ex = new ErrorResponseException(status);
		ex.getBody().setType(java.net.URI.create(PROBLEMS + type));
		ex.getBody().setTitle(title);
		ex.getBody().setDetail(detail);
		return ex;
	}

}
