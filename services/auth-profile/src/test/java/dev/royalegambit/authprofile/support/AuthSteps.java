package dev.royalegambit.authprofile.support;

import java.net.http.HttpResponse;
import java.util.UUID;

import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;

/** The sign-in moves most tests start with, written once. */
public final class AuthSteps {

	private final Http http;

	private final Mailbox mailbox;

	public AuthSteps(Http http, Mailbox mailbox) {
		this.http = http;
		this.mailbox = mailbox;
	}

	/** Every test gets its own address, so tests never see each other's mail or codes. */
	public static String freshEmail() {
		return "player-" + UUID.randomUUID() + "@example.com";
	}

	public HttpResponse<String> requestCode(String email) {
		return this.http.post("/v1/auth/email/start", "{\"email\":\"" + email + "\"}");
	}

	public HttpResponse<String> verify(String email, String code) {
		return verify(email, code, null);
	}

	/**
	 * With a user's token this links the address to that account instead of signing in.
	 */
	public HttpResponse<String> verify(String email, String code, String bearer) {
		return this.http.send("POST", "/v1/auth/email/verify",
				"{\"email\":\"" + email + "\",\"code\":\"" + code + "\"}", bearer);
	}

	/** Asks for a code and sends it back with the bearer; returns the raw answer. */
	public HttpResponse<String> linkEmail(String email, String bearer) {
		assertThat(requestCode(email).statusCode()).isEqualTo(202);
		return verify(email, this.mailbox.latestCode(email), bearer);
	}

	/** Full email sign-in; returns the token pair. */
	public JsonNode signIn(String email) {
		assertThat(requestCode(email).statusCode()).isEqualTo(202);
		HttpResponse<String> verified = verify(email, this.mailbox.latestCode(email));
		assertThat(verified.statusCode()).as(verified.body()).isEqualTo(200);
		return this.http.body(verified);
	}

	public JsonNode guest() {
		HttpResponse<String> response = this.http.post("/v1/auth/guest", null);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
		return this.http.body(response);
	}

}
