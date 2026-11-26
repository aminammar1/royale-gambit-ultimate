package dev.royalegambit.authprofile.auth;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** The signed-in player's ways in. Guests are turned away by SecurityConfig. */
@RestController
class IdentitiesController {

	private final Accounts accounts;

	IdentitiesController(Accounts accounts) {
		this.accounts = accounts;
	}

	@GetMapping("/v1/auth/identities")
	List<Identity> list(@AuthenticationPrincipal Jwt token) {
		return this.accounts.identitiesOf(UUID.fromString(token.getSubject()));
	}

}
