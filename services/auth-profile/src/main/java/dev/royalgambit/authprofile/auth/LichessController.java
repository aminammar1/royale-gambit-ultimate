package dev.royalgambit.authprofile.auth;

import java.util.Optional;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import dev.royalgambit.authprofile.token.Role;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Lichess sign-in, linking and unlinking. */
@RestController
class LichessController {

	/**
	 * Loopback only (127.0.0.1, [::1], localhost) with an explicit port. A redirect to
	 * any other host would let someone else's page collect a player's code.
	 */
	record Start(
			@NotNull @Size(max = 200) @Pattern(regexp = "http://(127\\.0\\.0\\.1|\\[::1\\]|localhost):[0-9]{1,5}(/.*)?",
					message = "must be a loopback URL such as http://127.0.0.1:53682/callback") String redirectUri) {
	}

	record Complete(@NotBlank @Size(max = 500) String code, @NotBlank @Size(max = 200) String state) {
	}

	private final LichessSignIn lichess;

	LichessController(LichessSignIn lichess) {
		this.lichess = lichess;
	}

	/**
	 * A user's token here means "link to my account". A guest token does not: guests have
	 * nothing worth linking to, so they simply sign in.
	 */
	@PostMapping("/v1/auth/lichess/start")
	LichessSignIn.Authorization start(@AuthenticationPrincipal Jwt token, @Valid @RequestBody Start body) {
		return this.lichess.start(body.redirectUri(), signedInUser(token));
	}

	/** Needs the same user's token as /start, or none for a sign-in flow. */
	@PostMapping("/v1/auth/lichess/complete")
	TokenPair complete(@AuthenticationPrincipal Jwt token, @Valid @RequestBody Complete body) {
		return this.lichess.complete(body.code(), body.state(), signedInUser(token));
	}

	@DeleteMapping("/v1/auth/identities/lichess")
	ResponseEntity<Void> unlink(@AuthenticationPrincipal Jwt token) {
		this.lichess.unlink(UUID.fromString(token.getSubject()));
		return ResponseEntity.noContent().build();
	}

	private static Optional<UUID> signedInUser(Jwt token) {
		if (token == null || !Role.USER.claim().equals(token.getClaimAsString("role"))) {
			return Optional.empty();
		}
		return Optional.of(UUID.fromString(token.getSubject()));
	}

}
