package dev.royalgambit.authprofile.auth;

import java.net.http.HttpResponse;
import java.util.UUID;

import dev.royalgambit.authprofile.ServiceIntegrationTest;
import dev.royalgambit.authprofile.support.AuthSteps;
import dev.royalgambit.authprofile.support.Http;
import dev.royalgambit.authprofile.support.Mailbox;
import dev.royalgambit.authprofile.support.MailpitContainer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.assertj.core.api.Assertions.assertThat;

@ServiceIntegrationTest
class EmailSignInIntegrationTest {

	private static final String CODE_INVALID = "https://royal-gambit.dev/problems/code-invalid";

	private static final String CODE_EXPIRED = "https://royal-gambit.dev/problems/code-expired";

	@LocalServerPort
	int port;

	@Autowired
	ObjectMapper json;

	@Autowired
	MailpitContainer mailpit;

	@Autowired
	JdbcClient jdbc;

	Http http;

	Mailbox mailbox;

	AuthSteps auth;

	@BeforeEach
	void setUp() {
		this.http = new Http(this.port, this.json);
		this.mailbox = new Mailbox(this.mailpit, this.json);
		this.auth = new AuthSteps(this.http, this.mailbox);
	}

	/** Every test gets its own address, so tests never see each other's mail or codes. */
	static String freshEmail() {
		return "player-" + UUID.randomUUID() + "@example.com";
	}

	@Test
	void codeArrivesByMailAndSignsIn() {
		String email = freshEmail();
		JsonNode tokens = this.auth.signIn(email);

		assertThat(tokens.get("token_type").asString()).isEqualTo("Bearer");
		assertThat(tokens.get("expires_in").asInt()).isEqualTo(900);
		assertThat(tokens.get("refresh_expires_in").asInt()).isEqualTo(30 * 24 * 3600);
		assertThat(tokens.get("role").asString()).isEqualTo("user");
		assertThat(UUID.fromString(tokens.get("user_id").asString()).version()).isEqualTo(7);
		assertThat(tokens.get("access_token").asString()).contains(".");
		assertThat(tokens.get("refresh_token").asString()).hasSize(43);
	}

	@Test
	void wrongCodeCountsDownThenTheCodeIsGone() {
		String email = freshEmail();
		this.auth.requestCode(email);
		String code = this.mailbox.latestCode(email);
		String wrong = code.equals("000000") ? "111111" : "000000";

		for (int left = 4; left >= 0; left--) {
			JsonNode problem = this.http.problem(this.auth.verify(email, wrong), 401);
			assertThat(problem.get("type").asString()).isEqualTo(CODE_INVALID);
			assertThat(problem.get("attempts_left").asInt()).isEqualTo(left);
		}
		// Out of guesses: even the right code no longer works.
		assertThat(type(this.auth.verify(email, code))).isEqualTo(CODE_EXPIRED);
	}

	@Test
	void expiredCodeIsRejected() {
		String email = freshEmail();
		this.auth.requestCode(email);
		String code = this.mailbox.latestCode(email);
		this.jdbc.sql("UPDATE email_codes SET expires_at = now() - interval '1 second' WHERE email = :email")
			.param("email", email)
			.update();

		assertThat(type(this.auth.verify(email, code))).isEqualTo(CODE_EXPIRED);
	}

	@Test
	void aCodeWorksOnlyOnce() {
		String email = freshEmail();
		this.auth.signIn(email);
		String used = this.mailbox.latestCode(email);

		assertThat(type(this.auth.verify(email, used))).isEqualTo(CODE_EXPIRED);
	}

	@Test
	void aNewCodeReplacesTheOldOne() {
		String email = freshEmail();
		this.auth.requestCode(email);
		String first = this.mailbox.latestCode(email);
		pushPastCooldown(email);
		this.auth.requestCode(email);
		String second = this.mailbox.latestCode(email);
		assertThat(this.mailbox.subjectsFor(email)).hasSize(2);

		if (!first.equals(second)) {
			assertThat(type(this.auth.verify(email, first))).isEqualTo(CODE_INVALID);
		}
		assertThat(this.auth.verify(email, second).statusCode()).isEqualTo(200);
	}

	@Test
	void askingAgainInsideTheCooldownSendsNothing() {
		String email = freshEmail();
		assertThat(this.auth.requestCode(email).statusCode()).isEqualTo(202);
		assertThat(this.auth.requestCode(email).statusCode()).isEqualTo(202);

		assertThat(this.mailbox.subjectsFor(email)).hasSize(1);
	}

	@Test
	void emailIsNormalizedToOneAccount() {
		String local = "Mixed-" + UUID.randomUUID();
		String normalized = local.toLowerCase() + "@example.com";

		this.auth.requestCode("  " + local + "@Example.COM ");
		JsonNode first = this.http.body(this.auth.verify(normalized, this.mailbox.latestCode(normalized)));
		String code = signInCodeFor(normalized);
		JsonNode second = this.http.body(this.auth.verify(local.toUpperCase() + "@EXAMPLE.com", code));

		assertThat(first.get("user_id").asString()).isNotBlank();
		assertThat(second.get("user_id").asString()).isEqualTo(first.get("user_id").asString());
	}

	@Test
	void onlyTheFirstSignInRegistersTheUser() {
		String email = freshEmail();
		String userId = this.auth.signIn(email).get("user_id").asString();
		this.auth.signIn(email);

		Integer registered = this.jdbc
			.sql("SELECT count(*) FROM outbox WHERE type = 'user.registered' AND data->>'user_id' = :id")
			.param("id", userId)
			.query(Integer.class)
			.single();
		assertThat(registered).isEqualTo(1);
		JsonNode data = this.json.readTree(
				this.jdbc.sql("SELECT data::text FROM outbox WHERE type = 'user.registered' AND data->>'user_id' = :id")
					.param("id", userId)
					.query(String.class)
					.single());
		// Exactly the event schema: no email or anything else personal.
		assertThat(data.propertyNames()).containsExactlyInAnyOrder("user_id", "registered_at");
	}

	@Test
	void guestGetsItsOwnTokens() {
		JsonNode guest = this.auth.guest();
		assertThat(guest.get("role").asString()).isEqualTo("guest");
		assertThat(guest.get("refresh_token").asString()).hasSize(43);
		assertThat(this.auth.guest().get("user_id")).isNotEqualTo(guest.get("user_id"));
	}

	@ParameterizedTest
	@ValueSource(strings = { "{\"email\":\"not-an-email\"}", "{\"email\":\"\"}", "{}", "{\"email\":5}",
			"{\"email\":\"a@b.co\",\"extra\":1}" })
	void badStartBodiesAre400(String body) {
		this.http.problem(this.http.post("/v1/auth/email/start", body), 400);
	}

	@ParameterizedTest
	@ValueSource(strings = { "12345", "1234567", "12ab56", " 123456" })
	void codesThatCannotBeCodesAre400(String code) {
		this.http.problem(this.auth.verify(freshEmail(), code), 400);
	}

	private String signInCodeFor(String normalized) {
		pushPastCooldown(normalized);
		this.auth.requestCode(normalized);
		return this.mailbox.latestCode(normalized);
	}

	private void pushPastCooldown(String email) {
		this.jdbc.sql("UPDATE email_codes SET created_at = created_at - interval '2 minutes' WHERE email = :email")
			.param("email", email)
			.update();
	}

	private String type(HttpResponse<String> response) {
		return this.http.problem(response, 401).get("type").asString();
	}

}
