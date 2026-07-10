import { query } from '../config/db';
import { dockerService } from './dockerService';
import { databaseService } from './databaseService';
import { sslService } from './sslService';
import { mailcowService } from './mailcowService';
import crypto from 'crypto';

function log(msg: string) {
  console.log(`[PROVISIONING SERVICE] ${msg}`);
}

export const provisioningService = {
  async getProvision(id: string) {
    const res = await query('SELECT * FROM provisions WHERE id = $1', [id]);
    return res.rows[0];
  },

  async getAllProvisions() {
    const res = await query('SELECT * FROM provisions ORDER BY created_at DESC');
    return res.rows;
  },

  async createProvision(data: { clientId: string; domain: string; projectType: string; manageHosting: boolean; manageEmail: boolean; emailAccounts?: string[] }) {
    log(`Registrando nuevo aprovisionamiento para: ${data.domain}`);
    
    const res = await query(
      `INSERT INTO provisions (client_id, domain, project_type, manage_hosting, manage_email, email_accounts, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING') RETURNING *`,
      [data.clientId || null, data.domain, data.projectType, data.manageHosting, data.manageEmail, JSON.stringify(data.emailAccounts || [])]
    );

    return res.rows[0];
  },

  async executeProvision(provisionId: string) {
    log(`Iniciando ejecución de aprovisionamiento: ${provisionId}`);
    
    const prov = await this.getProvision(provisionId);
    if (!prov) throw new Error('Aprovisionamiento no encontrado');

    const domain = prov.domain;
    
    // Update status to PROVISIONING
    await query('UPDATE provisions SET status = \'PROVISIONING\', updated_at = $1 WHERE id = $2', [new Date().toISOString(), provisionId]);

    try {
      // 1. Manage Hosting
      if (prov.manage_hosting) {
        log(`Creando contenedor web y base de datos para ${domain}...`);
        
        // Create DB
        const dbName = `db_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const dbUser = `user_${domain.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 10)}`;
        const dbPass = `Pass_${crypto.randomBytes(4).toString('hex')}!`;
        
        await databaseService.createDatabase(dbName, dbUser, dbPass);
        
        // Create Container
        await dockerService.createContainer(domain, prov.project_type || 'WORDPRESS', '8.2', dbName, dbUser, dbPass);
        
        // Configure SSL on proxy Caddy
        await sslService.configureSSL(domain);
      }

      // 2. Manage Email
      if (prov.manage_email) {
        log(`Configurando Mailcow para ${domain}...`);
        await mailcowService.createDomain(domain);
        
        const accounts = prov.email_accounts || [];
        for (const account of accounts) {
          const mailboxName = typeof account === 'string' ? account : (account as any).name;
          if (mailboxName) {
            await mailcowService.createMailbox({
              local_part: mailboxName,
              domain,
              password: `Pass_${crypto.randomBytes(4).toString('hex')}!`,
              quota: 1024
            });
          }
        }
      }

      // Update to COMPLETED
      await query(
        `UPDATE provisions 
         SET status = 'COMPLETED', 
             completed_at = $1, 
             updated_at = $2 
         WHERE id = $3`,
        [new Date().toISOString(), new Date().toISOString(), provisionId]
      );
      log(`Aprovisionamiento completado con éxito para ${domain}`);

    } catch (err) {
      const errMsg = (err as Error).message || 'Error desconocido';
      log(`Error crítico al ejecutar aprovisionamiento: ${errMsg}`);
      
      await query('UPDATE provisions SET status = \'FAILED\', updated_at = $1 WHERE id = $2', [new Date().toISOString(), provisionId]);
      
      // Attempt rollback if hosting container was created
      if (prov.manage_hosting) {
        try {
          await dockerService.removeContainer(domain);
          const dbName = `db_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;
          await databaseService.dropDatabase(dbName);
        } catch { /* ignore */ }
      }
      
      throw err;
    }
  }
};
