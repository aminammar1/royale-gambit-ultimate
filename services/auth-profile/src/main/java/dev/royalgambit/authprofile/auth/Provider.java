package dev.royalgambit.authprofile.auth;

import java.util.Locale;

/** Ways to prove who you are. The lowercase name is what the identities table stores. */
enum Provider {

	EMAIL, LICHESS;

	String id() {
		return name().toLowerCase(Locale.ROOT);
	}

}
