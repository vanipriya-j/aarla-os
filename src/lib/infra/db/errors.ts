export class DatabaseUnavailableError extends Error {
  constructor(message = "Local database is unavailable. Start it with npm run db:start, then migrate and seed.") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}
