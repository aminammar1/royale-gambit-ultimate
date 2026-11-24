package dev.royalgambit.service.items;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;

class UuidV7Test {

	@Test
	void hasVersionVariantAndTimestamp() {
		long now = 1_764_000_000_000L;
		UUID id = UuidV7.at(now);
		assertThat(id.version()).isEqualTo(7);
		assertThat(id.variant()).isEqualTo(2);
		assertThat(id.getMostSignificantBits() >>> 16).isEqualTo(now);
	}

	@Test
	void sortsByTime() {
		assertThat(UuidV7.at(1000).toString()).isLessThan(UuidV7.at(2000).toString());
	}

}
