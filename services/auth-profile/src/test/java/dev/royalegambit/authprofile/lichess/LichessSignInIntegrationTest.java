package dev.royalegambit.authprofile.lichess;

import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import dev.royalegambit.authprofile.ServiceIntegrationTest;
import dev.royalegambit.authprofile.support.AuthSteps;
import dev.royalegambit.authprofile.support.FakeLichess;
import dev.royalegambit.authprofile.support.Http;
import dev.royalegambit.authprofile.support.Mailbox;
import dev.royalegambit.authprofile.support.MailpitContainer;
import org.junit.jupiter.api.AfterEach;
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

/** The desktop app's side of the flow, played step by step against a fake Lichess. */
@ServiceIntegrationTest
class LichessSignInIntegrationTest {

	private static final String PROBLEMS = "https://royale-gambit.dev/problems/";

	private static final String REDIRECT = "http://127.0.0.1:53682/callback";

	@LocalServerPort
	int port;

	@Autowired
	ObjectMapper json;

	@Autowired
	MailpitContainer mailpit;

	@Autowired
	FakeLichess lichess;

	@Autowired
	JdbcClient jdbc;

	Http http;

	AuthSteps auth;

	@BeforeEach
	void setUp() {
		this.http = new Http(this.port, this.json);
		this.auth = new AuthSteps(this.http, new Mailbox(this.mailpit, this.json));
	}

	@AfterEach
	void lichessBehavesAgain() {
		this.lichess.behave();
	}

	@Test
	void startHandsOutAPkceAuthorizeUrl() {
		JsonNode started = start(REDIRECT);
		URI url = URI.create(started.get("authorize_url").asString());
		Map<String, String> query = query(url);

		assertThat(url.getPath()).isEqualTo("/oauth");
		assertThat(query).containsEntry("response_type", "code")
			.containsEntry("code_challenge_method", "S256")
			.containsEntry("redirect_uri", REDIRECT)
			.containsEntry("client_id", "royale-gambit")
			.containsEntry("state", started.get("state").asString());
		assertThat(query.get("code_challenge")).hasSize(43);
		assertThat(started.get("expires_in").asInt()).isEqualTo(600);
	}

	@ParameterizedTest
	@ValueSource(strings = { "https://evil.example/callback", "http://evil.example:80/cb",
			"http://127.0.0.1.evil.example:80/", "http://localhost.evil.example:1/", "ftp://127.0.0.1:21/",
			"http://127.0.0.1/no-port", "",
			// Lichess appends code and state itself; a query here would break
			// that URL.
			"http://127.0.0.1:1/cb?x=1&y=2", "http://127.0.0.1:1/cb#fragment" })
	void onlyLoopbackRedirectsAreAccepted(String redirect) {
		this.http.problem(this.http.post("/v1/auth/lichess/start", "{\"redirect_uri\":\"" + redirect + "\"}"), 400);
	}

	@ParameterizedTest
	@ValueSource(strings = { "http://127.0.0.1:1/", "http://[::1]:65535/cb", "http://localhost:8765" })
	void loopbackRedirectsInEveryFormWork(String redirect) {
		assertThat(start(redirect).get("authorize_url").asString()).contains("redirect_uri=");
	}

	@Test
	void firstSignInCreatesAnAccountAndRegistersIt() {
		String name = lichessName();
		JsonNode tokens = this.http.body(signIn(name));

		assertThat(tokens.get("role").asString()).isEqualTo("user");
		assertThat(registrations(tokens.get("user_id").asString())).isEqualTo(1);
		// The same Lichess player next time: same account, no second
		// registration.
		JsonNode again = this.http.body(signIn(name));
		assertThat(again.get("user_id")).isEqualTo(tokens.get("user_id"));
		assertThat(registrations(tokens.get("user_id").asString())).isEqualTo(1);
	}

	@Test
	void theLichessTokenNeverLeavesTheService() {
		HttpResponse<String> response = signIn(lichessName());
		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(response.body()).doesNotContain("lip_");
	}

	@Test
	void aStateWorksOnce() {
		JsonNode started = start(REDIRECT);
		String state = started.get("state").asString();
		String code = this.lichess.approve(started.get("authorize_url").asString(), lichessName());
		assertThat(complete(code, state, null).statusCode()).isEqualTo(200);

		assertThat(type(complete(code, state, null), 401)).isEqualTo(PROBLEMS + "oauth-state-invalid");
	}

