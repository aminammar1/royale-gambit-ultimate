package dev.royalgambit.authprofile.events;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import dev.royalgambit.authprofile.ServiceIntegrationTest;
import dev.royalgambit.authprofile.support.AuthSteps;
import dev.royalgambit.authprofile.support.Http;
import dev.royalgambit.authprofile.support.Mailbox;
import dev.royalgambit.authprofile.support.MailpitContainer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import org.springframework.amqp.core.AnonymousQueue;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;

@ServiceIntegrationTest
class OutboxRelayIntegrationTest {

	@LocalServerPort
	int port;

	@Autowired
	ObjectMapper json;

	@Autowired
	MailpitContainer mailpit;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	RabbitTemplate rabbit;

	@Autowired
	RabbitAdmin admin;

	@Autowired
	TopicExchange events;

	@Autowired
	OutboxRelay relay;

	@Autowired
	TransactionTemplate transaction;

	AuthSteps auth;

	/** A private queue that hears every event, like a consumer service would. */
	Queue listener;

	@BeforeEach
	void setUp() {
		this.auth = new AuthSteps(new Http(this.port, this.json), new Mailbox(this.mailpit, this.json));
		this.listener = new AnonymousQueue();
		this.admin.declareQueue(this.listener);
		this.admin.declareBinding(BindingBuilder.bind(this.listener).to(this.events).with("#"));
	}

	@Test
	void userRegisteredLeavesInTheContractEnvelope() {
		String userId = this.auth.signIn(AuthSteps.freshEmail()).get("user_id").asString();
		this.relay.publishPending();

		Message message = receiveFor(userId);
		assertThat(message.getMessageProperties().getReceivedRoutingKey()).isEqualTo("user.registered");
		assertThat(message.getMessageProperties().getContentType()).isEqualTo("application/json");

		JsonNode envelope = this.json.readTree(message.getBody());
		assertThat(envelope.propertyNames()).containsExactlyInAnyOrder("id", "type", "occurred_at", "trace_id", "data");
		assertThat(UUID.fromString(envelope.get("id").asString()).version()).isEqualTo(7);
		assertThat(message.getMessageProperties().getMessageId()).isEqualTo(envelope.get("id").asString());
		assertThat(envelope.get("type").asString()).isEqualTo("user.registered");
		assertThat(envelope.get("trace_id").asString()).matches("[0-9a-f]{32}");
		assertThat(Instant.parse(envelope.get("occurred_at").asString())).isBefore(Instant.now().plusSeconds(1));
		assertThat(envelope.get("data").propertyNames()).containsExactlyInAnyOrder("user_id", "registered_at");
	}

	@Test
	void occurredAtIsRfc3339EvenOnAWholeMinute() {
		String userId = UUID.randomUUID().toString();
		this.jdbc.sql("""
				INSERT INTO outbox (id, type, trace_id, data, occurred_at)
				VALUES (:id, 'user.registered', :trace, :data::jsonb, '2026-01-01T10:00:00Z')
				""")
			.param("id", UUID.randomUUID())
			.param("trace", "0".repeat(32))
			.param("data", "{\"user_id\":\"" + userId + "\",\"registered_at\":\"2026-01-01T10:00:00Z\"}")
			.update();
		this.relay.publishPending();

		JsonNode envelope = this.json.readTree(receiveFor(userId).getBody());
		// OffsetDateTime.toString() would say "2026-01-01T10:00Z", which is not
		// RFC 3339.
		assertThat(envelope.get("occurred_at").asString()).isEqualTo("2026-01-01T10:00:00Z");
	}

	@Test
	void eventsWaitWhileTheBrokerIsDownAndLeaveOnceItIsBack() {
		String userId = this.auth.signIn(AuthSteps.freshEmail()).get("user_id").asString();
		CachingConnectionFactory nowhere = new CachingConnectionFactory("localhost", 1);
		try {
			OutboxRelay cutOff = new OutboxRelay(this.jdbc, new RabbitTemplate(nowhere), this.transaction, this.json,
					this.events.getName());
			cutOff.publishPending();
		}
		finally {
			nowhere.destroy();
		}
		assertThat(pending(userId)).isEqualTo(1);

		this.relay.publishPending();
		assertThat(pending(userId)).isZero();
		assertThat(receiveFor(userId)).isNotNull();
	}

	private int pending(String userId) {
		return this.jdbc.sql("SELECT count(*) FROM outbox WHERE published_at IS NULL AND data->>'user_id' = :id")
			.param("id", userId)
			.query(Integer.class)
			.single();
	}

	/**
	 * Other tests publish into the same exchange; pick out the message about this user.
	 */
	private Message receiveFor(String userId) {
		Instant deadline = Instant.now().plus(Duration.ofSeconds(10));
		while (Instant.now().isBefore(deadline)) {
			Message message = this.rabbit.receive(this.listener.getName(), 1000);
			if (message != null
					&& this.json.readTree(message.getBody()).get("data").get("user_id").asString().equals(userId)) {
				return message;
			}
		}
		throw new AssertionError("no event for user " + userId);
	}

}
