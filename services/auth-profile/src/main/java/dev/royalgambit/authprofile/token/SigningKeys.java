package dev.royalgambit.authprofile.token;

import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The RSA key we sign access tokens with. It comes from the environment in every real
 * deployment; a generated key is allowed only when someone asks for it explicitly,
 * because a silent fallback would log everybody out on each restart and differ between
 * replicas. The key id is the RFC 7638 thumbprint, so the same key always gets the same
 * kid and a rotation never needs a hand-picked name.
 */
public class SigningKeys {

	private static final Logger log = LoggerFactory.getLogger(SigningKeys.class);

	private static final Pattern PUBLIC_PEM = Pattern
		.compile("-----BEGIN PUBLIC KEY-----([A-Za-z0-9+/=\\s]+)-----END PUBLIC KEY-----");

	private final RSAKey active;

	private final List<RSAKey> retired;

	public SigningKeys(JwtSettings settings) {
		if (!settings.privateKey().isBlank()) {
			this.active = describe(fromPem(settings.privateKey()));
		}
		else if (settings.ephemeralKey()) {
			log.warn("signing with a throwaway key: tokens stop working when this process stops");
			this.active = describe(generated());
		}
		else {
			throw new IllegalStateException(
					"JWT_PRIVATE_KEY is not set. Set it to a PKCS#8 PEM RSA key, or JWT_EPHEMERAL_KEY=true for local dev.");
		}
		this.retired = retiredFromPem(settings.retiredPublicKeys());
	}

	/** Public and private halves, for signing. */
	public RSAKey active() {
		return this.active;
	}

	/**
	 * What the gateway may see and what we verify with: the public half of the active key
	 * and of each retired one. A rotation is: new JWT_PRIVATE_KEY, old key's public half
	 * in JWT_RETIRED_PUBLIC_KEYS until its last token expires (15 minutes), then drop it.
	 */
	public JWKSet publicSet() {
		List<JWK> keys = new ArrayList<>();
		keys.add(this.active.toPublicJWK());
		keys.addAll(this.retired);
		return new JWKSet(keys);
	}

	private static RSAKey describe(RSAPrivateCrtKey privateKey) {
		try {
			RSAPublicKey publicKey = (RSAPublicKey) KeyFactory.getInstance("RSA")
				.generatePublic(new RSAPublicKeySpec(privateKey.getModulus(), privateKey.getPublicExponent()));
			RSAKey unnamed = new RSAKey.Builder(publicKey).build();
			return new RSAKey.Builder(publicKey).privateKey(privateKey)
				.keyUse(KeyUse.SIGNATURE)
				.algorithm(JWSAlgorithm.RS256)
				.keyID(unnamed.computeThumbprint().toString())
				.build();
		}
		catch (GeneralSecurityException | JOSEException ex) {
			throw new IllegalStateException("cannot derive the public signing key", ex);
		}
	}

	private static List<RSAKey> retiredFromPem(String pems) {
		if (pems.isBlank()) {
			return List.of();
		}
		Matcher blocks = PUBLIC_PEM.matcher(pems);
		List<RSAKey> keys = new ArrayList<>();
		while (blocks.find()) {
			try {
				byte[] der = Base64.getDecoder().decode(blocks.group(1).replaceAll("\\s", ""));
				RSAPublicKey key = (RSAPublicKey) KeyFactory.getInstance("RSA")
					.generatePublic(new X509EncodedKeySpec(der));
				RSAKey unnamed = new RSAKey.Builder(key).build();
				keys.add(new RSAKey.Builder(key).keyUse(KeyUse.SIGNATURE)
					.algorithm(JWSAlgorithm.RS256)
					.keyID(unnamed.computeThumbprint().toString())
					.build());
			}
			catch (IllegalArgumentException | GeneralSecurityException | ClassCastException | JOSEException ex) {
				throw new IllegalStateException("JWT_RETIRED_PUBLIC_KEYS holds something that is not an RSA public key",
						ex);
			}
		}
		// Anything that is not a public key block (a private key pasted by mistake, a
		// PKCS#1 block, literal \n from a .env file) must stop the start: ignoring it
		// would log out everyone holding a token from the old key.
		if (keys.isEmpty() || !PUBLIC_PEM.matcher(pems).replaceAll("").isBlank()) {
			throw new IllegalStateException(
					"JWT_RETIRED_PUBLIC_KEYS must hold only '-----BEGIN PUBLIC KEY-----' blocks");
		}
		return List.copyOf(keys);
	}

	private static RSAPrivateCrtKey fromPem(String pem) {
		String base64 = pem.replaceAll("-----(BEGIN|END) PRIVATE KEY-----", "").replaceAll("\\s", "");
		try {
			byte[] der = Base64.getDecoder().decode(base64);
			return (RSAPrivateCrtKey) KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der));
		}
		catch (IllegalArgumentException | GeneralSecurityException | ClassCastException ex) {
			// Never echo the key material itself into the logs.
			throw new IllegalStateException("JWT_PRIVATE_KEY is not a PKCS#8 PEM RSA private key", ex);
		}
	}

	private static RSAPrivateCrtKey generated() {
		try {
			KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
			generator.initialize(2048);
			return (RSAPrivateCrtKey) generator.generateKeyPair().getPrivate();
		}
		catch (GeneralSecurityException ex) {
			throw new IllegalStateException("cannot generate an RSA key", ex);
		}
	}

}
