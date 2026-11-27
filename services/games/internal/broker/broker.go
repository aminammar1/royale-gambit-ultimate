// Package broker publishes events to RabbitMQ's rg.events topic exchange and consumes them
// (ADR-11). Publishing waits for the broker's confirm. Consuming retries a failed message three
// times, then hands it to the dead-letter exchange rg.dlx. The retries are counted here, in an
// x-retries header: RabbitMQ 4 does not count a requeued nack against a queue's delivery limit.
package broker

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	// Exchange carries every event; the routing key is its type.
	Exchange = "rg.events"
	// DeadLetters receives what failed too often.
	DeadLetters = "rg.dlx"
	// retries is how many more tries a failing message gets.
	retries     = 3
	retryHeader = "x-retries"
)

// backoff is the pause before a failed message is tried again (1, 2, 3 times this).
var backoff = 500 * time.Millisecond

// Broker is one connection, with a confirmed channel for publishing.
type Broker struct {
	conn *amqp.Connection
	mu   sync.Mutex
	pub  *amqp.Channel
}

// Dial connects and declares the two exchanges (idempotent: compose also defines them).
func Dial(url string) (*Broker, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, fmt.Errorf("RABBITMQ_URL: %w", err)
	}
	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	for _, name := range []string{Exchange, DeadLetters} {
		if err := ch.ExchangeDeclare(name, "topic", true, false, false, false, nil); err != nil {
			_ = conn.Close()
			return nil, err
		}
	}
	if err := ch.Confirm(false); err != nil {
		_ = conn.Close()
		return nil, err
	}
	return &Broker{conn: conn, pub: ch}, nil
}

// Close ends the connection.
func (b *Broker) Close() { _ = b.conn.Close() }

// Ping reports whether the connection is up.
func (b *Broker) Ping() error {
	if b.conn.IsClosed() {
		return errors.New("rabbitmq connection closed")
	}
	return nil
}

// Publish sends body under routingKey and waits for the broker to confirm it.
func (b *Broker) Publish(ctx context.Context, routingKey, messageID string, body []byte) error {
	return b.send(ctx, Exchange, routingKey, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		MessageId:    messageID,
		Timestamp:    time.Now(),
		Body:         body,
	})
}

func (b *Broker) send(ctx context.Context, exchange, key string, msg amqp.Publishing) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	conf, err := b.pub.PublishWithDeferredConfirmWithContext(ctx, exchange, key, true, false, msg)
	if err != nil {
		return err
	}
	ok, err := conf.WaitContext(ctx)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("the broker refused the event")
	}
	return nil
}

// Declare creates queue (quorum, bound to routingKey on rg.events) and its dead-letter queue
// <queue>.dead. Call it before anything publishes routingKey: a message published before the
// binding exists is dropped.
func (b *Broker) Declare(queue, routingKey string) error {
	ch, err := b.conn.Channel()
	if err != nil {
		return err
	}
	defer ch.Close()
	dead := queue + ".dead"
	if _, err := ch.QueueDeclare(dead, true, false, false, false, amqp.Table{"x-queue-type": "quorum"}); err != nil {
		return err
	}
	if err := ch.QueueBind(dead, routingKey, DeadLetters, false, nil); err != nil {
		return err
	}
	if _, err := ch.QueueDeclare(queue, true, false, false, false, amqp.Table{
		"x-queue-type":           "quorum",
		"x-dead-letter-exchange": DeadLetters,
		// A retried copy travels under the queue's name; dead letters keep the event's own key.
		"x-dead-letter-routing-key": routingKey,
	}); err != nil {
		return err
	}
	return ch.QueueBind(queue, routingKey, Exchange, false, nil)
}

// Consume declares queue (see Declare) and handles its messages until ctx ends or the connection
// drops. A handler error sends the message back to the queue for another try, after a pause;
// after three retries it is dead-lettered.
func (b *Broker) Consume(ctx context.Context, queue, routingKey string, prefetch int,
	handle func(context.Context, amqp.Delivery) error) error {
	if err := b.Declare(queue, routingKey); err != nil {
		return err
	}
	ch, err := b.conn.Channel()
	if err != nil {
		return err
	}
	defer ch.Close()
	if err := ch.Qos(prefetch, 0, false); err != nil {
		return err
	}
	deliveries, err := ch.Consume(queue, "", false, false, false, false, nil)
	if err != nil {
		return err
	}
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case d, ok := <-deliveries:
			if !ok {
				return errors.New("rabbitmq closed the consumer")
			}
			if err := handle(ctx, d); err != nil {
				b.retry(ctx, queue, d)
				continue
			}
			_ = d.Ack(false)
		}
	}
}

// retry puts a failed message back on its queue with one more x-retries, or dead-letters it
// once it has had its retries. If the copy cannot be published the original goes back instead.
func (b *Broker) retry(ctx context.Context, queue string, d amqp.Delivery) {
	n := 0
	if v, ok := d.Headers[retryHeader].(int32); ok {
		n = int(v)
	}
	if n >= retries {
		_ = d.Nack(false, false) // to rg.dlx, under its routing key
		return
	}
	select {
	case <-ctx.Done():
		_ = d.Nack(false, true)
		return
	case <-time.After(backoff * time.Duration(n+1)):
	}
	headers := amqp.Table{}
	for k, v := range d.Headers {
		headers[k] = v
	}
	headers[retryHeader] = int32(n + 1)
	// The default exchange routes to the queue by name: only this queue sees the retry.
	err := b.send(ctx, "", queue, amqp.Publishing{
		Headers: headers, ContentType: d.ContentType, DeliveryMode: amqp.Persistent,
		MessageId: d.MessageId, Timestamp: d.Timestamp, Body: d.Body,
	})
	if err != nil {
		_ = d.Nack(false, true)
		return
	}
	_ = d.Ack(false)
}

// Depth is how many messages wait in queue and how many consumers read it; an error when it
// does not exist.
func (b *Broker) Depth(queue string) (messages, consumers int, err error) {
	ch, err := b.conn.Channel()
	if err != nil {
		return 0, 0, err
	}
	defer ch.Close()
	q, err := ch.QueueDeclarePassive(queue, true, false, false, false, nil)
	if err != nil {
		return 0, 0, err
	}
	return q.Messages, q.Consumers, nil
}
