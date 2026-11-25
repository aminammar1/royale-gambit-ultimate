package dev.royalgambit.authprofile.events;

import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import tools.jackson.databind.ObjectMapper;

import dev.royalgambit.authprofile.common.UuidV7;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Records an event next to the change it describes. Call it inside the transaction that
 * makes the change: either both are saved or neither is, which is the whole point of an
 * outbox. Publishing happens later, in the relay.
 */
@Component
public class Outbox {

	/**
	 * Used when there is no trace (a scheduled job, say); the schema still wants 32 hex.
	 */
	private static final String NO_TRACE = "0".repeat(32);

	private final JdbcClient jdbc;

	private final ObjectMapper json;

	private final Tracer tracer;

	Outbox(JdbcClient jdbc, ObjectMapper json, Tracer tracer) {
		this.jdbc = jdbc;
		this.json = json;
		this.tracer = tracer;
	}

	@Transactional(propagation = Propagation.MANDATORY)
	public void append(String type, Object data) {
		this.jdbc.sql("INSERT INTO outbox (id, type, trace_id, data) VALUES (:id, :type, :trace, :data::jsonb)")
			.param("id", UuidV7.next())
			.param("type", type)
			.param("trace", currentTraceId())
			.param("data", this.json.writeValueAsString(data))
			.update();
	}

	private String currentTraceId() {
		Span span = this.tracer.currentSpan();
		return (span != null) ? span.context().traceId() : NO_TRACE;
	}

}
