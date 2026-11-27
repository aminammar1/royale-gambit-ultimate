package dev.royalegambit.authprofile.web;

import java.util.List;

import dev.royalegambit.authprofile.token.Role;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.firewall.HttpFirewall;
import org.springframework.security.web.firewall.RequestRejectedHandler;
import org.springframework.security.web.firewall.StrictHttpFirewall;
import org.springframework.web.servlet.HandlerExceptionResolver;

/**
 * A stateless JSON API: no sessions, no cookies (so no CSRF to defend), no login page.
 * Anything not listed as public needs a bearer token, so a route added later is closed
 * until someone decides otherwise.
 */
@Configuration(proxyBeanMethods = false)
class SecurityConfig {

	private static final String[] PUBLIC = { "/health/**", "/metrics", "/.well-known/jwks.json", "/v1/auth/**",
			"/error" };

	/**
	 * The default firewall answers unknown HTTP methods (QUERY, for one) with a bare 400.
	 * Letting QUERY through means Spring MVC replies with a proper 405 problem instead.
	 */
	@Bean
	HttpFirewall firewall() {
		StrictHttpFirewall firewall = new StrictHttpFirewall();
		firewall.setAllowedHttpMethods(List.of("DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT", "QUERY"));
		return firewall;
	}

	/**
	 * Whatever the firewall still refuses leaves as problem+json, like every other error.
	 */
	@Bean
	RequestRejectedHandler requestRejected(@Qualifier("handlerExceptionResolver") HandlerExceptionResolver resolver) {
		return (request, response, ex) -> resolver.resolveException(request, response, null, ex);
	}

	@Bean
	SecurityFilterChain api(HttpSecurity http,
			@Qualifier("handlerExceptionResolver") HandlerExceptionResolver resolver) {
		// Hand 401 and 403 to ProblemHandler so they look like every other
		// error, trace_id included, instead of Spring Security's bare status
		// codes.
		AuthenticationEntryPoint unauthenticated = (request, response, ex) -> resolver.resolveException(request,
				response, null, ex);
		AccessDeniedHandler denied = (request, response, ex) -> resolver.resolveException(request, response, null, ex);

		http.csrf((csrf) -> csrf.disable())
			.sessionManagement((session) -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.requestCache((cache) -> cache.disable())
			.authorizeHttpRequests((requests) -> requests
				// Before the public /v1/auth/** rule: changing identities needs
				// a signed-in user.
				.requestMatchers("/v1/auth/identities/**")
				.hasRole(Role.USER.name())
				.requestMatchers(PUBLIC)
				.permitAll()
				// Other services, with their shared secret, checked by
				// InternalController;
				// the gateway never routes /internal.
				.requestMatchers("/internal/**")
				.permitAll()
				// Guests keep their profile on the device (ADR-15).
				.requestMatchers("/v1/profile")
				.hasRole(Role.USER.name())
				.anyRequest()
				.authenticated())
			// Our own tokens, checked with the JwtDecoder from JwtConfig
			// (in-memory public key).
			.oauth2ResourceServer((server) -> server.authenticationEntryPoint(unauthenticated)
				.accessDeniedHandler(denied)
				.jwt((jwt) -> jwt.jwtAuthenticationConverter(roleFromClaim())))
			.exceptionHandling(
					(errors) -> errors.authenticationEntryPoint(unauthenticated).accessDeniedHandler(denied));
		return http.build();
	}

	/**
	 * The {@code role} claim becomes the one authority we authorize on: ROLE_USER or
	 * ROLE_GUEST.
	 */
	private static JwtAuthenticationConverter roleFromClaim() {
		JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
		converter.setJwtGrantedAuthoritiesConverter((jwt) -> {
			String role = jwt.getClaimAsString("role");
			if (role == null) {
				return List.of();
			}
			try {
				return List.of(new SimpleGrantedAuthority("ROLE_" + Role.fromClaim(role).name()));
			}
			catch (IllegalArgumentException unknownRole) {
				return List.of();
			}
		});
		return converter;
	}

}
