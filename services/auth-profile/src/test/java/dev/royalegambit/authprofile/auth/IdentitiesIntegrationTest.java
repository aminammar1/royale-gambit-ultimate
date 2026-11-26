package dev.royalegambit.authprofile.auth;

import java.net.http.HttpResponse;
import java.time.Instant;

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
 * What the Settings credential cards read, and email linking: the way a Lichess player
 * adds a second way in before unlinking Lichess.
 */
@ServiceIntegrationTest
class IdentitiesIntegrationTest {

	private static final String PROBLEMS = "https://royale-gambit.dev/problems/";

	@LocalServerPort
	int port;

	@Autowired
	ObjectMapper json;

	@Autowired
	MailpitContainer mailpit;

	@Autowired
	FakeLichess fakeLichess;

	Http http;

	AuthSteps auth;

	LichessSteps lichess;

	@BeforeEach
	void setUp() {
		this.http = new Http(this.port, this.json);
		this.auth = new AuthSteps(this.http, new Mailbox(this.mailpit, this.json));
		this.lichess = new LichessSteps(this.http, this.fakeLichess);
	}

	@Test
	void anEmailAccountListsItsAddress() {
		String email = AuthSteps.freshEmail();
		String token = this.auth.signIn(email).get("access_token").asString();

		JsonNode identities = identities(token);
		assertThat(identities).hasSize(1);
		assertThat(identities.get(0).get("provider").asString()).isEqualTo("email");
		assertThat(identities.get(0).get("label").asString()).isEqualTo(email);
		assertThat(Instant.parse(identities.get(0).get("linked_at").asString())).isBefore(Instant.now().plusSeconds(1));
	}

	@Test
	void aLinkedLichessShowsItsUsernameAfterTheEmail() {
		String token = this.auth.signIn(AuthSteps.freshEmail()).get("access_token").asString();
		String name = LichessSteps.freshName();
		assertThat(this.lichess.signIn(name, token).statusCode()).isEqualTo(200);

		JsonNode identities = identities(token);
		assertThat(identities).hasSize(2);
		assertThat(identities.get(0).get("provider").asString()).isEqualTo("email");
		assertThat(identities.get(1).get("provider").asString()).isEqualTo("lichess");
		assertThat(identities.get(1).get("label").asString()).isEqualTo(name);
	}

	@Test
	void theLabelFollowsARenamedLichessUser() {
		String name = LichessSteps.freshName();
		this.lichess.signIn(name);
		// Lichess lets players change the case of their name; the id stays.
		String token = this.lichess.signIn(name.toUpperCase()).get("access_token").asString();

		assertThat(identities(token).get(0).get("label").asString()).isEqualTo(name.toUpperCase());
	}

	@Test
	void anUnlinkedLichessLeavesTheList() {
		String token = this.auth.signIn(AuthSteps.freshEmail()).get("access_token").asString();
		this.lichess.signIn(LichessSteps.freshName(), token);
		assertThat(this.lichess.unlink(token).statusCode()).isEqualTo(204);

		JsonNode identities = identities(token);
		assertThat(identities).hasSize(1);
		assertThat(identities.get(0).get("provider").asString()).isEqualTo("email");
	}

	@Test
	void guestsHaveNoIdentitiesToList() {
		this.http.problem(this.http.get("/v1/auth/identities", this.auth.guest().get("access_token").asString()), 403);
		this.http.problem(this.http.get("/v1/auth/identities"), 401);
	}

	@Test
	void anEmailLinkedToALichessAccountFreesLichessToBeUnlinked() {
		JsonNode lichessUser = this.lichess.signIn(LichessSteps.freshName());
		String token = lichessUser.get("access_token").asString();
		String email = AuthSteps.freshEmail();

		HttpResponse<String> linked = this.auth.linkEmail(email, token);
		assertThat(linked.statusCode()).as(linked.body()).isEqualTo(200);
		assertThat(this.http.body(linked).get("user_id")).isEqualTo(lichessUser.get("user_id"));
		assertThat(identities(token)).hasSize(2);

		assertThat(this.lichess.unlink(token).statusCode()).isEqualTo(204);
		assertThat(this.auth.signIn(email).get("user_id")).isEqualTo(lichessUser.get("user_id"));
	}

	@Test
	void anAddressOfAnotherAccountCannotBeLinked() {
		String email = AuthSteps.freshEmail();
		this.auth.signIn(email);
		String other = this.lichess.signIn(LichessSteps.freshName()).get("access_token").asString();

		assertThat(type(this.auth.linkEmail(email, other), 409)).isEqualTo(PROBLEMS + "identity-taken");
	}

	@Test
	void anAccountHoldsOneAddressAtATime() {
		String token = this.auth.signIn(AuthSteps.freshEmail()).get("access_token").asString();

		assertThat(type(this.auth.linkEmail(AuthSteps.freshEmail(), token), 409))
			.isEqualTo(PROBLEMS + "identity-taken");
	}

	@Test
	void linkingTheAddressTheAccountAlreadyHasJustSignsIn() {
		String email = AuthSteps.freshEmail();
		JsonNode user = this.auth.signIn(email);

		HttpResponse<String> again = this.auth.linkEmail(email, user.get("access_token").asString());
		assertThat(again.statusCode()).as(again.body()).isEqualTo(200);
		assertThat(this.http.body(again).get("user_id")).isEqualTo(user.get("user_id"));
	}

	@Test
	void aGuestTokenOnVerifyStillSignsIntoTheAddressAccount() {
		JsonNode guest = this.auth.guest();
		HttpResponse<String> signedIn = this.auth.linkEmail(AuthSteps.freshEmail(),
				guest.get("access_token").asString());

		assertThat(signedIn.statusCode()).as(signedIn.body()).isEqualTo(200);
		JsonNode pair = this.http.body(signedIn);
		assertThat(pair.get("role").asString()).isEqualTo("user");
		assertThat(pair.get("user_id")).isNotEqualTo(guest.get("user_id"));
	}

	private JsonNode identities(String bearer) {
		HttpResponse<String> response = this.http.get("/v1/auth/identities", bearer);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return this.http.body(response);
	}

	private String type(HttpResponse<String> response, int status) {
		return this.http.problem(response, status).get("type").asString();
	}

}
