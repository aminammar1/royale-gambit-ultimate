package dev.royalgambit.authprofile.auth;

import org.springframework.mail.MailSender;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.stereotype.Component;

/**
 * Sends the sign-in code. Plain text on purpose: it renders everywhere and is hard to
 * fake.
 */
@Component
class CodeMailer {

	private final MailSender sender;

	private final EmailCodeSettings settings;

	CodeMailer(MailSender sender, EmailCodeSettings settings) {
		this.sender = sender;
		this.settings = settings;
	}

	void send(String to, String code) {
		SimpleMailMessage message = new SimpleMailMessage();
		message.setFrom(this.settings.from());
		message.setTo(to);
		// Code first in the subject: most mail apps show it in the
		// notification.
		message.setSubject(code + " is your Royal Gambit sign-in code");
		message.setText("""
				Your sign-in code is %s

				It works once, for %d minutes. If you did not ask for it, ignore this mail.
				""".formatted(code, this.settings.ttl().toMinutes()));
		this.sender.send(message);
	}

}
