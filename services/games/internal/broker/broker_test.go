package broker_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync/atomic"
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/testcontainers/testcontainers-go"
	tcrabbit "github.com/testcontainers/testcontainers-go/modules/rabbitmq"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/broker"
)

var url string

func TestMain(m *testing.M) {
	ctx := context.Background()
	c, err := tcrabbit.Run(ctx, "rabbitmq:4.4.1-management-alpine")
	if err != nil {
		fmt.Println("rabbitmq:", err)
		os.Exit(1)
	}
	url, _ = c.AmqpURL(ctx)
	code := m.Run()
	_ = testcontainers.TerminateContainer(c)
	os.Exit(code)
}

func TestPublishThenConsume(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	b, err := broker.Dial(url)
	if err != nil {
		t.Fatal(err)
	}
	// Stop the consumer before the connection closes under it.
	defer func() { cancel(); b.Close() }()
	got := make(chan string, 1)
	go func() {
		err := b.Consume(ctx, "test.ok", "thing.happened", 1, func(_ context.Context, d amqp.Delivery) error {
			got <- string(d.Body)
			return nil
		})
		if err != nil && ctx.Err() == nil {
			t.Errorf("consume: %v", err)
		}
	}()
	waitReady(t, b, "test.ok")
	if err := b.Publish(ctx, "thing.happened", "id-1", []byte(`{"a":1}`)); err != nil {
		t.Fatal(err)
	}
	select {
	case body := <-got:
		if body != `{"a":1}` {
			t.Fatalf("body %s", body)
		}
	case <-ctx.Done():
		t.Fatal("nothing consumed")
	}
}

func TestFailingMessageIsDeadLetteredAfterThreeRetries(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	b, err := broker.Dial(url)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { cancel(); b.Close() }()
	var tries atomic.Int32
	go func() {
		_ = b.Consume(ctx, "test.fail", "thing.failed", 1, func(context.Context, amqp.Delivery) error {
			tries.Add(1)
			return errors.New("cannot handle it")
		})
	}()
	waitReady(t, b, "test.fail")
	if err := b.Publish(ctx, "thing.failed", "id-2", []byte(`{}`)); err != nil {
		t.Fatal(err)
	}
	for ctx.Err() == nil {
		n, _, err := b.Depth("test.fail.dead")
		if err == nil && n == 1 {
			// The first delivery and three redeliveries, then the dead-letter queue.
			if got := tries.Load(); got < 3 || got > 4 {
				t.Fatalf("handled %d times", got)
			}
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("never dead-lettered after %d tries", tries.Load())
}

func waitReady(t *testing.T, b *broker.Broker, queue string) {
	t.Helper()
	for i := 0; i < 100; i++ {
		if _, consumers, err := b.Depth(queue); err == nil && consumers > 0 {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("queue %s never had a consumer", queue)
}
