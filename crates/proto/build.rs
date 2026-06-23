fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure()
        .protoc_arg("--proto_path=../../proto")
        .compile_protos(
            &[
                "../../proto/insights/v1/types.proto",
                "../../proto/insights/v1/insights_service.proto",
            ],
            &["../../proto"],
        )?;
    Ok(())
}
