package dev.royalegambit.authprofile.common;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * The few bits of crypto plumbing the service needs, kept in one place so nobody reaches
 * for {@code java.util.Random} or {@code Arrays.equals} on a secret by accident.
 */
public final class Secrets {

	private static final SecureRandom RANDOM = new SecureRandom();

	private static final Base64.Encoder URL_SAFE = Base64.getUrlEncoder().withoutPadding();

	private Secrets() {
	}

	/** 256 random bits as unpadded base64url: refresh tokens and anything like them. */
	public static String opaqueToken() {
		byte[] bytes = new byte[32];
		RANDOM.nextBytes(bytes);
		return URL_SAFE.encodeToString(bytes);
	}

	/** A six-digit sign-in code, leading zeros kept. */
	public static String signInCode() {
		return "%06d".formatted(RANDOM.nextInt(1_000_000));
	}

	/**
	 * SHA-256 over the parts, each prefixed with its length so ("a", "bc") and ("ab",
	 * "c") never collide.
	 */
	public static byte[] sha256(String... parts) {
		MessageDigest digest = newDigest();
		for (String part : parts) {
			byte[] bytes = part.getBytes(StandardCharsets.UTF_8);
			digest.update(ByteBuffer.allocate(Integer.BYTES).putInt(bytes.length).array());
			digest.update(bytes);
		}
		return digest.digest();
	}

	/** PKCE S256 (RFC 7636): base64url(SHA-256(verifier)), no padding. */
	public static String pkceChallenge(String verifier) {
		return URL_SAFE.encodeToString(newDigest().digest(verifier.getBytes(StandardCharsets.US_ASCII)));
	}

	/**
	 * Constant-time comparison, so response timing says nothing about how close a guess
	 * was.
	 */
	public static boolean sameHash(byte[] a, byte[] b) {
		return MessageDigest.isEqual(a, b);
	}

	private static MessageDigest newDigest() {
		try {
			return MessageDigest.getInstance("SHA-256");
		}
		catch (NoSuchAlgorithmException ex) {
			// Every JVM must ship SHA-256; if it is missing the runtime itself
			// is broken.
			throw new IllegalStateException("SHA-256 is not available", ex);
		}
	}

}
