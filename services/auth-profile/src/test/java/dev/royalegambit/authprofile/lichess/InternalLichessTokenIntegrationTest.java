package dev.royalegambit.authprofile.lichess;

import java.net.http.HttpResponse;
import java.util.UUID;

import dev.royalegambit.authprofile.ServiceIntegrationTest;
import dev.royalegambit.authprofile.support.AuthSteps;
import dev.royalegambit.authprofile.support.FakeLichess;
import dev.royalegambit.authprofile.support.Http;
import dev.royalegambit.authprofile.support.LichessSteps;
import dev.royalegambit.authprofile.support.Mailbox;
import dev.royalegambit.authprofile.support.MailpitContainer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The games service asks for a player's Lichess token here, for the opening explorer
 * (ADR-16, ADR-19). Service to service only: a shared secret, and a path the gateway
 * never routes.
 */
@ServiceIntegrationTest
class InternalLichessTokenIntegrationTest {

	private static final String SECRET = "test-internal-secret";

	@LocalServerPort
	int port;

	@Autowired
	ObjectMapper json;

	@Autowired
	MailpitContainer mailpit;

	@Autowired
	FakeLichess lichess;

	Http http;

	@BeforeEach
	void setUp() {
		this.http = new Http(this.port, this.json);
	}

	private String path(String userId) {
		return "/internal/v1/users/" + userId + "/lichess-token";
	}

	@Test
	void aLichessPlayersTokenGoesToAServiceWithTheSecret() {
		JsonNode signedIn = new LichessSteps(this.http, this.lichess).signIn(LichessSteps.freshName());
		String userId = signedIn.get("user_id").asString();

		HttpResponse<String> response = this.http.getWithHeader(path(userId), "X-Internal-Token", SECRET);

		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		JsonNode token = this.http.body(response);
		assertThat(token.get("access_token").asString()).startsWith("lip_");
		assertThat(token.get("expires_at").asString()).isNotBlank();
	}

	@Test
	void withoutTheSecretNothing() {
		JsonNode signedIn = new LichessSteps(this.http, this.lichess).signIn(LichessSteps.freshName());
		String userId = signedIn.get("user_id").asString();

		this.http.problem(this.http.get(path(userId)), 401);
		this.http.problem(this.http.getWithHeader(path(userId), "X-Internal-Token", "guess"), 401);
		// A user's own access token is not the secret either.
		this.http.problem(this.http.get(path(userId), signedIn.get("access_token").asString()), 401);
	}

	@Test
	void aPlayerWithoutLichessHasNoToken() {
		JsonNode signedIn = new AuthSteps(this.http, new Mailbox(this.mailpit, this.json))
			.signIn("no-lichess-" + UUID.randomUUID() + "@example.com");
		String userId = signedIn.get("user_id").asString();

		JsonNode problem = this.http.problem(this.http.getWithHeader(path(userId), "X-Internal-Token", SECRET), 404);
		assertThat(problem.get("type").asString()).endsWith("/no-lichess");
		this.http.problem(this.http.getWithHeader(path("not-a-uuid"), "X-Internal-Token", SECRET), 400);
	}

}
