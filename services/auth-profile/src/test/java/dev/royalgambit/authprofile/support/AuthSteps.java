package dev.royalgambit.authprofile.support;

import java.net.http.HttpResponse;

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

	public HttpResponse<String> requestCode(String email) {
		return this.http.post("/v1/auth/email/start", "{\"email\":\"" + email + "\"}");
	}

	public HttpResponse<String> verify(String email, String code) {
		return this.http.post("/v1/auth/email/verify", "{\"email\":\"" + email + "\",\"code\":\"" + code + "\"}");
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
