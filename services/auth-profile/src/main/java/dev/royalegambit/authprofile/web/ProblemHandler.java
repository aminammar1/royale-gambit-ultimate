package dev.royalegambit.authprofile.web;

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
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.firewall.RequestRejectedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** Every error leaves as RFC 9457 application/problem+json with the trace_id. */
@RestControllerAdvice
class ProblemHandler extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ProblemHandler.class);

	private final Tracer tracer;

	ProblemHandler(Tracer tracer) {
		this.tracer = tracer;
	}

	/**
	 * A malformed multipart body (for example no boundary) is the client's mistake, not a
	 * 500.
	 */
	@ExceptionHandler(MultipartException.class)
	ResponseEntity<Object> malformedMultipart(MultipartException ex, WebRequest request) {
		ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "malformed multipart request");
		return handleExceptionInternal(ex, body, new HttpHeaders(), HttpStatus.BAD_REQUEST, request);
	}

	@ExceptionHandler(RequestRejectedException.class)
	ResponseEntity<Object> rejected(RequestRejectedException ex, WebRequest request) {
		// The reason names the rule that tripped; useful in our logs, not in
		// the client's hands.
		log.info("request rejected by the firewall: {}", ex.getMessage());
		ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "malformed request");
		return handleExceptionInternal(ex, body, new HttpHeaders(), HttpStatus.BAD_REQUEST, request);
	}

	@ExceptionHandler(AuthenticationException.class)
	ResponseEntity<Object> unauthenticated(AuthenticationException ex, WebRequest request) {
		HttpHeaders headers = new HttpHeaders();
		headers.set(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
		ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED,
				"a valid bearer token is required");
		return handleExceptionInternal(ex, body, headers, HttpStatus.UNAUTHORIZED, request);
	}

	@ExceptionHandler(AccessDeniedException.class)
	ResponseEntity<Object> forbidden(AccessDeniedException ex, WebRequest request) {
		ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "this account cannot do that");
		return handleExceptionInternal(ex, body, new HttpHeaders(), HttpStatus.FORBIDDEN, request);
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
