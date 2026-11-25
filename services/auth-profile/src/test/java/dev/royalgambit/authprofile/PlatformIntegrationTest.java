package dev.royalgambit.authprofile;

import java.net.http.HttpResponse;

import dev.royalgambit.authprofile.support.Http;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * What every service promises: health, metrics, and problem+json for anything that goes
 * wrong.
 */
@ServiceIntegrationTest
class PlatformIntegrationTest {

	@LocalServerPort
	int port;

	@Autowired
	ObjectMapper json;

	Http http;

	@BeforeEach
	void client() {
		this.http = new Http(this.port, this.json);
	}

	@Test
	void healthIsOpenAndReadyIncludesTheDatabase() {
		assertThat(this.http.get("/health/live").statusCode()).isEqualTo(200);
		HttpResponse<String> ready = this.http.get("/health/ready");
		assertThat(ready.statusCode()).isEqualTo(200);
		assertThat(this.http.body(ready).get("status").asString()).isEqualTo("UP");
	}

	@Test
	void metricsAreOpen() {
		this.http.get("/health/live");
		assertThat(this.http.get("/metrics").body()).contains("http_server_requests");
	}

	@Test
	void unknownRouteIsAProblemNotALoginPage() {
		// Deny by default: a route nobody declared asks for a token instead of leaking a
		// 404 map.
		this.http.problem(this.http.get("/v1/nowhere"), 401);
	}

	@Test
	void wrongMethodOnAnOpenRouteIsAProblem() {
		this.http.problem(this.http.send("DELETE", "/health/live", null, null), 405);
	}

}
