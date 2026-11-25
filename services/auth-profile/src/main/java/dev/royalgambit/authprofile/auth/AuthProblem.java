package dev.royalgambit.authprofile.auth;

import java.net.URI;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * The sign-in failures a client must tell apart. Each has its own {@code type} so the app
 * can show "wrong code, 3 tries left" and "ask for a new code" without parsing text.
 */
public final class AuthProblem extends ErrorResponseException {

	private static final String TYPES = "https://royal-gambit.dev/problems/";

	private AuthProblem(HttpStatus status, String type, String title, String detail) {
		super(status, describe(status, type, title, detail), null);
	}

	static AuthProblem codeInvalid(int attemptsLeft) {
		AuthProblem problem = new AuthProblem(HttpStatus.UNAUTHORIZED, "code-invalid", "Wrong code",
				"that code does not match");
		problem.getBody().setProperty("attempts_left", attemptsLeft);
		return problem;
	}

	static AuthProblem codeExpired() {
		return new AuthProblem(HttpStatus.UNAUTHORIZED, "code-expired", "No valid code",
				"the code expired, was already used or ran out of attempts; ask for a new one");
	}

	static AuthProblem refreshInvalid() {
		return new AuthProblem(HttpStatus.UNAUTHORIZED, "refresh-invalid", "Session ended",
				"the refresh token is unknown, expired or revoked; sign in again");
	}

	static AuthProblem refreshReused() {
		return new AuthProblem(HttpStatus.UNAUTHORIZED, "refresh-reused", "Session revoked",
				"this refresh token was already used, so the session was ended for safety; sign in again");
	}

	static AuthProblem mailUnavailable() {
		return new AuthProblem(HttpStatus.SERVICE_UNAVAILABLE, "mail-unavailable", "Cannot send mail",
				"the code could not be sent; try again in a moment");
	}

	private static ProblemDetail describe(HttpStatus status, String type, String title, String detail) {
		ProblemDetail body = ProblemDetail.forStatusAndDetail(status, detail);
		body.setType(URI.create(TYPES + type));
		body.setTitle(title);
		return body;
	}

}
