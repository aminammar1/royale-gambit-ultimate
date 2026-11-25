package dev.royalgambit.authprofile.auth;

import jakarta.validation.Valid;

import dev.royalgambit.authprofile.auth.AuthRequests.EmailStart;
import dev.royalgambit.authprofile.auth.AuthRequests.EmailVerify;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Sign-in endpoints. Thin on purpose: the rules live in the services. */
@RestController
@RequestMapping("/v1/auth")
@EnableConfigurationProperties(EmailCodeSettings.class)
class AuthController {

	private final Sessions sessions;

	private final EmailSignIn emailSignIn;

	AuthController(Sessions sessions, EmailSignIn emailSignIn) {
		this.sessions = sessions;
		this.emailSignIn = emailSignIn;
	}

	@PostMapping("/guest")
	ResponseEntity<TokenPair> guest() {
		return ResponseEntity.status(HttpStatus.CREATED).body(this.sessions.openForNewGuest());
	}

	@PostMapping("/email/start")
	ResponseEntity<Void> startEmail(@Valid @RequestBody EmailStart body) {
		this.emailSignIn.start(body.email());
		return ResponseEntity.accepted().build();
	}

	@PostMapping("/email/verify")
	TokenPair verifyEmail(@Valid @RequestBody EmailVerify body) {
		return this.emailSignIn.verify(body.email(), body.code());
	}

}
