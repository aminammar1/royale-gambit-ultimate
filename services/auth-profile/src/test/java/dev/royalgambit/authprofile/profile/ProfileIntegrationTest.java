package dev.royalgambit.authprofile.profile;

import java.net.http.HttpResponse;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
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
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;

import static org.assertj.core.api.Assertions.assertThat;

@ServiceIntegrationTest
class ProfileIntegrationTest {

	@LocalServerPort
	int port;

	@Autowired
	ObjectMapper json;

	@Autowired
	MailpitContainer mailpit;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	JwtEncoder encoder;

	Http http;

	AuthSteps auth;

	@BeforeEach
	void setUp() {
		this.http = new Http(this.port, this.json);
		this.auth = new AuthSteps(this.http, new Mailbox(this.mailpit, this.json));
	}

	@Test
	void noProfileYetIs404() {
		this.http.problem(this.http.get("/v1/profile", player()), 404);
	}

	@Test
	void putCreatesAndGetReadsItBack() {
		String token = player();
		String name = uniqueName();
		HttpResponse<String> put = put(token, name, "MA", "{\"board\":\"walnut\",\"sounds\":false}",
				"2026-11-20T10:00:00Z");
		assertThat(put.statusCode()).as(put.body()).isEqualTo(200);

		JsonNode got = this.http.body(this.http.get("/v1/profile", token));
		assertThat(got.get("username").asString()).isEqualTo(name);
		assertThat(got.get("country").asString()).isEqualTo("MA");
		assertThat(got.get("settings").get("board").asString()).isEqualTo("walnut");
		assertThat(got.get("updated_at").asString()).isEqualTo("2026-11-20T10:00:00Z");
		assertThat(got.get("user_id").asString()).isEqualTo(this.http.body(put).get("user_id").asString());
	}

	@Test
	void anOlderWriteLosesToTheStoredOne() {
		String token = player();
		String name = uniqueName();
		put(token, name, "FR", "{}", "2026-11-20T10:00:00Z");

		// A device that was offline syncs an edit made before the stored one.
		JsonNode answer = this.http.body(put(token, uniqueName(), "DE", "{}", "2026-11-19T09:00:00Z"));
		assertThat(answer.get("username").asString()).isEqualTo(name);
		assertThat(answer.get("country").asString()).isEqualTo("FR");
	}

	@Test
	void aClockFromTheFutureCannotFreezeTheProfile() {
		String token = player();
		JsonNode stored = this.http.body(put(token, uniqueName(), "FR", "{}", "2099-01-01T00:00:00Z"));
		assertThat(Instant.parse(stored.get("updated_at").asString())).isBefore(Instant.now().plusSeconds(5));

		String later = uniqueName();
		assertThat(this.http.body(put(token, later, "FR", "{}", Instant.now().plusSeconds(1).toString()))
			.get("username")
			.asString()).isEqualTo(later);
	}

	@Test
	void usernamesAreUniqueIgnoringCase() {
		String name = uniqueName();
		put(player(), name, "FR", "{}", "2026-11-20T10:00:00Z");

		assertThat(this.http.problem(put(player(), name.toUpperCase(), "FR", "{}", "2026-11-20T10:00:00Z"), 409)
			.get("type")
			.asString()).isEqualTo("https://royal-gambit.dev/problems/username-taken");
	}

	@Test
	void guestsKeepTheirProfileOnTheDevice() {
		String guest = this.auth.guest().get("access_token").asString();
		this.http.problem(this.http.get("/v1/profile", guest), 403);
		this.http.problem(put(guest, uniqueName(), "FR", "{}", "2026-11-20T10:00:00Z"), 403);
	}

	@Test
	void noTokenIs401() {
		HttpResponse<String> response = this.http.get("/v1/profile");
		this.http.problem(response, 401);
		assertThat(response.headers().firstValue("WWW-Authenticate"))
			.hasValueSatisfying((v) -> assertThat(v).startsWith("Bearer"));
	}

