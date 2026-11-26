package dev.royalegambit.authprofile.token;

import java.net.http.HttpResponse;

import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import dev.royalegambit.authprofile.ServiceIntegrationTest;
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

import static org.assertj.core.api.Assertions.assertThat;

/** What the gateway does with our tokens: fetch the JWKS, verify, read the claims. */
@ServiceIntegrationTest
class JwksIntegrationTest {

	@LocalServerPort
	int port;

	@Autowired
	ObjectMapper json;

	@Autowired
	MailpitContainer mailpit;

	Http http;

	AuthSteps auth;

	@BeforeEach
	void setUp() {
		this.http = new Http(this.port, this.json);
		this.auth = new AuthSteps(this.http, new Mailbox(this.mailpit, this.json));
	}

	@Test
	void anIssuedTokenVerifiesAgainstThePublishedKeys() throws Exception {
		JsonNode guest = this.auth.guest();
		HttpResponse<String> jwks = this.http.get("/.well-known/jwks.json");
		assertThat(jwks.statusCode()).isEqualTo(200);
		assertThat(jwks.body()).doesNotContain("\"d\"");

		SignedJWT token = SignedJWT.parse(guest.get("access_token").asString());
		RSAKey key = JWKSet.parse(jwks.body()).getKeyByKeyId(token.getHeader().getKeyID()).toRSAKey();
		assertThat(token.verify(new RSASSAVerifier(key))).isTrue();
		assertThat(token.getHeader().getAlgorithm().getName()).isEqualTo("RS256");

		JWTClaimsSet claims = token.getJWTClaimsSet();
		assertThat(claims.getSubject()).isEqualTo(guest.get("user_id").asString());
		assertThat(claims.getStringClaim("role")).isEqualTo("guest");
		assertThat(claims.getStringClaim("scope")).isEqualTo("play");
		assertThat(claims.getIssuer()).isEqualTo("royale-gambit");
		assertThat(claims.getJWTID()).isNotBlank();
		long lifetime = claims.getExpirationTime().getTime() - claims.getIssueTime().getTime();
		assertThat(lifetime).isEqualTo(900_000);
	}

}
