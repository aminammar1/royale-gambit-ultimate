package app

import "time"

// SetKeepAlive shortens the stream keep-alive for a test.
func SetKeepAlive(d time.Duration) func() {
	old := keepAlive
	keepAlive = d
	return func() { keepAlive = old }
}
