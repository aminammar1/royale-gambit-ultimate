package dev.royalgambit.authprofile.web;

import java.util.List;

import org.springframework.boot.actuate.endpoint.web.EndpointMediaTypes;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Health answers in plain application/json, as the contract says. By default actuator
 * prefers its own vendor type (application/vnd.spring-boot.actuator.v3+json). /metrics
 * keeps the Prometheus text format, which it chooses by itself.
 */
@Configuration(proxyBeanMethods = false)
class ActuatorConfig {

	@Bean
	EndpointMediaTypes endpointMediaTypes() {
		return new EndpointMediaTypes(List.of("application/json"), List.of("application/json"));
	}

}
