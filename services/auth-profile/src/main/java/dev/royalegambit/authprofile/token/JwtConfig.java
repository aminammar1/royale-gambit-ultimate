package dev.royalegambit.authprofile.token;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

/**
 * One key pair, two jobs: sign what we issue and verify what comes back to our own
 * endpoints. We verify with the in-memory public keys rather than our own JWKS URL, so
 * the service never calls itself.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(JwtSettings.class)
class JwtConfig {

	@Bean
	SigningKeys signingKeys(JwtSettings settings) {
		return new SigningKeys(settings);
	}

	@Bean
	JwtEncoder jwtEncoder(SigningKeys keys) {
		return new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(keys.active())));
	}

	/**
	 * Verifies with every key in the published set, picked by the token's kid, so tokens
	 * signed just before a key rotation keep working until they expire.
	 */
	@Bean
	JwtDecoder jwtDecoder(SigningKeys keys, JwtSettings settings) {
		DefaultJWTProcessor<SecurityContext> processor = new DefaultJWTProcessor<>();
		processor.setJWSKeySelector(
				new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, new ImmutableJWKSet<>(keys.publicSet())));
		// Claims (exp, iss) are checked by Spring's validators below, as with
		// any Spring resource server; Nimbus only checks the signature.
		processor.setJWTClaimsSetVerifier((claims, context) -> {
		});
		NimbusJwtDecoder decoder = new NimbusJwtDecoder(processor);
		decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(settings.issuer()));
		return decoder;
	}

}
