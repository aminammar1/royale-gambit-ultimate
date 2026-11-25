package dev.royalgambit.authprofile.token;

import java.time.Duration;
import java.util.Map;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public keys for whoever verifies our tokens (the gateway, other services). A short
 * cache lifetime keeps key rotations quick to spread without every request coming back
 * here.
 */
@RestController
class JwksController {

	private final SigningKeys keys;

	JwksController(SigningKeys keys) {
		this.keys = keys;
	}

	@GetMapping("/.well-known/jwks.json")
	ResponseEntity<Map<String, Object>> jwks() {
		return ResponseEntity.ok()
			.cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
			.body(this.keys.publicSet().toJSONObject());
	}

}
