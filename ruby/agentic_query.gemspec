# frozen_string_literal: true
Gem::Specification.new do |spec|
  spec.name = 'agentic_query'
  spec.version = '0.1.0'
  spec.authors = ['Shubham Taywade']
  spec.email = ['shubhamtaywade82@gmail.com']
  spec.summary = 'ORM-native AI query runtime for Ruby and Rails'
  spec.description = 'Deterministic query contracts and policy enforcement for AI-assisted database access in Ruby applications.'
  spec.homepage = 'https://github.com/shubhamtaywade82/agentic-query'
  spec.license = 'MIT'
  spec.required_ruby_version = '>= 3.1'
  spec.files = Dir['lib/**/*', 'LICENSE', 'README.md', 'CHANGELOG.md']
  spec.require_paths = ['lib']
end