	@Test
	void anUnknownOrExpiredStateIsRefused() {
		assertThat(type(complete("whatever", "not-a-state", null), 401)).isEqualTo(PROBLEMS + "oauth-state-invalid");

		JsonNode started = start(REDIRECT);
		String code = this.lichess.approve(started.get("authorize_url").asString(), lichessName());
		this.jdbc.sql("UPDATE oauth_states SET expires_at = now() - interval '1 second'").update();
		assertThat(type(complete(code, started.get("state").asString(), null), 401))
			.isEqualTo(PROBLEMS + "oauth-state-invalid");
	}

	@Test
	void aCodeLichessRefusesIs401() {
		JsonNode started = start(REDIRECT);
		assertThat(type(complete("made-up-code", started.get("state").asString(), null), 401))
			.isEqualTo(PROBLEMS + "lichess-code-invalid");
	}

	@Test
	void lichessBeingDownIs503() {
		JsonNode started = start(REDIRECT);
		String code = this.lichess.approve(started.get("authorize_url").asString(), lichessName());
		this.lichess.failWith(502);

		assertThat(type(complete(code, started.get("state").asString(), null), 503))
			.isEqualTo(PROBLEMS + "lichess-unavailable");
	}

	@Test
	void linkingAttachesLichessToTheSignedInAccount() {
		JsonNode emailUser = this.auth.signIn(AuthSteps.freshEmail());
		String name = lichessName();
		JsonNode linked = this.http.body(signIn(name, emailUser.get("access_token").asString()));
		assertThat(linked.get("user_id")).isEqualTo(emailUser.get("user_id"));

		// Next time Lichess alone opens the same account.
		assertThat(this.http.body(signIn(name)).get("user_id")).isEqualTo(emailUser.get("user_id"));
	}

	@Test
	void aLichessUserLinkedElsewhereCannotBeLinkedAgain() {
		String name = lichessName();
		signIn(name);
		String otherUser = this.auth.signIn(AuthSteps.freshEmail()).get("access_token").asString();

		assertThat(type(signIn(name, otherUser), 409)).isEqualTo(PROBLEMS + "identity-taken");
	}

	@Test
	void anAccountHoldsOneLichessUserAtATime() {
		JsonNode emailUser = this.auth.signIn(AuthSteps.freshEmail());
		String token = emailUser.get("access_token").asString();
		signIn(lichessName(), token);

		assertThat(type(signIn(lichessName(), token), 409)).isEqualTo(PROBLEMS + "identity-taken");
		// So unlinking can never sweep away more than the one Lichess way in.
		assertThat(unlink(token).statusCode()).isEqualTo(204);
		assertThat(this.auth.signIn(emailUserEmail(emailUser)).get("user_id")).isEqualTo(emailUser.get("user_id"));
	}

	@Test
	void aLichessOnlyAccountCannotSwapInASecondLichessUser() {
		String token = this.http.body(signIn(lichessName())).get("access_token").asString();
		assertThat(type(signIn(lichessName(), token), 409)).isEqualTo(PROBLEMS + "identity-taken");
		assertThat(type(unlink(token), 409)).isEqualTo(PROBLEMS + "last-identity");
	}

	@Test
	void aLinkFlowCanOnlyBeFinishedByTheUserWhoStartedIt() {
		String owner = this.auth.signIn(AuthSteps.freshEmail()).get("access_token").asString();
		String someoneElse = this.auth.signIn(AuthSteps.freshEmail()).get("access_token").asString();
		JsonNode started = start(REDIRECT, owner);
		String code = this.lichess.approve(started.get("authorize_url").asString(), lichessName());
		String state = started.get("state").asString();

		assertThat(type(complete(code, state, someoneElse), 401)).isEqualTo(PROBLEMS + "oauth-state-invalid");
	}

	@Test
	void aSignInFlowCannotBeTurnedIntoALinkOnSomeoneElsesAccount() {
		// The attacker approves with their own Lichess and gets a victim's app
		// to post the code and state with the victim's token.
		JsonNode victim = this.auth.signIn(AuthSteps.freshEmail());
		JsonNode started = start(REDIRECT);
		String attackerLichess = lichessName();
		String code = this.lichess.approve(started.get("authorize_url").asString(), attackerLichess);

		assertThat(type(complete(code, started.get("state").asString(), victim.get("access_token").asString()), 401))
			.isEqualTo(PROBLEMS + "oauth-state-invalid");
		// Nothing got linked: the attacker's Lichess still opens a separate,
		// new account.
		assertThat(this.http.body(signIn(attackerLichess)).get("user_id")).isNotEqualTo(victim.get("user_id"));
	}

