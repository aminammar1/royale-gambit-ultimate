package dev.royalgambit.authprofile.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import dev.royalgambit.authprofile.common.Secrets;
import dev.royalgambit.authprofile.common.UuidV7;
import dev.royalgambit.authprofile.events.Outbox;
import dev.royalgambit.authprofile.events.UserRegistered;
import dev.royalgambit.authprofile.token.Role;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.mail.MailException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Passwordless sign-in: we mail a six-digit code, the player types it back. */
@Service
public class EmailSignIn {

	private static final Logger log = LoggerFactory.getLogger(EmailSignIn.class);

	/**
	 * What checking a code can end in. Decided inside the transaction, acted on after it.
	 */
	private sealed interface Outcome {

		record Accepted(UUID userId) implements Outcome {
		}

		record WrongCode(int attemptsLeft) implements Outcome {
		}

		record NoUsableCode() implements Outcome {
		}

	}

	private final EmailCodes codes;

	private final Accounts accounts;

	private final Sessions sessions;

	private final Outbox outbox;

	private final CodeMailer mailer;

	private final EmailCodeSettings settings;

	private final TransactionTemplate transaction;

	EmailSignIn(EmailCodes codes, Accounts accounts, Sessions sessions, Outbox outbox, CodeMailer mailer,
			EmailCodeSettings settings, TransactionTemplate transaction) {
		this.codes = codes;
		this.accounts = accounts;
		this.sessions = sessions;
		this.outbox = outbox;
		this.mailer = mailer;
		this.settings = settings;
		this.transaction = transaction;
	}

	/**
	 * Mails a fresh code. Says nothing about whether the address has an account, and
	 * inside the cooldown it quietly sends nothing, so a script cannot mail-bomb someone
	 * through us.
	 */
	public void start(String rawEmail) {
		String email = normalize(rawEmail);
		if (this.codes.sentWithin(email, this.settings.resendCooldown())) {
			return;
		}
		// Without a cap, five guesses a minute add up: about one account in
		// five over a month. The cap also stops this endpoint from mailing
		// someone all day long.
		EmailCodes.SentCounts sent = this.codes.sentCounts(email);
		if (sent.lastDay() >= this.settings.maxPerDay()) {
			throw AuthProblem.tooManyCodes(Duration.ofDays(1));
		}
		if (sent.lastHour() >= this.settings.maxPerHour()) {
			throw AuthProblem.tooManyCodes(Duration.ofHours(1));
		}
		UUID id = UuidV7.next();
		String code = Secrets.signInCode();
		this.codes.replace(id, email, hash(id, code), this.settings.attempts(), this.settings.ttl());
		try {
			this.mailer.send(email, code);
		}
		catch (MailException ex) {
			// The player never got this code; retire it so the cooldown does
			// not block a retry.
			this.codes.consume(id);
			log.warn("sign-in code could not be mailed", ex);
			throw AuthProblem.mailUnavailable();
		}
	}

	public TokenPair verify(String rawEmail, String code) {
		String email = normalize(rawEmail);
		// The wrong-guess counter must be saved even though we answer with an
		// error, so the outcome is decided in the transaction and the exception
		// thrown after it commits.
		Outcome outcome = this.transaction.execute((status) -> check(email, code));
		return switch (outcome) {
			case Outcome.Accepted accepted -> this.sessions.open(accepted.userId(), Role.USER);
			case Outcome.WrongCode wrong -> throw AuthProblem.codeInvalid(wrong.attemptsLeft());
			case Outcome.NoUsableCode none -> throw AuthProblem.codeExpired();
			case null -> throw new IllegalStateException("transaction returned no outcome");
		};
	}

	private Outcome check(String email, String code) {
		Optional<EmailCodes.ActiveCode> usable = this.codes.lockUsable(email);
		if (usable.isEmpty()) {
			return new Outcome.NoUsableCode();
		}
		EmailCodes.ActiveCode active = usable.get();
		if (!Secrets.sameHash(active.hash(), hash(active.id(), code))) {
			return new Outcome.WrongCode(this.codes.spendAttempt(active.id()));
		}
		this.codes.consume(active.id());
		return new Outcome.Accepted(this.accounts.findBy(Provider.EMAIL, email).orElseGet(() -> register(email)));
	}

	private UUID register(String email) {
		UUID userId = this.accounts.createWith(Provider.EMAIL, email, null);
		this.outbox.append(UserRegistered.TYPE, new UserRegistered(userId, Instant.now()));
		return userId;
	}

	/** The code is salted with its row id, so equal codes never share a hash. */
	private static byte[] hash(UUID codeId, String code) {
		return Secrets.sha256(codeId.toString(), code);
	}

	/** One account per mailbox, however the address is typed. */
	static String normalize(String email) {
		return email.strip().toLowerCase(Locale.ROOT);
	}

}
