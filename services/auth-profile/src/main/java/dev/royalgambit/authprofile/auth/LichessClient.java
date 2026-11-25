package dev.royalgambit.authprofile.auth;

import java.net.http.HttpClient;
import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * The two Lichess calls a sign-in needs: trade the code for a token, then ask whose token
 * it is. Lichess failures become {@link AuthProblem}s here, so callers only see "the code
 * was refused" or "Lichess is unavailable".
 */
@Component
class LichessClient {

	private static final Logger log = LoggerFactory.getLogger(LichessClient.class);

	/** The Lichess player behind a token. {@code id} is the lowercase, stable name. */
	record LichessAccount(String id, String username) {
	}

	/** Lichess tokens have no refresh; they simply last about a year. */
	record LichessToken(String accessToken, Instant expiresAt) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	private record TokenResponse(@JsonProperty("access_token") String accessToken,
			@JsonProperty("expires_in") long expiresIn) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	private record AccountResponse(@JsonProperty("id") String id, @JsonProperty("username") String username) {
	}

	private final RestClient http;

	private final LichessSettings settings;

	LichessClient(LichessSettings settings) {
		this.settings = settings;
		JdkClientHttpRequestFactory requests = new JdkClientHttpRequestFactory(
				HttpClient.newBuilder().connectTimeout(settings.timeout()).build());
		requests.setReadTimeout(settings.timeout());
		this.http = RestClient.builder().baseUrl(settings.baseUrl()).requestFactory(requests).build();
	}

	LichessToken exchange(String code, String verifier, String redirectUri) {
		MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
		form.add("grant_type", "authorization_code");
		form.add("code", code);
		form.add("code_verifier", verifier);
		form.add("redirect_uri", redirectUri);
		form.add("client_id", this.settings.clientId());
		TokenResponse token = call(() -> this.http.post()
			.uri("/api/token")
			.contentType(MediaType.APPLICATION_FORM_URLENCODED)
			.body(form)
			.retrieve()
			// A 4xx here means the code (or verifier) is wrong, not that
			// Lichess is down.
			.onStatus(HttpStatusCode::is4xxClientError, (request, response) -> {
				throw AuthProblem.lichessCodeInvalid();
			})
			.body(TokenResponse.class));
		if (token == null || token.accessToken() == null) {
			throw AuthProblem.lichessUnavailable();
		}
		return new LichessToken(token.accessToken(), Instant.now().plusSeconds(token.expiresIn()));
	}

	LichessAccount account(String accessToken) {
		AccountResponse account = call(() -> this.http.get()
			.uri("/api/account")
			.headers((headers) -> headers.setBearerAuth(accessToken))
			.retrieve()
			.body(AccountResponse.class));
		if (account == null || account.id() == null || account.id().isBlank()) {
			throw AuthProblem.lichessUnavailable();
		}
		return new LichessAccount(account.id(), account.username());
	}

	private interface LichessCall<T> {

		T run();

	}

	private static <T> T call(LichessCall<T> call) {
		try {
			return call.run();
		}
		catch (AuthProblem problem) {
			throw problem;
		}
		catch (RestClientException ex) {
			// Timeouts, refused connections, 5xx, unreadable bodies: all "try
			// later". Log the kind of failure only: a body could echo the token
			// back.
			log.warn("Lichess call failed: {}", (ex instanceof RestClientResponseException response)
					? "HTTP " + response.getStatusCode().value() : ex.getClass().getSimpleName());
			throw AuthProblem.lichessUnavailable();
		}
	}

}
