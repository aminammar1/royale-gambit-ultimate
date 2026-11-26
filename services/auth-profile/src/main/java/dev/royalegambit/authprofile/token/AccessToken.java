package dev.royalegambit.authprofile.token;

/**
 * A freshly signed access token.
 *
 * @param value the compact JWT
 * @param expiresIn lifetime in seconds
 */
public record AccessToken(String value, long expiresIn) {

}
