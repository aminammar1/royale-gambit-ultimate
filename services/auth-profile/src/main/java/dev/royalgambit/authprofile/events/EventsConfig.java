package dev.royalgambit.authprofile.events;

import org.springframework.amqp.core.TopicExchange;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * The shared event exchange. Compose already creates it from definitions.json; declaring
 * it here too (same settings, so a no-op) means a fresh broker works without that file.
 */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
class EventsConfig {

	@Bean
	TopicExchange events(@Value("${auth.events.exchange}") String name) {
		return new TopicExchange(name, true, false);
	}

}
