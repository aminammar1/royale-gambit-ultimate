package dev.royalgambit.authprofile.token;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.time.Duration;
import java.util.Base64;

import com.nimbusds.jose.jwk.RSAKey;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

class SigningKeysTest {

	@Test
	void loadsAPkcs8PemAndNamesItByThumbprint() throws Exception {
		KeyPair pair = rsa();
		SigningKeys keys = new SigningKeys(settings(pem(pair), false));

		RSAKey expected = new RSAKey.Builder((RSAPublicKey) pair.getPublic()).build();
		assertThat(keys.active().getKeyID()).isEqualTo(expected.computeThumbprint().toString());
		assertThat(keys.active().toRSAPublicKey()).isEqualTo(pair.getPublic());
	}

	@Test
	void publishedSetHoldsNoPrivatePart() throws Exception {
		SigningKeys keys = new SigningKeys(settings(pem(rsa()), false));
		String published = keys.publicSet().toString();
		assertThat(published).doesNotContain("\"d\"").contains("\"kid\"").contains("RS256").contains("\"use\":\"sig\"");
	}

	@Test
	void ephemeralKeyOnlyWhenAskedFor() {
		assertThat(new SigningKeys(settings("", true)).active().isPrivate()).isTrue();
		assertThatIllegalStateException().isThrownBy(() -> new SigningKeys(settings("", false)))
			.withMessageContaining("JWT_PRIVATE_KEY");
	}

	@Test
	void garbageKeyFailsAtStartNotAtFirstSignIn() {
		assertThatIllegalStateException().isThrownBy(
				() -> new SigningKeys(settings("-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----", false)));
	}

	private static JwtSettings settings(String privateKey, boolean ephemeral) {
		return new JwtSettings(privateKey, ephemeral, "royal-gambit", Duration.ofMinutes(15), Duration.ofDays(30));
	}

	private static KeyPair rsa() throws Exception {
		KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
		generator.initialize(2048);
		return generator.generateKeyPair();
	}

	private static String pem(KeyPair pair) {
		String body = Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(pair.getPrivate().getEncoded());
		return "-----BEGIN PRIVATE KEY-----\n" + body + "\n-----END PRIVATE KEY-----\n";
	}

}
