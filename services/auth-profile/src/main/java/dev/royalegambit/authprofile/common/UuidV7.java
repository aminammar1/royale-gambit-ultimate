package dev.royalegambit.authprofile.common;

import java.security.SecureRandom;
import java.util.UUID;

/** RFC 9562 UUIDv7: 48-bit Unix milliseconds, version 7, variant 10, 74 random bits. */
public final class UuidV7 {

	private static final SecureRandom RANDOM = new SecureRandom();

	private UuidV7() {
	}

	public static UUID next() {
		return at(System.currentTimeMillis());
	}

	static UUID at(long unixMillis) {
		long randA = RANDOM.nextLong() & 0xFFFL;
		long msb = (unixMillis << 16) | 0x7000L | randA;
		long lsb = (RANDOM.nextLong() & 0x3FFFFFFFFFFFFFFFL) | 0x8000000000000000L;
		return new UUID(msb, lsb);
	}

}