	@Test
	void aTokenSignedByAnotherKeyIs401() throws Exception {
		KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
		generator.initialize(2048);
		var pair = generator.generateKeyPair();
		JWTClaimsSet claims = new JWTClaimsSet.Builder().issuer("royal-gambit")
			.subject(UUID.randomUUID().toString())
			.claim("role", "user")
			.issueTime(new java.util.Date())
			.expirationTime(new java.util.Date(System.currentTimeMillis() + 60_000))
			.build();
		SignedJWT forged = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), claims);
		forged.sign(new RSASSASigner((RSAPrivateKey) pair.getPrivate()));
		assertThat(pair.getPublic()).isInstanceOf(RSAPublicKey.class);

		this.http.problem(this.http.get("/v1/profile", forged.serialize()), 401);
	}

	@Test
	void anExpiredTokenIs401() {
		this.http.problem(this.http.get("/v1/profile", ourToken(Instant.now().minus(Duration.ofMinutes(20)))), 401);
	}

	@Test
	void aChangeWritesProfileUpdatedAndARepeatDoesNot() {
		String token = player();
		String name = uniqueName();
		String userId = this.http.body(put(token, name, "MA", "{\"a\":1}", "2026-11-20T10:00:00Z"))
			.get("user_id")
			.asString();
		put(token, name, "MA", "{\"a\":1}", "2026-11-20T11:00:00Z");

		assertThat(events(userId)).hasSize(1);
		JsonNode data = this.json.readTree(events(userId).getFirst());
		assertThat(data.propertyNames()).containsExactlyInAnyOrder("user_id", "username", "country", "updated_at");
		assertThat(data.get("username").asString()).isEqualTo(name);

		put(token, name, "FR", "{\"a\":1}", "2026-11-20T12:00:00Z");
		assertThat(events(userId)).hasSize(2);
	}

	@Test
	void aSettingsOnlyChangeIsSavedButNotAnnounced() {
		String token = player();
		String name = uniqueName();
		String userId = this.http.body(put(token, name, "MA", "{\"board\":\"walnut\"}", "2026-11-20T10:00:00Z"))
			.get("user_id")
			.asString();
		JsonNode saved = this.http.body(put(token, name, "MA", "{\"board\":\"slate\"}", "2026-11-20T11:00:00Z"));

		assertThat(saved.get("settings").get("board").asString()).isEqualTo("slate");
		// The event carries no settings, so announcing this would tell
		// consumers nothing.
		assertThat(events(userId)).hasSize(1);
	}

	@ParameterizedTest
	@ValueSource(strings = {
			"{\"username\":\"ab\",\"country\":\"FR\",\"settings\":{},\"updated_at\":\"2026-11-20T10:00:00Z\"}",
			"{\"username\":\"has space\",\"country\":\"FR\",\"settings\":{},\"updated_at\":\"2026-11-20T10:00:00Z\"}",
			"{\"username\":\"okname\",\"country\":\"fr\",\"settings\":{},\"updated_at\":\"2026-11-20T10:00:00Z\"}",
			"{\"username\":\"okname\",\"country\":\"XX\",\"settings\":{},\"updated_at\":\"2026-11-20T10:00:00Z\"}",
			"{\"username\":\"okname\",\"country\":\"FR\",\"settings\":[1],\"updated_at\":\"2026-11-20T10:00:00Z\"}",
			"{\"username\":\"okname\",\"country\":\"FR\",\"settings\":{},\"updated_at\":\"yesterday\"}",
			"{\"username\":\"okname\",\"country\":\"FR\",\"settings\":{}}",
			// A number is not a date-time, even if it looks like epoch seconds.
			"{\"username\":\"okname\",\"country\":\"FR\",\"settings\":{},\"updated_at\":0}",
			"{\"username\":\"okname\",\"country\":\"FR\",\"settings\":{},\"updated_at\":\"2026-11-20T10:00:00Z\",\"x\":1}" })
	void badProfilesAre400(String body) {
		this.http.problem(this.http.put("/v1/profile", body, player()), 400);
	}

	@ParameterizedTest
	@ValueSource(strings = { "{\"\\u0000\":null}", "{\"a\":\"x\\u0000y\"}", "{\"a\":{\"b\":[\"\\u0000\"]}}" })
	void settingsWithANulCharacterAre400NotACrash(String settings) {
		// Postgres jsonb cannot hold U+0000 anywhere, keys included.
		this.http.problem(put(player(), uniqueName(), "FR", settings, "2026-11-20T10:00:00Z"), 400);
	}

	@Test
	void theTextBackslashU0000IsFineOnlyTheCharacterIsNot() {
		// A player can name a theme with a literal backslash-u-0000; that is just text.
		String settings = "{\"theme\":\"odd \\\\u0000 name\"}";
		HttpResponse<String> response = put(player(), uniqueName(), "FR", settings, "2026-11-20T10:00:00Z");
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
	}

	@Test
	void settingsOver16KiBAre400() {
		String big = "{\"blob\":\"" + "x".repeat(16 * 1024) + "\"}";
		this.http.problem(put(player(), uniqueName(), "FR", big, "2026-11-20T10:00:00Z"), 400);
	}

	private String player() {
		return this.auth.signIn(AuthSteps.freshEmail()).get("access_token").asString();
	}

	/** A token signed with the service's own key, at a chosen time. */
	private String ourToken(Instant issuedAt) {
		JwtClaimsSet claims = JwtClaimsSet.builder()
			.issuer("royal-gambit")
			.subject(UUID.randomUUID().toString())
			.issuedAt(issuedAt)
			.expiresAt(issuedAt.plus(Duration.ofMinutes(15)))
			.claim("role", "user")
			.build();
		return this.encoder.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).build(), claims))
			.getTokenValue();
	}

	private HttpResponse<String> put(String token, String username, String country, String settings, String updatedAt) {
		String body = "{\"username\":\"%s\",\"country\":\"%s\",\"settings\":%s,\"updated_at\":\"%s\"}"
			.formatted(username, country, settings, updatedAt);
		return this.http.put("/v1/profile", body, token);
	}

	private java.util.List<String> events(String userId) {
		return this.jdbc.sql(
				"SELECT data::text FROM outbox WHERE type = 'profile.updated' AND data->>'user_id' = :id ORDER BY occurred_at")
			.param("id", userId)
			.query(String.class)
			.list();
	}

	private static String uniqueName() {
		return "p" + UUID.randomUUID().toString().replace("-", "").substring(0, 15);
	}

}
