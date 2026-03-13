# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of Prompt by Prompt seriously. If you have discovered a security vulnerability, please report it to us.

### How to Report

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via GitHub Security Advisories:

1. Go to the [Security Advisories](https://github.com/your-username/prompt-by-prompt/security/advisories) page
2. Click "Report a vulnerability"
3. Fill in the details

You should receive a response within 48 hours. If for some reason you do not, please follow up via email.

### What to Include

Please include the following information:

- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability

### Security Best Practices

When using Prompt by Prompt:

1. **API Keys**: Never commit API keys to version control. Use VS Code settings or environment variables.
2. **Prompt Content**: Be cautious about including sensitive data in prompts.
3. **Local Models**: When using Ollama, ensure your local instance is properly secured.
4. **Network**: The extension makes network requests to LLM APIs. Ensure your network is secure.

### Data Privacy

- Prompt by Prompt does not collect or transmit any user data to external servers.
- All prompts are stored locally in your workspace.
- API calls are made directly from your machine to the configured LLM providers.

## Security Updates

Security updates will be released as patch versions and announced via:
- GitHub Releases
- VS Code Marketplace update notes

Thank you for helping keep Prompt by Prompt secure!
