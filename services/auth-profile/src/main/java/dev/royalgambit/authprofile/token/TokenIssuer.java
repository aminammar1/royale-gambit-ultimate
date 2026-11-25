package dev.royalgambit.authprofile.token;

import java.time.Instant;
import java.util.UUID;

import dev.royalgambit.authprofile.common.UuidV7;

import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Component;

/**
 * Signs access tokens. The claims are the contract with the gateway and every service.
 */
@Component
public class TokenIssuer {

	private final JwtEncoder encoder;

	private final JwtSettings settings;

	private final String keyId;

	TokenIssuer(JwtEncoder encoder, JwtSettings settings, SigningKeys keys) {
		this.encoder = encoder;
		this.settings = settings;
		this.keyId = keys.active().getKeyID();
	}

	public AccessToken issue(UUID userId, Role role) {
		Instant now = Instant.now();
		JwtClaimsSet claims = JwtClaimsSet.builder()
			.issuer(this.settings.issuer())
			.subject(userId.toString())
			.issuedAt(now)
			.expiresAt(now.plus(this.settings.accessTtl()))
			.id(UuidV7.next().toString())
			.claim("role", role.claim())
			.claim("scope", role.scope())
			.build();
		// Name the key in the header so verifiers can pick it out of the JWKS during a
		// rotation.
		JwsHeader header = JwsHeader.with(SignatureAlgorithm.RS256).keyId(this.keyId).build();
		String token = this.encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
		return new AccessToken(token, this.settings.accessTtl().toSeconds());
	}

}
