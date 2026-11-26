package dev.royalegambit.authprofile.auth;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import dev.royalegambit.authprofile.ServiceIntegrationTest;
import dev.royalegambit.authprofile.common.Secrets;
import dev.royalegambit.authprofile.support.AuthSteps;
import dev.royalegambit.authprofile.support.Http;
import dev.royalegambit.authprofile.support.Mailbox;
import dev.royalegambit.authprofile.support.MailpitContainer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.assertj.core.api.Assertions.assertThat;

@ServiceIntegrationTest
class RefreshIntegrationTest {

	private static final String INVALID = "https://royale-gambit.dev/problems/refresh-invalid";

	private static final String REUSED = "https://royale-gambit.dev/problems/refresh-reused";

	@LocalServerPort
	int port;

	@Autowired
	ObjectMapper json;

	@Autowired
	MailpitContainer mailpit;

	@Autowired
	JdbcClient jdbc;

	Http http;

	AuthSteps auth;

	@BeforeEach
	void setUp() {
		this.http = new Http(this.port, this.json);
		this.auth = new AuthSteps(this.http, new Mailbox(this.mailpit, this.json));
	}

	@Test
	void rotationHandsOutANewPairForTheSameUser() {
		JsonNode first = this.auth.signIn(AuthSteps.freshEmail());
		JsonNode second = this.http.body(refresh(token(first)));

		assertThat(second.get("refresh_token").asString()).isNotEqualTo(token(first));
		assertThat(second.get("access_token").asString()).isNotEqualTo(first.get("access_token").asString());
		assertThat(second.get("user_id")).isEqualTo(first.get("user_id"));
		assertThat(second.get("role").asString()).isEqualTo("user");
		// The new token keeps working: rotation, not a one-shot session.
		assertThat(refresh(second.get("refresh_token").asString()).statusCode()).isEqualTo(200);
	}

	@Test
	void guestSessionsRotateToo() {
		JsonNode guest = this.auth.guest();
		JsonNode next = this.http.body(refresh(token(guest)));
		assertThat(next.get("role").asString()).isEqualTo("guest");
		assertThat(next.get("user_id")).isEqualTo(guest.get("user_id"));
	}

	@Test
	void usingARotatedTokenAgainRevokesTheWholeSession() {
		JsonNode first = this.auth.guest();
		JsonNode second = this.http.body(refresh(token(first)));

		// Someone replays the old token: that is the theft signal.
		assertThat(type(refresh(token(first)))).isEqualTo(REUSED);
		// The legitimate holder's newest token dies with it, so the thief gets
		// nothing either.
		assertThat(type(refresh(token(second)))).isEqualTo(INVALID);
	}

	@Test
	void unknownTokenIsInvalid() {
		assertThat(type(refresh(Secrets.opaqueToken()))).isEqualTo(INVALID);
	}

	@Test
	void expiredTokenIsInvalid() {
		JsonNode guest = this.auth.guest();
		this.jdbc.sql("UPDATE refresh_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = :hash")
			.param("hash", Secrets.sha256(token(guest)))
			.update();

		assertThat(type(refresh(token(guest)))).isEqualTo(INVALID);
	}

	@Test
	void logoutEndsTheSessionAndCanBeRepeated() {
		JsonNode guest = this.auth.guest();
		JsonNode rotated = this.http.body(refresh(token(guest)));

		assertThat(logout(token(rotated)).statusCode()).isEqualTo(204);
		assertThat(logout(token(rotated)).statusCode()).isEqualTo(204);
		assertThat(logout(Secrets.opaqueToken()).statusCode()).isEqualTo(204);
		assertThat(type(refresh(token(rotated)))).isEqualTo(INVALID);
	}

	@Test
	void concurrentRefreshesWithOneTokenLetExactlyOneThrough() throws Exception {
		String shared = token(this.auth.guest());
		int callers = 10;
		CountDownLatch start = new CountDownLatch(1);
		List<Future<HttpResponse<String>>> results = new ArrayList<>();
		try (ExecutorService pool = Executors.newFixedThreadPool(callers)) {
			for (int i = 0; i < callers; i++) {
				results.add(pool.submit(() -> {
					start.await();
					return refresh(shared);
				}));
			}
			start.countDown();
			List<HttpResponse<String>> responses = new ArrayList<>();
			for (Future<HttpResponse<String>> result : results) {
				responses.add(result.get());
			}
			List<HttpResponse<String>> winners = responses.stream().filter((r) -> r.statusCode() == 200).toList();
			assertThat(winners).hasSize(1);
			List<String> loserTypes = responses.stream().filter((r) -> r.statusCode() != 200).map(this::type).toList();
			assertThat(loserTypes).hasSize(callers - 1).containsOnly(REUSED, INVALID).contains(REUSED);
			// Reuse means "someone copied the token": the winner's fresh token
			// dies too.
			assertThat(type(refresh(token(this.http.body(winners.getFirst()))))).isEqualTo(INVALID);
		}
	}

	@Test
	void malformedBodiesAre400() {
		this.http.problem(this.http.post("/v1/auth/refresh", "{}"), 400);
		this.http.problem(this.http.post("/v1/auth/refresh", "{\"refresh_token\":\"\"}"), 400);
		this.http.problem(this.http.post("/v1/auth/logout", "{\"refresh_token\":7}"), 400);
	}

	private HttpResponse<String> refresh(String token) {
		return this.http.post("/v1/auth/refresh", "{\"refresh_token\":\"" + token + "\"}");
	}

	private HttpResponse<String> logout(String token) {
		return this.http.post("/v1/auth/logout", "{\"refresh_token\":\"" + token + "\"}");
	}

	private String type(HttpResponse<String> response) {
		return this.http.problem(response, 401).get("type").asString();
	}

	private static String token(JsonNode pair) {
		return pair.get("refresh_token").asString();
	}

}
