package dev.royalgambit.authprofile.token;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

/**
 * One key pair, two jobs: sign what we issue and verify what comes back to our own
 * endpoints. We verify with the in-memory public key rather than our own JWKS URL, so the
 * service never calls itself.
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

	@Bean
	JwtDecoder jwtDecoder(SigningKeys keys, JwtSettings settings) throws com.nimbusds.jose.JOSEException {
		NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey(keys.active().toRSAPublicKey())
			.signatureAlgorithm(SignatureAlgorithm.RS256)
			.build();
		decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(settings.issuer()));
		return decoder;
	}

}
