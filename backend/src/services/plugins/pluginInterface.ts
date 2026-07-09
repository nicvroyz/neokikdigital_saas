export interface FrameworkPlugin {
  name: string;
  onProvision(domain: string, dbConfig: any): Promise<void>;
  onMigrate(domain: string, extractedPath: string, dbConfig: any): Promise<void>;
  onVerify(domain: string): Promise<boolean>;
  getMigrationCommands(domain: string, extractedPath: string): Promise<string[]>;
}
