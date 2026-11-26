package dev.royalegambit.authprofile.auth;

import java.util.UUID;

/** What every successful sign-in or refresh returns (contract: TokenPair). */
public record TokenPair(String accessToken, String tokenType, long expiresIn, String refreshToken,
		long refreshExpiresIn, UUID userId, String role) {

}
