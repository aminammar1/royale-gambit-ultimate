package dev.royalgambit.authprofile.auth;

import java.util.Optional;
import java.util.UUID;

import dev.royalgambit.authprofile.token.Role;

import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Reads "who is linking" off an optional bearer. Only a user counts: a guest has nothing
 * worth linking to, so a guest's token on a sign-in endpoint simply signs in.
 */
final class SignedIn {

	private SignedIn() {
	}

	static Optional<UUID> user(Jwt token) {
		if (token == null || !Role.USER.claim().equals(token.getClaimAsString("role"))) {
			return Optional.empty();
		}
		return Optional.of(UUID.fromString(token.getSubject()));
	}

}
