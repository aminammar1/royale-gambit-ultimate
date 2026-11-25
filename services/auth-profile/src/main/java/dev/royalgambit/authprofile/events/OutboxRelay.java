package dev.royalgambit.authprofile.events;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import org.springframework.amqp.AmqpException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Moves outbox rows to RabbitMQ. Delivery is at least once: a row is marked published
 * only after the broker confirmed it, so a crash in between sends it again and consumers
 * dedupe on the envelope id. Several replicas can run this side by side; SKIP LOCKED
 * gives each its own rows.
 */
@Component
public class OutboxRelay {

	private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);

	private static final int BATCH = 100;

	private static final long CONFIRM_TIMEOUT_MS = 5_000;

	private record Pending(UUID id, String type, String traceId, String data, OffsetDateTime occurredAt) {
	}

	private final JdbcClient jdbc;

	private final RabbitTemplate rabbit;

	private final TransactionTemplate transaction;

	private final ObjectMapper json;

	private final String exchange;

	OutboxRelay(JdbcClient jdbc, RabbitTemplate rabbit, TransactionTemplate transaction, ObjectMapper json,
			@Value("${auth.events.exchange}") String exchange) {
		this.jdbc = jdbc;
		this.rabbit = rabbit;
		this.transaction = transaction;
		this.json = json;
		this.exchange = exchange;
	}

	@Scheduled(initialDelayString = "${auth.outbox.poll}", fixedDelayString = "${auth.outbox.poll}")
	public void publishPending() {
		int sent;
		do {
			Integer batch = this.transaction.execute((status) -> publishBatch());
			sent = (batch != null) ? batch : 0;
		}
		while (sent == BATCH);
	}

	/**
	 * @return how many rows went out; fewer than asked means stop for now
	 */
	private int publishBatch() {
		List<Pending> rows = this.jdbc.sql("""
				SELECT id, type, trace_id, data::text AS data, occurred_at FROM outbox
				WHERE published_at IS NULL
				ORDER BY occurred_at
				LIMIT :limit
				FOR UPDATE SKIP LOCKED
				""")
			.param("limit", BATCH)
			.query((rs, n) -> new Pending(rs.getObject("id", UUID.class), rs.getString("type"),
					rs.getString("trace_id"), rs.getString("data"), rs.getObject("occurred_at", OffsetDateTime.class)))
			.list();
		List<UUID> published = new ArrayList<>();
		for (Pending row : rows) {
			try {
				send(row);
				published.add(row.id());
			}
			catch (AmqpException ex) {
				// Keep the order: stop here and let the next run retry from
				// this row. No stack trace: while the broker is down this
				// repeats every poll.
				log.warn("event {} not published yet, will retry: {}", row.id(), ex.getMessage());
				break;
			}
		}
		if (!published.isEmpty()) {
			this.jdbc.sql("UPDATE outbox SET published_at = now() WHERE id IN (:ids)").param("ids", published).update();
		}
		return (published.size() == rows.size()) ? rows.size() : 0;
	}

	private void send(Pending row) {
		Message message = MessageBuilder.withBody(this.json.writeValueAsBytes(envelope(row)))
			.setContentType(MessageProperties.CONTENT_TYPE_JSON)
			.setMessageId(row.id().toString())
			.build();
		this.rabbit.invoke((operations) -> {
			operations.send(this.exchange, row.type(), message);
			operations.waitForConfirmsOrDie(CONFIRM_TIMEOUT_MS);
			return null;
		});
	}

	/** contracts/events/envelope.schema.json; the routing key is the type. */
	private ObjectNode envelope(Pending row) {
		ObjectNode envelope = this.json.createObjectNode();
		envelope.put("id", row.id().toString());
		envelope.put("type", row.type());
		envelope.put("occurred_at", row.occurredAt().toInstant().toString());
		envelope.put("trace_id", row.traceId());
		envelope.set("data", this.json.readTree(row.data()));
		return envelope;
	}

}
