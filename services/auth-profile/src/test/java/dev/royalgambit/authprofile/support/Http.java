package dev.royalgambit.authprofile.support;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A tiny client for the real HTTP stack. The tests go through the socket on purpose: the
 * security filter chain, the problem handler and the JSON settings all sit in front of
 * the controllers and are part of what we promise in the contract.
 */
public final class Http {

	private static final HttpClient CLIENT = HttpClient.newHttpClient();

	private final String base;

	private final ObjectMapper json;

	public Http(int port, ObjectMapper json) {
		this.base = "http://localhost:" + port;
		this.json = json;
	}

	public HttpResponse<String> get(String path) {
		return send("GET", path, null, null);
	}

	public HttpResponse<String> get(String path, String bearer) {
		return send("GET", path, null, bearer);
	}

	public HttpResponse<String> post(String path, String body) {
		return send("POST", path, body, null);
	}

	public HttpResponse<String> put(String path, String body, String bearer) {
		return send("PUT", path, body, bearer);
	}

	public HttpResponse<String> send(String method, String path, String body, String bearer) {
		HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(this.base + path))
			.method(method,
					(body != null) ? HttpRequest.BodyPublishers.ofString(body) : HttpRequest.BodyPublishers.noBody());
		if (body != null) {
			request.header("Content-Type", "application/json");
		}
		if (bearer != null) {
			request.header("Authorization", "Bearer " + bearer);
		}
		try {
			return CLIENT.send(request.build(), HttpResponse.BodyHandlers.ofString());
		}
		catch (IOException ex) {
			throw new IllegalStateException(method + " " + path + " failed", ex);
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException(method + " " + path + " interrupted", ex);
		}
	}

	public JsonNode body(HttpResponse<String> response) {
		return this.json.readTree(response.body());
	}

	/**
	 * Checks the shape every error must have and hands the body back for more asserts.
	 */
	public JsonNode problem(HttpResponse<String> response, int status) {
		assertThat(response.statusCode()).as(response.uri() + " -> " + response.body()).isEqualTo(status);
		assertThat(response.headers().firstValue("Content-Type"))
			.hasValueSatisfying((type) -> assertThat(type).startsWith("application/problem+json"));
		JsonNode problem = body(response);
		assertThat(problem.get("status").asInt()).isEqualTo(status);
		assertThat(problem.get("type").asString()).isNotBlank();
		assertThat(problem.get("trace_id").asString()).hasSize(32);
		return problem;
	}

}
