package dev.royalgambit.authprofile.auth;

import java.net.URI;
import java.time.Duration;

import org.springframework.http.HttpHeaders;
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

	/**
	 * @param window the cap's window; a safe (if pessimistic) time to come back
	 */
	static AuthProblem tooManyCodes(Duration window) {
		AuthProblem problem = new AuthProblem(HttpStatus.TOO_MANY_REQUESTS, "too-many-codes", "Too many codes",
				"too many sign-in codes were sent to this address; try again later");
		problem.getHeaders().set(HttpHeaders.RETRY_AFTER, String.valueOf(window.toSeconds()));
		return problem;
	}

	static AuthProblem mailUnavailable() {
		return new AuthProblem(HttpStatus.SERVICE_UNAVAILABLE, "mail-unavailable", "Cannot send mail",
				"the code could not be sent; try again in a moment");
	}

	static AuthProblem oauthStateInvalid() {
		return new AuthProblem(HttpStatus.UNAUTHORIZED, "oauth-state-invalid", "Sign-in expired",
				"this sign-in attempt is unknown, expired or already finished; start again");
	}

	static AuthProblem lichessCodeInvalid() {
		return new AuthProblem(HttpStatus.UNAUTHORIZED, "lichess-code-invalid", "Lichess refused",
				"Lichess did not accept the authorization code; start again");
	}

	static AuthProblem lichessUnavailable() {
		return new AuthProblem(HttpStatus.SERVICE_UNAVAILABLE, "lichess-unavailable", "Lichess unavailable",
				"Lichess did not answer properly; start the sign-in again in a moment");
	}

	static AuthProblem identityTaken(Provider provider) {
		String what = (provider == Provider.EMAIL) ? "email address" : "Lichess account";
		return new AuthProblem(HttpStatus.CONFLICT, "identity-taken", "Already linked", "this " + what
				+ " belongs to another Royal Gambit account, or yours already has a different one; unlink that first");
	}

	static AuthProblem lastIdentity() {
		return new AuthProblem(HttpStatus.CONFLICT, "last-identity", "Cannot unlink",
				"this is the only way into the account; link another one first");
	}

	private static ProblemDetail describe(HttpStatus status, String type, String title, String detail) {
		ProblemDetail body = ProblemDetail.forStatusAndDetail(status, detail);
		body.setType(URI.create(TYPES + type));
		body.setTitle(title);
		return body;
	}

}
