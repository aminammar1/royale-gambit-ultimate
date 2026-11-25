package dev.royalgambit.authprofile.support;

import java.net.http.HttpResponse;
import java.util.UUID;

import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The app's side of a Lichess round against {@link FakeLichess}: start, approve,
 * complete.
 */
public final class LichessSteps {

	private static final String REDIRECT = "http://127.0.0.1:53682/callback";

	private final Http http;

	private final FakeLichess lichess;

	public LichessSteps(Http http, FakeLichess lichess) {
		this.http = http;
		this.lichess = lichess;
	}

	/** A Lichess username nobody else in the run has. */
	public static String freshName() {
		return "Player" + UUID.randomUUID().toString().substring(0, 8);
	}

	/** Signs in as this Lichess user, or links it when the bearer is a user's token. */
	public HttpResponse<String> signIn(String username, String bearer) {
		HttpResponse<String> started = this.http.send("POST", "/v1/auth/lichess/start",
				"{\"redirect_uri\":\"" + REDIRECT + "\"}", bearer);
		assertThat(started.statusCode()).as(started.body()).isEqualTo(200);
		JsonNode flow = this.http.body(started);
		String code = this.lichess.approve(flow.get("authorize_url").asString(), username);
		return this.http.send("POST", "/v1/auth/lichess/complete",
				"{\"code\":\"" + code + "\",\"state\":\"" + flow.get("state").asString() + "\"}", bearer);
	}

	public JsonNode signIn(String username) {
		HttpResponse<String> response = signIn(username, null);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return this.http.body(response);
	}

	public HttpResponse<String> unlink(String bearer) {
		return this.http.send("DELETE", "/v1/auth/identities/lichess", null, bearer);
	}

}
