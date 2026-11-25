package dev.royalgambit.authprofile;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.boot.micrometer.metrics.test.autoconfigure.AutoConfigureMetrics;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.context.annotation.Import;

/**
 * The whole service on a random port against real containers. Every integration test uses
 * the same settings so Spring can reuse one context (and one set of containers) for all.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
		properties = { "spring.flyway.enabled=true", "auth.jwt.ephemeral-key=true" })
// Spring tests turn metric export off by default; the contract needs /metrics.
@AutoConfigureMetrics
public @interface ServiceIntegrationTest {

}
