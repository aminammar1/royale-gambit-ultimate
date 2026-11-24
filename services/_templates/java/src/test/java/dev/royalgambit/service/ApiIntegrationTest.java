package dev.royalgambit.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.micrometer.metrics.test.autoconfigure.AutoConfigureMetrics;
import org.springframework.context.annotation.Import;

/** Real Postgres (Testcontainers), Flyway migrations, the full HTTP stack. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT, properties = "spring.flyway.enabled=true")
// Spring tests turn metric export off by default; the contract needs /metrics.
@AutoConfigureMetrics
class ApiIntegrationTest {

	private static final HttpClient HTTP = HttpClient.newHttpClient();

	@LocalServerPort
	int port;

	@Autowired
	ObjectMapper json;

	HttpResponse<String> call(String method, String path, String body) throws Exception {
		HttpRequest.Builder req = HttpRequest.newBuilder(URI.create("http://localhost:" + this.port + path))
			.method(method,
					body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
		if (body != null) {
			req.header("Content-Type", "application/json");
		}
		return HTTP.send(req.build(), HttpResponse.BodyHandlers.ofString());
	}

	@Test
	void healthAndMetrics() throws Exception {
		assertThat(call("GET", "/health/live", null).statusCode()).isEqualTo(200);
		HttpResponse<String> ready = call("GET", "/health/ready", null);
		assertThat(ready.statusCode()).isEqualTo(200);
		assertThat(this.json.readTree(ready.body()).get("status").asString()).isEqualTo("UP");
		call("GET", "/health/live", null);
		assertThat(call("GET", "/metrics", null).body()).contains("http_server_requests");
	}

	@Test
	void createAndGet() throws Exception {
		HttpResponse<String> created = call("POST", "/v1/items", "{\"name\":\"Opera Game\"}");
		assertThat(created.statusCode()).isEqualTo(201);
		JsonNode item = this.json.readTree(created.body());
		String id = item.get("id").asString();
		assertThat(id.charAt(14)).isEqualTo('7');
		assertThat(item.get("name").asString()).isEqualTo("Opera Game");
		assertThat(item.has("created_at")).isTrue();
		assertThat(created.headers().firstValue("Location")).hasValue("/v1/items/" + id);

		HttpResponse<String> got = call("GET", "/v1/items/" + id, null);
		assertThat(got.statusCode()).isEqualTo(200);
		assertThat(this.json.readTree(got.body())).isEqualTo(item);
	}

	@ParameterizedTest
	@CsvSource(delimiter = '|', nullValues = "null",
			value = { "GET    | /v1/items/0190f6a8-0000-7000-8000-000000000000 | null              | 404",
					"GET    | /v1/items/not-a-uuid                           | null              | 400",
					"POST   | /v1/items                                      | {\"name\":\"\"}   | 400",
					"POST   | /v1/items                                      | {\"nom\":\"x\"}   | 400",
					"POST   | /v1/items                                      | {\"name\":5}      | 400",
					"GET    | /v1/nowhere                                    | null              | 404",
					"DELETE | /v1/items                                      | null              | 405" })
	void problems(String method, String path, String body, int status) throws Exception {
		HttpResponse<String> r = call(method, path, body);
		assertThat(r.statusCode()).as(method + " " + path).isEqualTo(status);
		assertThat(r.headers().firstValue("Content-Type"))
			.hasValueSatisfying(ct -> assertThat(ct).startsWith("application/problem+json"));
		JsonNode p = this.json.readTree(r.body());
		assertThat(p.get("status").asInt()).isEqualTo(status);
		assertThat(p.get("type").asString()).isNotBlank();
		assertThat(p.get("trace_id").asString()).hasSize(32);
	}

}
