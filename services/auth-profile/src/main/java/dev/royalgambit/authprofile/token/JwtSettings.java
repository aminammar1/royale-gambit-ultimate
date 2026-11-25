package dev.royalgambit.authprofile.token;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Token settings, bound from {@code auth.jwt.*} (env: JWT_PRIVATE_KEY, JWT_EPHEMERAL_KEY,
 * JWT_ISSUER).
 *
 * @param privateKey RSA private key, PKCS#8 PEM; empty only when {@code ephemeralKey}
 * @param ephemeralKey generate a throwaway key at start-up (local dev and tests only)
 * @param issuer the {@code iss} claim
 * @param accessTtl access token lifetime
 * @param refreshTtl refresh token lifetime
 */
@ConfigurationProperties("auth.jwt")
public record JwtSettings(@DefaultValue("") String privateKey, @DefaultValue("false") boolean ephemeralKey,
		@DefaultValue("royal-gambit") String issuer, @DefaultValue("15m") Duration accessTtl,
		@DefaultValue("30d") Duration refreshTtl) {

}
