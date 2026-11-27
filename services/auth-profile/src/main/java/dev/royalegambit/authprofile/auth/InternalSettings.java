package dev.royalegambit.authprofile.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Service-to-service calls, bound from {@code auth.internal.*}.
 *
 * @param token the secret other services send in {@code X-Internal-Token}; empty closes
 * every /internal route
 */
@ConfigurationProperties("auth.internal")
public record InternalSettings(@DefaultValue("") String token) {

}
