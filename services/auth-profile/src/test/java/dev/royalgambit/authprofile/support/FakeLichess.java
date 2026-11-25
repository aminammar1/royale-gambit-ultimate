package dev.royalgambit.authprofile.support;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * A stand-in for lichess.org's OAuth endpoints, strict where the real one is strict: the
 * code works once, the verifier must hash to the challenge from the authorize URL, and
 * client_id and redirect_uri must match. Tests play the player's browser by calling
 * {@link #approve}.
 */
public final class FakeLichess implements AutoCloseable {

	/** What Lichess remembers about a code it handed out. */
	private record Grant(String challenge, String redirectUri, String clientId, String userId, String username) {
	}

	private final HttpServer server;

	private final Map<String, Grant> grants = new ConcurrentHashMap<>();

	private final Map<String, String[]> tokens = new ConcurrentHashMap<>();

	private volatile int forcedStatus;

	public FakeLichess() {
		try {
			this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		}
		catch (IOException ex) {
			throw new IllegalStateException("cannot start the fake Lichess", ex);
		}
		this.server.createContext("/api/token", this::token);
		this.server.createContext("/api/account", this::account);
		this.server.start();
	}

	public String baseUrl() {
		return "http://127.0.0.1:" + this.server.getAddress().getPort();
	}

	/** Every call answers with this status until {@link #behave()}; 0 means normal. */
	public void failWith(int status) {
		this.forcedStatus = status;
	}

	public void behave() {
		this.forcedStatus = 0;
	}

	/**
	 * The player clicks "Authorize" on the page at {@code authorizeUrl} as Lichess user
	 * {@code username}. Returns the code Lichess would put on the redirect.
	 */
	public String approve(String authorizeUrl, String username) {
		Map<String, String> query = parse(URI.create(authorizeUrl).getRawQuery());
		if (!"code".equals(query.get("response_type")) || !"S256".equals(query.get("code_challenge_method"))) {
			throw new AssertionError("not a PKCE authorization request: " + authorizeUrl);
		}
		String code = "code-" + UUID.randomUUID();
		this.grants.put(code, new Grant(query.get("code_challenge"), query.get("redirect_uri"), query.get("client_id"),
				username.toLowerCase(), username));
		return code;
	}

	@Override
	public void close() {
		this.server.stop(0);
	}

	private void token(HttpExchange exchange) throws IOException {
		if (forced(exchange)) {
			return;
		}
		Map<String, String> form = parse(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
		Grant grant = this.grants.remove(String.valueOf(form.get("code")));
		boolean valid = grant != null && "authorization_code".equals(form.get("grant_type"))
				&& grant.challenge().equals(challengeOf(form.getOrDefault("code_verifier", "")))
				&& grant.redirectUri().equals(form.get("redirect_uri"))
				&& grant.clientId().equals(form.get("client_id"));
		if (!valid) {
			reply(exchange, 400, "{\"error\":\"invalid_grant\"}");
			return;
		}
		String token = "lip_" + UUID.randomUUID().toString().replace("-", "");
		this.tokens.put(token, new String[] { grant.userId(), grant.username() });
		reply(exchange, 200, "{\"token_type\":\"Bearer\",\"access_token\":\"" + token + "\",\"expires_in\":31536000}");
	}

	private void account(HttpExchange exchange) throws IOException {
		if (forced(exchange)) {
			return;
		}
		String auth = String.valueOf(exchange.getRequestHeaders().getFirst("Authorization"));
		String[] user = this.tokens.get(auth.replaceFirst("^Bearer ", ""));
		if (user == null) {
			reply(exchange, 401, "{\"error\":\"No such token\"}");
			return;
		}
		reply(exchange, 200, "{\"id\":\"" + user[0] + "\",\"username\":\"" + user[1] + "\",\"perfs\":{}}");
	}

	private boolean forced(HttpExchange exchange) throws IOException {
		if (this.forcedStatus == 0) {
			return false;
		}
		reply(exchange, this.forcedStatus, "{\"error\":\"forced by test\"}");
		return true;
	}

	private static void reply(HttpExchange exchange, int status, String json) throws IOException {
		byte[] body = json.getBytes(StandardCharsets.UTF_8);
		exchange.getResponseHeaders().set("Content-Type", "application/json");
		exchange.sendResponseHeaders(status, body.length);
		try (var out = exchange.getResponseBody()) {
			out.write(body);
		}
	}

	private static Map<String, String> parse(String encoded) {
		if (encoded == null || encoded.isEmpty()) {
			return Map.of();
		}
		return Arrays.stream(encoded.split("&"))
			.map((pair) -> pair.split("=", 2))
			.collect(Collectors.toMap((kv) -> decode(kv[0]), (kv) -> (kv.length > 1) ? decode(kv[1]) : "",
					(first, second) -> second));
	}

	private static String decode(String value) {
		return URLDecoder.decode(value, StandardCharsets.UTF_8);
	}

	private static String challengeOf(String verifier) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
			return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException(ex);
		}
	}

}
