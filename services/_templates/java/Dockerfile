# syntax=docker/dockerfile:1
# toolchain: used by `make check-svc` (tests run here) and as the build base.
FROM eclipse-temurin:25.0.5.1_2-jdk-noble AS toolchain
RUN apt-get update && apt-get install -y --no-install-recommends make && rm -rf /var/lib/apt/lists/*
WORKDIR /src

FROM toolchain AS build
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -q dependency:go-offline
COPY src src
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -q -DskipTests -Dspring-javaformat.skip=true package \
 && cp target/*.jar /app.jar

FROM eclipse-temurin:25.0.5.1_2-jre-noble
RUN useradd --system --uid 10001 app
WORKDIR /app
COPY --from=build /app.jar app.jar
ENV PORT=8103 JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
USER app
EXPOSE 8103
# No curl in the image: ask /health/live over bash's /dev/tcp.
HEALTHCHECK --interval=5s --timeout=3s --start-period=30s --retries=10 CMD ["bash", "-c", \
  "exec 3<>/dev/tcp/127.0.0.1/${PORT} && printf 'GET /health/live HTTP/1.0\\r\\nHost: localhost\\r\\n\\r\\n' >&3 && head -1 <&3 | grep -q ' 200 '"]
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
