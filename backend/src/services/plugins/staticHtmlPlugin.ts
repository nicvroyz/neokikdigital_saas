import { FrameworkPlugin } from './pluginInterface';

function log(msg: string) {
  console.log(`[STATIC HTML PLUGIN] ${msg}`);
}

export const staticHtmlPlugin: FrameworkPlugin = {
  name: 'HTML',

  async onProvision(domain: string, dbConfig: any): Promise<void> {
    log(`Provisionando sitio HTML estático para: ${domain}`);
  },

  async onMigrate(domain: string, extractedPath: string, dbConfig: any): Promise<void> {
    log(`Migrando sitio HTML estático para: ${domain}`);
  },

  async onVerify(domain: string): Promise<boolean> {
    return true;
  },

  async getMigrationCommands(domain: string, extractedPath: string): Promise<string[]> {
    return [];
  }
};
