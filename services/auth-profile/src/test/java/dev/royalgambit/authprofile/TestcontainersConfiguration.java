package dev.royalgambit.authprofile;

import dev.royalgambit.authprofile.support.FakeLichess;
import dev.royalgambit.authprofile.support.MailpitContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.rabbitmq.RabbitMQContainer;
import org.testcontainers.utility.DockerImageName;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.DynamicPropertyRegistrar;

/** The real backing services, same images as the compose stack, plus a fake Lichess. */
@TestConfiguration(proxyBeanMethods = false)
class TestcontainersConfiguration {

	@Bean
	@ServiceConnection
	PostgreSQLContainer postgresContainer() {
		return new PostgreSQLContainer(DockerImageName.parse("postgres:19.0-trixie"));
	}

	@Bean
	@ServiceConnection
	RabbitMQContainer rabbitContainer() {
		return new RabbitMQContainer(DockerImageName.parse("rabbitmq:4.4.1-management-alpine"));
	}

	@Bean
	MailpitContainer mailpitContainer() {
		return new MailpitContainer();
	}

	@Bean(destroyMethod = "close")
	FakeLichess fakeLichess() {
		return new FakeLichess();
	}

	@Bean
	DynamicPropertyRegistrar lichessProperties(FakeLichess lichess) {
		return (registry) -> registry.add("auth.lichess.base-url", lichess::baseUrl);
	}

	@Bean
	DynamicPropertyRegistrar mailProperties(MailpitContainer mailpit) {
		return (registry) -> {
			registry.add("spring.mail.host", mailpit::getHost);
			registry.add("spring.mail.port", mailpit::smtpPort);
		};
	}

}
