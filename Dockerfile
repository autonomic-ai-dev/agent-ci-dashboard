FROM rust:1.85-slim-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates/ crates/
COPY proto/ proto/
COPY migrations/ migrations/
RUN cargo build --release --workspace

FROM gcr.io/distroless/cc-debian12
COPY --from=builder /app/target/release/github-ingestor /usr/local/bin/
COPY --from=builder /app/target/release/insights-api /usr/local/bin/
EXPOSE 3001 3002
ENTRYPOINT ["/usr/local/bin/github-ingestor"]
