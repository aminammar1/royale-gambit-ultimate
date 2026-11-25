package dev.royalgambit.authprofile.support;

import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.DockerImageName;

/** The same Mailpit the compose stack runs: SMTP on 1025, its HTTP API on 8025. */
public class MailpitContainer extends GenericContainer<MailpitContainer> {

	private static final int SMTP = 1025;

	private static final int API = 8025;

	public MailpitContainer() {
		super(DockerImageName.parse("axllent/mailpit:v1.34.0"));
		withExposedPorts(SMTP, API);
		waitingFor(Wait.forHttp("/readyz").forPort(API));
	}

	public int smtpPort() {
		return getMappedPort(SMTP);
	}

	public String apiUrl() {
		return "http://" + getHost() + ":" + getMappedPort(API);
	}

}
