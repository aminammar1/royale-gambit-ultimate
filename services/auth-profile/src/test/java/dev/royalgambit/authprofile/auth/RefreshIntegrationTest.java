package dev.royalgambit.authprofile.auth;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import dev.royalgambit.authprofile.ServiceIntegrationTest;
import dev.royalgambit.authprofile.common.Secrets;
import dev.royalgambit.authprofile.support.AuthSteps;
import dev.royalgambit.authprofile.support.Http;
import dev.royalgambit.authprofile.support.Mailbox;
import dev.royalgambit.authprofile.support.MailpitContainer;
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

	private static final String INVALID = "https://royal-gambit.dev/problems/refresh-invalid";

	private static final String REUSED = "https://royal-gambit.dev/problems/refresh-reused";

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
		JsonNode first = this.auth.signIn(EmailSignInIntegrationTest.freshEmail());
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
		// The legitimate holder's newest token dies with it, so the thief gets nothing
		// either.
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
		List<Future<Integer>> results = new ArrayList<>();
		try (ExecutorService pool = Executors.newFixedThreadPool(callers)) {
			for (int i = 0; i < callers; i++) {
				results.add(pool.submit(() -> {
					start.await();
					return refresh(shared).statusCode();
				}));
			}
			start.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> result : results) {
				statuses.add(result.get());
			}
			assertThat(statuses).containsOnly(200, 401);
			assertThat(statuses).filteredOn((status) -> status == 200).hasSize(1);
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
