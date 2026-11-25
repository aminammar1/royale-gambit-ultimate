package dev.royalgambit.authprofile.profile;

import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The caller's own profile. The user id always comes from the verified token, never the
 * body.
 */
@RestController
@RequestMapping("/v1/profile")
class ProfileController {

	private final ProfileService profiles;

	ProfileController(ProfileService profiles) {
		this.profiles = profiles;
	}

	@GetMapping
	Profile mine(@AuthenticationPrincipal Jwt token) {
		return this.profiles.find(userId(token))
			.orElseThrow(() -> new ErrorResponseException(HttpStatus.NOT_FOUND,
					ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "no profile yet"), null));
	}

	@PutMapping
	Profile put(@AuthenticationPrincipal Jwt token, @Valid @RequestBody ProfileWrite body) {
		return this.profiles.put(userId(token), body);
	}

	private static UUID userId(Jwt token) {
		return UUID.fromString(token.getSubject());
	}

}
