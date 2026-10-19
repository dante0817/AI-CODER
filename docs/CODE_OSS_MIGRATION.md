# Code-OSS Product Migration

The production AI-CODER target is a rebranded Code-OSS distribution, not a VS Code extension.

The desktop MVP intentionally keeps these components independent of the UI:

- model/provider registry
- automatic provider/model/effort router
- context engine
- policy engine
- agent-plan validation
- checkpoint store
- activity ledger
- credential broker

For the Code-OSS phase, replace the Tkinter UI adapters with Code-OSS workbench services while preserving these boundaries conceptually. The first Code-OSS milestone should expose the AI Workbench directly in the product workbench, change product branding/application IDs, use Code-OSS secret storage/keychain integration, and replace Python filesystem/editor adapters with native TypeScript workbench services.

Do not return to a VSIX-only product architecture. A temporary extension can be used only as a development harness during migration.
