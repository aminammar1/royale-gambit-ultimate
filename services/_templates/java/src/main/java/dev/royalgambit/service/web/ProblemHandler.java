package dev.royalgambit.service.web;

import java.net.URI;

import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** Every error leaves as RFC 9457 application/problem+json with the trace_id. */
@RestControllerAdvice
class ProblemHandler extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ProblemHandler.class);

	private final Tracer tracer;

	ProblemHandler(Tracer tracer) {
		this.tracer = tracer;
	}

	@ExceptionHandler(Exception.class)
	ResponseEntity<Object> unexpected(Exception ex, WebRequest request) {
		log.error("unhandled error", ex);
		ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "unexpected error");
		return handleExceptionInternal(ex, body, new HttpHeaders(), HttpStatus.INTERNAL_SERVER_ERROR, request);
	}

	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		String detail = ex.getFieldErrors()
			.stream()
			.findFirst()
			.map(e -> e.getField() + ": " + e.getDefaultMessage())
			.orElse("invalid request");
		return handleExceptionInternal(ex, ProblemDetail.forStatusAndDetail(status, detail), headers, status, request);
	}

	/**
	 * Adds the members the Go and Python templates always send: Spring omits {@code type}
	 * when it is {@code about:blank}, and the trace_id ties the error to the logs.
	 */
	private void complete(ProblemDetail problem, WebRequest request) {
		if (problem.getType() == null || "about:blank".equals(problem.getType().toString())) {
			problem.setProperty("type", "about:blank");
		}
		if (problem.getInstance() == null && request instanceof ServletWebRequest servlet) {
			problem.setInstance(URI.create(servlet.getRequest().getRequestURI()));
		}
		Span span = this.tracer.currentSpan();
		if (span != null) {
			problem.setProperty("trace_id", span.context().traceId());
		}
	}

	@Override
	protected ResponseEntity<Object> createResponseEntity(Object body, HttpHeaders headers, HttpStatusCode status,
			WebRequest request) {
		if (body instanceof ProblemDetail problem) {
			complete(problem, request);
		}
		return super.createResponseEntity(body, headers, status, request);
	}

}
