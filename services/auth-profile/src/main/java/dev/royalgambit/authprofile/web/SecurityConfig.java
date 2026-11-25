package dev.royalgambit.authprofile.web;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
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

	@Bean
	SecurityFilterChain api(HttpSecurity http,
			@Qualifier("handlerExceptionResolver") HandlerExceptionResolver resolver) {
		http.csrf((csrf) -> csrf.disable())
			.sessionManagement((session) -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.requestCache((cache) -> cache.disable())
			.authorizeHttpRequests(
					(requests) -> requests.requestMatchers(PUBLIC).permitAll().anyRequest().authenticated())
			// Hand 401 and 403 to ProblemHandler so they look like every other error,
			// trace_id included, instead of Spring Security's bare status codes.
			.exceptionHandling((errors) -> errors
				.authenticationEntryPoint(
						(request, response, ex) -> resolver.resolveException(request, response, null, ex))
				.accessDeniedHandler(
						(request, response, ex) -> resolver.resolveException(request, response, null, ex)));
		return http.build();
	}

}
