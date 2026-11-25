package dev.royalgambit.authprofile.support;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.StreamSupport;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Reads what the service really sent, through Mailpit's API. */
public final class Mailbox {

	private static final Pattern CODE = Pattern.compile("\\b(\\d{6})\\b");

	private static final HttpClient CLIENT = HttpClient.newHttpClient();

	private final MailpitContainer mailpit;

	private final ObjectMapper json;

	public Mailbox(MailpitContainer mailpit, ObjectMapper json) {
		this.mailpit = mailpit;
		this.json = json;
	}

	/** Subjects of the mails sent to this address, newest first. */
	public List<String> subjectsFor(String address) {
		JsonNode messages = this.json.readTree(fetch("/api/v1/messages?limit=500")).get("messages");
		return StreamSupport.stream(messages.spliterator(), false)
			.filter((message) -> StreamSupport.stream(message.get("To").spliterator(), false)
				.anyMatch((to) -> to.get("Address").asString().equalsIgnoreCase(address)))
			.map((message) -> message.get("Subject").asString())
			.toList();
	}

	/** The code from the newest mail to this address. */
	public String latestCode(String address) {
		List<String> subjects = subjectsFor(address);
		if (subjects.isEmpty()) {
			throw new AssertionError("no mail for " + address);
		}
		Matcher matcher = CODE.matcher(subjects.getFirst());
		if (!matcher.find()) {
			throw new AssertionError("no code in subject: " + subjects.getFirst());
		}
		return matcher.group(1);
	}

	private String fetch(String path) {
		HttpRequest request = HttpRequest.newBuilder(URI.create(this.mailpit.apiUrl() + path)).build();
		try {
			return CLIENT.send(request, HttpResponse.BodyHandlers.ofString()).body();
		}
		catch (Exception ex) {
			throw new IllegalStateException("Mailpit API call failed: " + path, ex);
		}
	}

}
