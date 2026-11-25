package dev.royalgambit.authprofile.common;

import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SecretsTest {

	@Test
	void opaqueTokensAre256BitsOfUrlSafeText() {
		String token = Secrets.opaqueToken();
		// 32 bytes in unpadded base64url is 43 characters.
		assertThat(token).hasSize(43).matches("[A-Za-z0-9_-]+");
	}

	@Test
	void opaqueTokensDoNotRepeat() {
		Set<String> seen = new HashSet<>();
		for (int i = 0; i < 1000; i++) {
			assertThat(seen.add(Secrets.opaqueToken())).isTrue();
		}
	}

	@Test
	void signInCodesAreSixDigitsWithLeadingZerosKept() {
		for (int i = 0; i < 1000; i++) {
			assertThat(Secrets.signInCode()).matches("\\d{6}");
		}
	}

	@Test
	void sha256IsStableAndSensitiveToEveryPart() {
		assertThat(Secrets.sha256("a", "bc")).isEqualTo(Secrets.sha256("a", "bc")).hasSize(32);
		// Parts are length-prefixed, so moving a boundary changes the hash.
		assertThat(Secrets.sha256("a", "bc")).isNotEqualTo(Secrets.sha256("ab", "c"));
	}

	@Test
	void sameHashComparesInConstantTimeHelper() {
		byte[] hash = Secrets.sha256("x");
		assertThat(Secrets.sameHash(hash, Secrets.sha256("x"))).isTrue();
		assertThat(Secrets.sameHash(hash, Secrets.sha256("y"))).isFalse();
	}

}
