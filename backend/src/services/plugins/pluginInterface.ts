export interface FrameworkPlugin {
  name: string;
  onProvision(domain: string, dbConfig: any): Promise<void>;
  onMigrate(domain: string, extractedPath: string, dbConfig: any): Promise<void>;
  onVerify(domain: string): Promise<boolean>;
  getMigrationCommands(domain: string, extractedPath: string): Promise<string[]>;
  detectDocumentRoot?(extractedPath: string): string;
  configureDatabaseConfig?(docRoot: string, dbConfig: any): Promise<void>;
  detectOriginalDomain?(containerName: string, docRoot: string): Promise<string | null>;
  runHealthCheck?(domain: string, containerName: string, docRoot: string): Promise<boolean>;
  verifyDatabaseReady?(dbName: string, docRoot: string): Promise<void>;
  ensureWordpressDatabaseConnection?(containerName: string): Promise<void>;
  fixPermissions?(containerName: string, siteRoot: string): Promise<void>;
}
