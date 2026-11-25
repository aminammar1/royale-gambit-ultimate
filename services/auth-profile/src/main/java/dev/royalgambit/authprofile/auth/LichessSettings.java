package dev.royalgambit.authprofile.auth;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Lichess OAuth, bound from {@code auth.lichess.*}. Lichess needs no app registration for
 * PKCE: the client id is just a name it shows the player.
 *
 * @param baseUrl lichess.org, or a fake in tests
 * @param clientId the name Lichess shows on its consent page
 * @param scope space-separated scopes; none are needed to identify the player
 * @param flowTtl how long a started sign-in may take
 * @param timeout connect and read timeout for calls to Lichess
 */
@ConfigurationProperties("auth.lichess")
public record LichessSettings(@DefaultValue("https://lichess.org") String baseUrl,
		@DefaultValue("royal-gambit") String clientId, @DefaultValue("") String scope,
		@DefaultValue("10m") Duration flowTtl, @DefaultValue("5s") Duration timeout) {

}