	@Test
	void aGuestTokenStartsAPlainSignIn() {
		String guest = this.auth.guest().get("access_token").asString();
		JsonNode signedIn = this.http.body(signIn(lichessName(), guest));
		assertThat(signedIn.get("role").asString()).isEqualTo("user");
	}

	@Test
	void unlinkingFreesTheLichessUser() {
		JsonNode emailUser = this.auth.signIn(AuthSteps.freshEmail());
		String token = emailUser.get("access_token").asString();
		String name = lichessName();
		signIn(name, token);

		assertThat(unlink(token).statusCode()).isEqualTo(204);
		assertThat(unlink(token).statusCode()).isEqualTo(204);
		// The Lichess user now gets an account of its own.
		assertThat(this.http.body(signIn(name)).get("user_id")).isNotEqualTo(emailUser.get("user_id"));
	}

	@Test
	void theLastWayIntoAnAccountCannotBeUnlinked() {
		String token = this.http.body(signIn(lichessName())).get("access_token").asString();
		assertThat(type(unlink(token), 409)).isEqualTo(PROBLEMS + "last-identity");
	}

	@Test
	void unlinkingNeedsASignedInUser() {
		this.http.problem(this.http.send("DELETE", "/v1/auth/identities/lichess", null, null), 401);
		this.http.problem(unlink(this.auth.guest().get("access_token").asString()), 403);
	}

	@Test
	void aBadBearerOnCompleteIsRefusedNotIgnored() {
		JsonNode started = start(REDIRECT);
		String code = this.lichess.approve(started.get("authorize_url").asString(), lichessName());
		this.http.problem(complete(code, started.get("state").asString(), "not.a.jwt"), 401);
	}

	private JsonNode start(String redirect) {
		return start(redirect, null);
	}

	private JsonNode start(String redirect, String bearer) {
		HttpResponse<String> response = this.http.send("POST", "/v1/auth/lichess/start",
				"{\"redirect_uri\":\"" + redirect + "\"}", bearer);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return this.http.body(response);
	}

	private HttpResponse<String> signIn(String lichessUser) {
		return signIn(lichessUser, null);
	}

	/** Start, approve on "Lichess", complete: the whole round as the app runs it. */
	private HttpResponse<String> signIn(String lichessUser, String bearer) {
		JsonNode started = start(REDIRECT, bearer);
		String code = this.lichess.approve(started.get("authorize_url").asString(), lichessUser);
		return complete(code, started.get("state").asString(), bearer);
	}

	private HttpResponse<String> complete(String code, String state, String bearer) {
		return this.http.send("POST", "/v1/auth/lichess/complete",
				"{\"code\":\"" + code + "\",\"state\":\"" + state + "\"}", bearer);
	}

	private HttpResponse<String> unlink(String bearer) {
		return this.http.send("DELETE", "/v1/auth/identities/lichess", null, bearer);
	}

	private String emailUserEmail(JsonNode tokens) {
		return this.jdbc.sql("SELECT subject FROM identities WHERE provider = 'email' AND user_id = :id")
			.param("id", UUID.fromString(tokens.get("user_id").asString()))
			.query(String.class)
			.single();
	}

	private int registrations(String userId) {
		return this.jdbc.sql("SELECT count(*) FROM outbox WHERE type = 'user.registered' AND data->>'user_id' = :id")
			.param("id", userId)
			.query(Integer.class)
			.single();
	}

	private String type(HttpResponse<String> response, int status) {
		return this.http.problem(response, status).get("type").asString();
	}

	private static String lichessName() {
		return "Player" + UUID.randomUUID().toString().substring(0, 8);
	}

	private static Map<String, String> query(URI url) {
		return Arrays.stream(url.getRawQuery().split("&"))
			.map((pair) -> pair.split("=", 2))
			.collect(Collectors.toMap((kv) -> URLDecoder.decode(kv[0], StandardCharsets.UTF_8),
					(kv) -> URLDecoder.decode(kv[1], StandardCharsets.UTF_8)));
	}

}
