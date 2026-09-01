# frozen_string_literal: true

require_relative "lib/agentic_query/version"

Gem::Specification.new do |spec|
  spec.name = "agentic_query"
  spec.version = AgenticQuery::VERSION
  spec.authors = ["Shubham Taywade"]
  spec.summary = "ORM-native AI query runtime for Ruby and Rails"
  spec.description = "Deterministic query contracts and policy enforcement for AI-assisted database access in Ruby applications."
  spec.homepage = "https://github.com/shubhamtaywade82/agentic-query"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.1"
  spec.files = Dir["lib/**/*"].concat(
    ["LICENSE", "README.md", "CHANGELOG.md"].select { |file| File.exist?(File.expand_path(file, __dir__)) }
  )
  spec.require_paths = ["lib"]
  spec.add_runtime_dependency "activerecord", ">= 7.1", "< 9"
  spec.add_runtime_dependency "pg", ">= 1.5"
end
